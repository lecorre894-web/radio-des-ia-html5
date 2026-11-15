// Vérification réelle sous Chromium mobile, pas seulement un test de chaînes.
import {chromium} from "playwright";
import http from "node:http";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import assert from "node:assert/strict";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const mime={".html":"text/html; charset=utf-8",".mjs":"text/javascript; charset=utf-8",
  ".js":"text/javascript; charset=utf-8",".json":"application/json",
  ".css":"text/css; charset=utf-8",".svg":"image/svg+xml",".png":"image/png"};
const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,"http://localhost").pathname;
  const safe=path.resolve(root,"."+decodeURIComponent(pathname));
  if(!safe.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{
    const body=await readFile(safe);
    res.writeHead(200,{"Content-Type":mime[path.extname(safe)]||"application/octet-stream",
      "Cache-Control":"no-store"});
    res.end(body);
  }catch{res.writeHead(404).end("Not found");}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin="http://127.0.0.1:"+server.address().port;
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const context=await browser.newContext({viewport:{width:393,height:852},
  deviceScaleFactor:1,isMobile:true,hasTouch:true});
const page=await context.newPage();
const errors=[];
page.on("pageerror",e=>errors.push(e.message));
let generations=0;
await page.route("**/*",route=>{
  if(route.request().url().startsWith(origin))return route.continue();
  return route.abort();
});
await page.route("https://oai.aihorde.net/v1/models",route=>route.fulfill({
  status:200,contentType:"application/json",
  body:JSON.stringify({object:"list",data:[
    {id:"lmstudio/Qwen3.5-9B",context_length:32768,x_horde:{worker_count:1}}
  ]})
}));
await page.route("https://oai.aihorde.net/v1/chat/completions",route=>{
  generations++;
  return route.fulfill({status:200,contentType:"application/json",
    body:JSON.stringify({model:"lmstudio/Qwen3.5-9B",
      choices:[{message:{content:"Bonjour ! Je peux expliquer la physique lunaire. Réponse de test n° "+generations+"."},
        finish_reason:"stop"}]})});
});
const messages=Array.from({length:22},(_,i)=>({
  origin:i%2?"ai":"human",
  nom:i%2?"AI Horde · Sélénologie":"Vous",
  modele:i%2?"lmstudio/Qwen3.5-9B":undefined,
  heure:"08:00",
  texte:("Une discussion scientifique à propos de la Lune, des marées et des données mesurées. ").repeat(7)+"\n"+i
}));
await page.addInitScript(msg=>{
  localStorage.setItem("radio-salon-distant-v1",JSON.stringify({
    participants:[{nom:"Cairn",role:"Astrophysique",modele:"gpt-5.5"}],
    messages:msg,engineChoice:"horde",hordeModel:"lmstudio/Qwen3.5-9B",
    sujet:"La Lune",tours:11
  }));
},messages);

function approx(actual,wanted,label){
  assert.ok(Math.abs(actual-wanted)<18,
    label+": position attendue "+wanted+", position observée "+actual);
}
async function placeButton(id){
  const locator=page.locator("#"+id);
  await locator.scrollIntoViewIfNeeded();
  await page.evaluate(sel=>{
    const el=document.querySelector(sel);
    const delta=el.getBoundingClientRect().top-window.innerHeight*0.42;
    window.scrollBy(0,delta);
  },"#"+id);
  return await locator.evaluate(el=>el.getBoundingClientRect().top);
}
try{
  await page.goto(origin+"/tchat.html",{waitUntil:"domcontentloaded"});
  await page.locator("#fil .msg").first().waitFor();
  await page.waitForFunction(()=>
    document.querySelector("#hordeModele")?.value==="lmstudio/Qwen3.5-9B",
    {timeout:10000}
  );
  assert.equal(await page.locator("#etat").isVisible(),false,
    "Le statut de haut de page ne doit pas déformer la conversation.");
  const oldMessages=await page.locator("#fil .msg").count();
  assert.ok(oldMessages>=20,"Le fil existant doit survivre à l'actualisation.");

  // Test 1: catalogue actualisé depuis un bouton situé bien au-dessus du tchat.
  {
    const before=await placeButton("hordeActualiser");
    await page.locator("#hordeActualiser").click();
    await page.waitForTimeout(180);
    const after=await page.locator("#hordeActualiser")
      .evaluate(el=>el.getBoundingClientRect().top);
    approx(after,before,"Actualiser le catalogue");
    console.log("MOBILE_SCROLL_CATALOG_OK",JSON.stringify({before,after}));
  }

  // Test 2: envoyer une question depuis le bas de la conversation.
  {
    await page.locator("#moi").fill("Bonjour, pouvez-vous développer votre réponse ?");
    const before=await placeButton("parler");
    await page.locator("#parler").click();
    await page.waitForFunction(()=>
      [...document.querySelectorAll("#fil .msg .body")]
      .some(node=>node.textContent.includes("Réponse de test n° 1")),
      {timeout:10000}
    );
    await page.waitForTimeout(180);
    const after=await page.locator("#parler")
      .evaluate(el=>el.getBoundingClientRect().top);
    approx(after,before,"Envoyer une question");
    console.log("MOBILE_SCROLL_SEND_OK",JSON.stringify({before,after}));
  }

  // Test 3: un nouveau tour IA ne doit pas déclencher un saut de page.
  {
    const before=await placeButton("tour");
    await page.locator("#tour").click();
    await page.waitForFunction(()=>
      [...document.querySelectorAll("#fil .msg .body")]
      .some(node=>node.textContent.includes("Réponse de test n° 2")),
      {timeout:10000}
    );
    await page.waitForTimeout(120);
    const after=await page.locator("#tour")
      .evaluate(el=>el.getBoundingClientRect().top);
    approx(after,before,"Faire parler l'IA suivante");
    console.log("MOBILE_SCROLL_TOUR_OK",JSON.stringify({before,after}));
  }
  assert.equal(errors.length,0,errors.join("\n"));
  console.log("MOBILE_SCROLL_VALIDATED=3/3",JSON.stringify({messages:oldMessages,generations,device:"393x852 touch"}));
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
