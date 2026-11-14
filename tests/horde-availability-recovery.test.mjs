import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  modelSizeB,addHordeAvailability,chooseResponsiveHorde,
  getHordeAvailability,HORDE_STATUS_URL,HORDE_WAIT_LIMIT_MS
} from "../tchat-horde-availability.mjs";

test("Un 128B n'est jamais proposé comme choix rapide par défaut",()=>{
  assert.equal(modelSizeB("aphrodite/TheDrummer/Behemoth-128B-v3"),128);
  assert.equal(modelSizeB("lmstudio/Qwen3.5-9B"),9);
  assert.equal(modelSizeB("no-size-model"),null);
  const models=addHordeAvailability([
    {id:"aphrodite/TheDrummer/Behemoth-128B-v3",workers:1},
    {id:"lmstudio/Qwen3.5-9B",workers:2},
    {id:"Community/Other-3B",workers:4}
  ],[
    {name:"aphrodite/TheDrummer/Behemoth-128B-v3",count:1,eta:1200,jobs:3},
    {name:"lmstudio/Qwen3.5-9B",count:2,eta:20,jobs:1}
  ]);
  assert.equal(chooseResponsiveHorde(models).id,"lmstudio/Qwen3.5-9B");
  assert.equal(models[0].etaSeconds,1200);
});
test("Sans disponibilité annoncée, ne pas inventer de modèle rapide",()=>{
  const models=addHordeAvailability([
    {id:"Qwen3.5-9B",workers:null},
    {id:"NoWorker-12B",workers:0}
  ]);
  assert.equal(chooseResponsiveHorde(models),null);
});
test("Sonde statistique publique GET : jamais de message utilisateur ni d'appel d'IA",async()=>{
  let calls=0;
  const entries=await getHordeAvailability({fetcher:async(url,options)=>{
    calls++;
    assert.equal(url,HORDE_STATUS_URL);
    assert.equal(options.method,"GET");
    assert.equal(options.headers,undefined);
    return {ok:true,async text(){return JSON.stringify([{name:"lmstudio/Qwen3.5-9B",count:3,eta:50,jobs:2}]);}};
  }});
  assert.equal(calls,1);
  assert.equal(entries.length,1);
  assert.equal(HORDE_WAIT_LIMIT_MS,180000);
});
test("Le Salon stable préserve les cinq moteurs, les messages et le contrôle explicite de la reprise",()=>{
  const html=readFileSync(new URL("../tchat.html",import.meta.url),"utf8");
  const js=readFileSync(new URL("../tchat-distant.mjs",import.meta.url),"utf8");
  for(const engine of ["puter","research-local","horde","pollinations","sparktiates"])
    assert.ok(html.includes('value="'+engine+'"'),engine);
  for(const id of ["hordeRapide","hordeModele","hordeActualiser","moteurComposer",
    "reessayerDernier","fil","parler"])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(js,/function selectResponsiveHorde\(\)/);
  assert.match(js,/hordeRapide"\)\.addEventListener\("click",selectResponsiveHorde/);
  assert.match(js,/setTimeout\(\(\)=>\{\s*timedOut=true;/);
  assert.match(js,/clearTimeout\(deadline\)/);
  assert.match(js,/status\("AI Horde : "\+reason\+"\./);
  assert.match(js,/function retryLastHuman\(\)/);
  assert.match(js,/localStorage\.setItem\(KEY,JSON\.stringify/);
  assert.doesNotMatch(js,/initScientificCoordinator|initNoaaValidation/);
});
