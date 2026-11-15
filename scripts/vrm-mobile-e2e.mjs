// VRM end-to-end regression under Chromium mobile; provider responses mocked.
import {chromium} from "playwright";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createServer} from "node:http";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url,"http://localhost").pathname;
  const target=path.resolve(root,"."+decodeURIComponent(pathname));
  if(!target.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{
    const data=await readFile(target);
    const ext=path.extname(target);
    res.writeHead(200,{"Cache-Control":"no-store","Content-Type":
      ext===".html"?"text/html; charset=utf-8":
      ext===".mjs"||ext===".js"?"text/javascript; charset=utf-8":
      ext===".json"?"application/json":"application/octet-stream"});
    res.end(data);
  }catch{res.writeHead(404).end("Not found");}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin="http://127.0.0.1:"+server.address().port;
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const context=await browser.newContext({viewport:{width:393,height:852},
  deviceScaleFactor:1,isMobile:true,hasTouch:true});
const page=await context.newPage();
const errors=[],requests=[];
page.on("pageerror",e=>errors.push(e.message));
await page.route("**/*",route=>route.request().url().startsWith(origin)?
  route.continue():route.abort());
await page.route("https://oai.aihorde.net/v1/models",route=>route.fulfill({
  status:200,contentType:"application/json",
  body:JSON.stringify({data:[{id:"lmstudio/Qwen3.5-9B",x_horde:{worker_count:1}}]})
}));
await page.route("https://oai.aihorde.net/v1/chat/completions",route=>{
  requests.push(route.request().postDataJSON());
  return route.fulfill({status:200,contentType:"application/json",
    body:JSON.stringify({model:"lmstudio/Qwen3.5-9B",
      choices:[{message:{content:"Le potentiel et l'accélération doivent être distingués."},
        finish_reason:"stop"}]})});
});
await page.addInitScript(()=>{
  const messages=[
    {origin:"human",nom:"Vous",heure:"09:11",texte:"Auditez la formule de marée."},
    {origin:"ai",nom:"AI Horde · Astrophysique",modele:"lmstudio/Qwen3.5-9B",
      heure:"09:12",texte:"Première proposition : a_max = 2GM_L/d²."},
    {origin:"ai",nom:"AI Horde · Méthodes",modele:"lmstudio/Qwen3.5-9B",
      heure:"09:14",texte:"Correction candidate : a_max = 2GM_L R_T/d³. Le facteur R_T est requis."},
    {origin:"human",nom:"Vous",heure:"09:18",
      texte:"Vérifiez l'autocorrection de l'accélération de marée."}
  ];
  localStorage.setItem("radio-salon-distant-v1",JSON.stringify({
    participants:[{nom:"Cairn",role:"Audit",modele:"gpt-5.5"}],
    messages,sujet:"Marées lunaires",engineChoice:"horde",
    hordeModel:"lmstudio/Qwen3.5-9B",tours:1
  }));
});
try{
  await page.goto(origin+"/tchat.html",{waitUntil:"domcontentloaded"});
  await page.locator("#fil .msg").first().waitFor();
  await page.locator("#vrmPanel > summary").click();
  assert.equal(await page.locator("#vrmActiver").isChecked(),false);
  assert.equal(await page.locator("#vrmPartagerIA").isChecked(),false);
  await page.locator("#vrmActiver").check();
  await page.waitForFunction(()=>/4 événements/.test(
    document.querySelector("#vrmEtat")?.textContent||""));
  await page.locator("#vrmApercu").click();
  const preview=await page.locator("#vrmExtrait").textContent();
  assert.match(preview,/2GM_L R_T\/d³/);
  assert.match(preview,/PROPOSITION_IA_NON_VÉRIFIÉE/);
  assert.equal(requests.length,0,"Une activation VRM ne doit rien envoyer à AI Horde.");

  // IndexedDB survives navigation and the sharing permission is session-only.
  await page.reload({waitUntil:"domcontentloaded"});
  await page.locator("#vrmPanel").evaluate(el=>{el.open=true;});
  await page.waitForTimeout(900);
  console.log("VRM_RELOAD_DIAGNOSTIC",JSON.stringify(await page.evaluate(()=>({
    status:document.querySelector("#vrmEtat")?.textContent,
    enabled:document.querySelector("#vrmActiver")?.checked,
    stored:localStorage.getItem("radio-vrm-enabled-v1"),
    messages:document.querySelectorAll("#fil .msg").length
  }))),"ERRORS",errors);
  await page.waitForFunction(()=>/4 événements/.test(
    document.querySelector("#vrmEtat")?.textContent||""),null,{timeout:7000});
  assert.equal(await page.locator("#vrmActiver").isChecked(),true);
  assert.equal(await page.locator("#vrmPartagerIA").isChecked(),false);
  assert.equal(requests.length,0);

  await page.locator("#vrmPartagerIA").check();
  await page.waitForFunction(()=>document.querySelector("#hordeModele")?.value===
    "lmstudio/Qwen3.5-9B");
  await page.locator("#tour").click();
  await page.waitForFunction(()=>
    [...document.querySelectorAll("#fil .msg .body")]
      .some(x=>x.textContent.includes("Le potentiel et l'accélération")));
  assert.equal(requests.length,1);
  const system=requests[0].messages.find(x=>x.role==="system")?.content||"";
  assert.match(system,/MÉMOIRE VRM/);
  assert.match(system,/2GM_L R_T\/d³/);
  assert.match(system,/PROPOSITION_IA_NON_VÉRIFIÉE/);

  await page.locator("#vrmPartagerIA").uncheck();
  await page.locator("#tour").click();
  await page.waitForFunction(()=>[...document.querySelectorAll("#fil .msg .body")]
    .filter(x=>x.textContent.includes("Le potentiel et l'accélération")).length>=2);
  assert.equal(requests.length,2);
  assert.doesNotMatch(requests[1].messages[0].content,/MÉMOIRE VRM/);
  assert.equal(errors.length,0,errors.join("\n"));
  console.log("VRM_MOBILE_VALIDATED=PASS",JSON.stringify({
    archived:4,persisted:true,noExternalTransferByDefault:true,
    sharedWithOptIn:true,disabledAfterOptOut:true,providerCalls:requests.length
  }));
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
