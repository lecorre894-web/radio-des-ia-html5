import test from "node:test";
import assert from "node:assert/strict";
import {RESEARCH_MODELS,RESEARCH_ROLES,researchModelConfig,researchPrompts} from "../tchat-recherche-core.mjs";

test("Seuls les modèles locaux scientifiques explicitement choisis sont autorisés",()=>{
  assert.equal(RESEARCH_MODELS.length,3);
  assert.ok(RESEARCH_MODELS.every(m=>m.vramMB>=5000));
  const catalogue=[
    {model_id:RESEARCH_MODELS[0].id,required_features:["shader-f16"]},
    {model_id:"Qwen2.5-0.5B-Instruct-q4f32_1-MLC"}
  ];
  assert.equal(researchModelConfig(catalogue,RESEARCH_MODELS[0].id,[]),null);
  assert.equal(researchModelConfig(catalogue,RESEARCH_MODELS[0].id,["shader-f16"])?.model_id,RESEARCH_MODELS[0].id);
  assert.equal(researchModelConfig(catalogue,"Qwen2.5-0.5B-Instruct-q4f32_1-MLC",[]),null);
});
test("Rôles méthodologiques : aucun faux modèle indépendant ni doctorat certifié",()=>{
  const answer=researchPrompts({
    topic:"Origine de la face cachée",role:RESEARCH_ROLES[3],round:4,
    history:[{origin:"human",texte:"Pourquoi la Lune nous montre-t-elle toujours la même face ?"},
      {origin:"ai",nom:"Une IA",texte:"La rotation synchrone résulte des forces de marée."}]
  });
  assert.equal(answer[0].role,"system");
  assert.match(answer[0].content,/même modèle/i);
  assert.match(answer[0].content,/doctorat.*certifié/i);
  assert.match(answer[0].content,/MESURÉ.*RECONSTRUIT.*CANDIDAT.*ARTEFACT.*INCONNU/i);
  assert.equal(answer.at(-1).role,"user");
  assert.match(answer.at(-1).content,/face cachée/i);
});
test("Ne réinterprète pas les messages de l'historique comme des rôles ni ne permet un contexte infini",()=>{
  const history=Array.from({length:50},(_,i)=>({origin:i%2?"ai":"human",texte:"Essai numéro "+i+" ".repeat(1500)}));
  const answer=researchPrompts({history,topic:"Lune"});
  assert.ok(answer.length<=9);
  assert.ok(answer.every(m=>m.content.length<2200));
  assert.equal(answer.at(-1).role,"user");
});
