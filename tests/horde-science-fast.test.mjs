import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  enrichHordeModels,hordeLunarScienceKickoff,buildHordeMessages,
  recommendHordeModel,hordeTokenBudget,hordeModelSizeB,
  normalizeHordeModels,HORDE_MODEL_STATUS_URL
} from "../tchat-horde.mjs";

test("Les modèles sont réels : aucun fournisseur ou travailleur n'est créé artificiellement",()=>{
  const source=normalizeHordeModels({data:[
    {id:"lmstudio/Qwen3.5-9B",x_horde:{worker_count:1}},
    {id:"Community/fast-8B",x_horde:{worker_count:2}},
    {id:"Community/tiny-3B",x_horde:{worker_count:5}}
  ]});
  const ranked=enrichHordeModels(source,[
    {name:"lmstudio/Qwen3.5-9B",count:1,eta:250,jobs:5,performance:20},
    {name:"Community/fast-8B",count:2,eta:12,jobs:1,performance:30},
    {name:"Community/tiny-3B",count:5,eta:0,jobs:0,performance:50}
  ]);
  assert.equal(ranked.length,3);
  assert.equal(ranked[0].id,"Community/tiny-3B");
  const recommended=recommendHordeModel(ranked,{minimumB:7});
  assert.equal(recommended.id,"Community/fast-8B");
  assert.equal(recommended.etaSeconds,12);
  assert.equal(recommended.workers,2);
  assert.equal(HORDE_MODEL_STATUS_URL,"https://aihorde.net/api/v2/status/models?type=text");
});

test("Pas de faux classement rapide quand les données de capacité manquent",()=>{
  const items=normalizeHordeModels({data:[
    {id:"Qwen3.5-9B"}, {id:"Qwen3-8B"}, {id:"tiny-3B"}
  ]});
  assert.equal(recommendHordeModel(items,{minimumB:7}),null);
  assert.equal(hordeModelSizeB("lmstudio/Qwen3.5-9B"),9);
  assert.equal(hordeModelSizeB("model-inconnu"),null);
});

test("Budget des sorties à trois niveaux : la réduction reste volontaire et bornée",()=>{
  assert.equal(hordeTokenBudget("rapide"),180);
  assert.equal(hordeTokenBudget("equilibre"),280);
  assert.equal(hordeTokenBudget("approfondi"),400);
  assert.equal(hordeTokenBudget("valeur-inconnue"),280);
});

test("Un bonsoir déclenche un vrai problème de marée et non une demande de précision",()=>{
  assert.match(hordeLunarScienceKickoff("Bonsoir"),/2 G M_L R_T \/ d³/);
  assert.match(hordeLunarScienceKickoff("Bonjour !"),/accélération différentielle/);
  assert.equal(hordeLunarScienceKickoff("Quel est le rayon lunaire ?"),"");
  const out=buildHordeMessages({topic:"La Lune",history:[{origin:"human",texte:"Bonsoir"}]});
  const serialized=JSON.stringify(out);
  assert.match(serialized,/DÉMARRAGE SCIENTIFIQUE IMMÉDIAT/);
  assert.match(serialized,/marées terrestres/);
  assert.match(serialized,/sans récapituler ton identité/);
  const detailed=buildHordeMessages({topic:"La Lune",history:[{origin:"human",texte:"Calcule le rayon"}]});
  assert.doesNotMatch(JSON.stringify(detailed),/DÉMARRAGE SCIENTIFIQUE IMMÉDIAT/);
});

test("La page préserve tous les moteurs et l'identité des intervenants",()=>{
  const html=readFileSync(new URL("../tchat.html",import.meta.url),"utf8");
  const js=readFileSync(new URL("../tchat-distant.mjs",import.meta.url),"utf8");
  for(const engine of ["puter","horde","pollinations","research-local","sparktiates"])
    assert.ok(html.includes('value="'+engine+'"'),engine);
  for(const id of ["hordeRapide","hordeLongueur","hordeActualiser","hordeModele",
    "hordePartagerContexte","fil","reessayerDernier"])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(js,/function chooseFasterHorde\(\)/);
  assert.match(js,/hordeTokenBudget\(responseMode\)/);
  assert.match(js,/setInterval\(\(\)=>\{/);
  assert.match(js,/clearInterval\(waitingIndicator\)/);
  assert.match(js,/window\.puter\.ai\.chat\(/);
  assert.match(html,/ChatGPT et René Le Corre®/);
});

test("L'approximation dimensionnelle des marées possède une unité d'accélération",()=>{
  const G=6.67430e-11,M=7.342e22,R=6.371e6,d=3.844e8;
  const a=2*G*M*R/(d**3);
  assert.ok(a>1.0e-6 && a<1.2e-6);
  assert.ok(Number.isFinite(a));
});
