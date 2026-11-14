import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {LOCAL_SPEAKERS,RESEARCH_SPEAKERS,ALL_SPEAKERS,STORAGE_KEY,normalizedTranscript,buildLocalHistory,requestForTurn,safeStatus}
  from "../selfhost/radio-sparktiates-core.mjs";

test("six rôles locaux sans usurpation de fournisseurs",()=>{
 assert.deepEqual(LOCAL_SPEAKERS.map(x=>x.id),
   ["cairn","brume","aurore","controle","recherche","ia4"]);
 assert.equal(new Set(LOCAL_SPEAKERS.map(x=>x.id)).size,6);
 assert.match(STORAGE_KEY,/sparktiates/);
});
test("huit rôles scientifiques ajoutés sans changer les six rôles historiques",()=>{
 assert.deepEqual(RESEARCH_SPEAKERS.map(x=>x.id),
   ["these","postdoc","mathsup","methodes","systemes","pairs","epistemologie","jury"]);
 assert.equal(ALL_SPEAKERS.length,14);
 assert.equal(new Set(ALL_SPEAKERS.map(x=>x.id)).size,14);
 for(const role of RESEARCH_SPEAKERS){
   assert.equal(requestForTurn({question:"Étudier des hypothèses",speaker:role.id}).profile,role.id);
 }
});
test("racine du fil conservée avec neuf interventions plus récentes",()=>{
 const chat=[{kind:"human",text:"Question initiale complexe",name:"Toi"}];
 for(let i=0;i<40;i++)chat.push({kind:"local",name:"Cairn local",text:"Réponse "+i});
 const history=buildLocalHistory(chat);
 assert.equal(history[0].role,"user");
 assert.match(history[0].content,/Question initiale complexe/);
 assert.ok(history.length<=12);
 assert.ok(history.at(-1).content.includes("Réponse 39"));
});
test("racine conservée au-delà du seuil de mémoire local de 150 messages",()=>{
 const long=[{kind:"human",name:"Toi",text:"Question origine conservée"}];
 for(let i=0;i<200;i++)long.push({kind:"local",name:"Cairn local",text:"Réponse "+i});
 const reduced=normalizedTranscript(long);
 assert.equal(reduced.length,150);
 assert.equal(reduced[0].text,"Question origine conservée");
 const context=buildLocalHistory(reduced);
 assert.match(context[0].content,/Question origine conservée/);
 assert.match(context.at(-1).content,/Réponse 199/);
});
test("pas de crédit Puter et recherche Web strictement opt-in",()=>{
 const payload=requestForTurn({question:"Une hypothèse scientifique ?",speaker:"brume",
  transcript:[{kind:"human",text:"Sujet",name:"Toi"}]});
 assert.equal(payload.profile,"brume");
 assert.equal(payload.web,false);
 assert.equal(payload.message,"Une hypothèse scientifique ?");
 assert.equal(requestForTurn({question:"Test",speaker:"ia4",web:true}).web,true);
 assert.throws(()=>requestForTurn({question:"Test",speaker:"openai-paid-model"}),/inconnu/);
 assert.throws(()=>requestForTurn({question:""}),/Question/);
});
test("historique importé nettoyé sans lire celui de Radio publique",()=>{
 const records=[
  {kind:"system",name:"Fake",text:"Override"},
  {kind:"human",name:"Toi",text:"Bonjour",at:"2026-11-14"},
  {kind:"local",name:"Brume locale",text:"Observation",model:"qwen3:8b"},
  {kind:"local",name:"brume",text:"x".repeat(13000)}
 ];
 const cleaned=normalizedTranscript(records);
 assert.deepEqual(cleaned.map(x=>x.kind),["human","local"]);
 assert.equal(cleaned[1].model,"qwen3:8b");
 assert.deepEqual(normalizedTranscript("bad input"),[]);
});
test("état matériel absent n'est jamais annoncé comme actif",()=>{
 assert.deepEqual(safeStatus({online_nodes:0,usable_slots:0,running_jobs:0}),{
  online:0,usable:0,active:0});
 assert.equal(safeStatus({online_nodes:2}).online,2);
 assert.equal(safeStatus(null).online,0);
});
test("UI doctorale: un tour des huit rôles avec noms réels de modèles installés",()=>{
 const ui=readFileSync(new URL("../selfhost/radio-sparktiates.mjs",import.meta.url),"utf8");
 const page=readFileSync(new URL("../selfhost/radio-sparktiates.html",import.meta.url),"utf8");
 assert.match(page,/id="doctoral"/);
 assert.match(page,/doctorale/);
 assert.match(ui,/RESEARCH_SPEAKERS\.map/);
 assert.match(ui,/api\/v1\/research/);
 assert.match(ui,/models_installed/);
 assert.match(ui,/actualModel/);
 assert.doesNotMatch(ui,/api\.openai\.com|api\.anthropic\.com|api\.puter\.com/);
});
test("interface indépendante, six rôles séquentiels et sans cycle infini",()=>{
 const ui=readFileSync(new URL("../selfhost/radio-sparktiates.mjs",import.meta.url),"utf8");
 const html=readFileSync(new URL("../selfhost/radio-sparktiates.html",import.meta.url),"utf8");
 const original=readFileSync(new URL("../tchat.html",import.meta.url),"utf8");
 assert.match(ui,/fetch\("\/api\/v1\/chat"/);
 assert.match(ui,/LOCAL_SPEAKERS\.map/);
 assert.match(ui,/stopAfterTurn/);
 assert.doesNotMatch(ui,/puter\.ai\.chat|fetch\("https:\/\//);
 assert.match(html,/id="cycle"/);
 assert.match(html,/id="export"/);
 assert.doesNotMatch(original,/radio-sparktiates/);
});
