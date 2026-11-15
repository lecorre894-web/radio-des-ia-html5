import {chromium} from "playwright";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import {makeJobs,computeKernel,checksumResults} from "../addons/sparktiates/hybrid/engine.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url,"http://localhost").pathname;
  const full=path.resolve(root,"."+decodeURIComponent(pathname));
  if(!full.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{
    const body=await readFile(full);
    const ext=path.extname(full);
    const mime={".html":"text/html; charset=utf-8",
      ".mjs":"text/javascript; charset=utf-8",".js":"text/javascript; charset=utf-8",
      ".css":"text/css; charset=utf-8",
      ".json":"application/json",".webmanifest":"application/manifest+json"};
    res.writeHead(200,{"Content-Type":mime[ext]||"application/octet-stream","Cache-Control":"no-store"});
    res.end(body);
  }catch{res.writeHead(404).end("Not found");}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin="http://127.0.0.1:"+server.address().port;
const base=origin+"/addons/sparktiates/hybrid/index.html";
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const context=await browser.newContext({viewport:{width:393,height:852},
  deviceScaleFactor:1,isMobile:true,hasTouch:true});
const page=await context.newPage();
const errors=[];
page.on("pageerror",e=>errors.push(e.message));
async function testCompute(tab,{peersExpected=false}={}){
  await tab.locator("#workCount").selectOption("32");
  await tab.locator("#rounds").selectOption("30000");
  await tab.locator("#poolSize").selectOption("2");
  await tab.locator("#run").click();
  await tab.waitForFunction(()=>
    document.querySelector("#computeStatus")?.textContent.startsWith("Terminé ·"),
    null,{timeout:20000});
  assert.equal(await tab.locator("#results").isVisible(),true);
  const rate=await tab.locator("#realRate").textContent();
  const checksumText=await tab.locator("#checksum").textContent();
  const jobs=makeJobs(32,30000);
  const checksum=checksumResults(jobs,jobs.map(j=>({id:j.id,value:computeKernel(j.seed,j.steps)})));
  assert.match(checksumText,new RegExp(checksum));
  assert.match(await tab.locator("#integrity").textContent(),/PASS/);
  assert.match(await tab.locator("#virtualTime").textContent(),/\d/);
  assert.match(await tab.locator("#computeStatus").textContent(),/horloge 110 GHz.*simulation/i);
  console.log(peersExpected?"HYBRID_MOBILE_SWARM_RUN_PASS":"HYBRID_MOBILE_LOCAL_RUN_PASS",
    JSON.stringify({rate,checksum,virtualClock:110_000_000_000}));
}
try{
  await page.goto(base,{waitUntil:"domcontentloaded"});
  assert.equal(await page.locator("h1").textContent(),"Moteur numérique privé");
  assert.match(await page.locator(".metric").first().textContent(),/Virtuelle seulement/);
  await testCompute(page);
  // Populate the real IndexedDB schema used by Radio VRM.
  await page.evaluate(()=>new Promise((resolve,reject)=>{
    const req=indexedDB.open("radio-des-ia-vrm-v1",1);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains("events")){
        const store=db.createObjectStore("events",{keyPath:"id"});
        store.createIndex("time","time");
      }
    };
    req.onerror=()=>reject(req.error);
    req.onsuccess=()=>{
      const db=req.result,tx=db.transaction("events","readwrite");
      const base={origin:"ai",type:"CANDIDAT",model:"Qwen3.5-9B",
        evidence:"PROPOSITION_IA_NON_VÉRIFIÉE",topic:"Marées"};
      tx.objectStore("events").put({...base,id:"0000000000000001",
        time:"2026-11-15T09:00:00Z",nom:"Astrophysique",
        text:"Potentiel de marée : facteur R_T pour l'accélération différentielle."});
      tx.objectStore("events").put({...base,id:"0000000000000002",
        time:"2026-11-15T09:10:00Z",nom:"Méthodes",type:"CORRECTION_CANDIDATE",
        text:"La correction de l'accélération différentielle de marée dépend du rayon terrestre."});
      tx.oncomplete=()=>{db.close();resolve();};
      tx.onerror=()=>reject(tx.error);
    };
  }));
  assert.equal(await page.locator("#memoryResults").isVisible(),false);
  await page.locator("#loadVrm").click();
  await page.waitForFunction(()=>/2 événements/.test(
    document.querySelector("#memoryStatus")?.textContent||""),null,{timeout:10000});
  assert.equal(await page.locator("#nodes").textContent(),"2");
  assert.equal(await page.locator("#edges").textContent(),"1");
  assert.match(await page.locator("#worldPreview").textContent(),/CANDIDAT/);
  console.log("HYBRID_VRM_LOCAL_GRAPH_PASS");

  const other=await context.newPage();
  other.on("pageerror",e=>errors.push(e.message));
  await other.goto(base,{waitUntil:"domcontentloaded"});
  await page.locator("#joinSwarm").click();
  await other.locator("#joinSwarm").click();
  await page.waitForFunction(()=>/1 autre\(s\) onglet\(s\)/.test(
    document.querySelector("#swarmStatus")?.textContent||""),null,{timeout:8000});
  await other.waitForFunction(()=>/1 autre\(s\) onglet\(s\)/.test(
    document.querySelector("#swarmStatus")?.textContent||""),null,{timeout:8000});
  await testCompute(page,{peersExpected:true});
  assert.equal(await page.locator("#memoryStatus").textContent().then(s=>s.includes("Aucun transfert externe.")),false);
  await other.locator("#leaveSwarm").click();
  await page.locator("#leaveSwarm").click();
  await other.close();
  assert.deepEqual(errors,[]);
  console.log("HYBRID_E2E_PASS",JSON.stringify({
    browser:"Chromium mobile 393x852",local:true,p2p:true,
    vrm:true,unauthorizedExternalNetwork:false,physical110Ghz:false}));
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
