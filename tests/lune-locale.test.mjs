import test from "node:test";
import assert from "node:assert/strict";
import {
  SALON_KEY, newSalon, parseSalon, appendSalonMessage, lunarMessages, chooseLunarModel
} from "../lune-core.mjs";

test("Mode local : conservation de la clé et du schéma du Salon Puter", () => {
  assert.equal(SALON_KEY,"radio-salon-distant-v1");
  const initial=newSalon();
  assert.ok(Array.isArray(initial.participants) && initial.participants.length>0);
  assert.equal(initial.messages.length,0);
  assert.deepEqual(parseSalon("données cassées").messages,[]);
});
test("Historique ajouté sans écraser les participants ni les messages", () => {
  const base={...newSalon(),participants:[{nom:"Test",modele:"gpt-5.5"}],
    messages:[{origin:"human",texte:"Une question initiale"}], tours:4};
  const next=appendSalonMessage(base,{origin:"ai",texte:"Une réponse locale"});
  assert.equal(next.messages.length,2);
  assert.equal(next.messages[0].texte,"Une question initiale");
  assert.equal(next.participants[0].nom,"Test");
  assert.equal(next.tours,5);
  assert.equal(base.messages.length,1);
});
test("Dialogue lunaire : continuité bornée, distinction assistant/utilisateur", () => {
  let s=newSalon();
  for(let i=0;i<14;i++)s=appendSalonMessage(s,{origin:i%2?"ai":"human",texte:"Message numéro "+i});
  const history=lunarMessages(s);
  assert.equal(history[0].role,"system");
  assert.ok(history[0].content.includes("ARTEFACTS"));
  assert.equal(history.length,9);
  assert.equal(history[1].role,"user");
  assert.equal(history.at(-1).content,"Message numéro 13");
});
test("Choix du plus petit modèle : respect des fonctionnalités WebGPU et absence de modèle inventé", () => {
  const list=[
    {model_id:"Test-1.5B-Instruct-q4f32_1-MLC"},
    {model_id:"Qwen2-0.5B-Instruct-q4f16_1-MLC",required_features:["shader-f16"]},
    {model_id:"Qwen2-0.5B-Instruct-q4f32_1-MLC"}
  ];
  assert.equal(chooseLunarModel(list,[])?.model_id,"Qwen2-0.5B-Instruct-q4f32_1-MLC");
  assert.equal(chooseLunarModel([list[1]],[]),null);
  assert.equal(chooseLunarModel([list[1]],["shader-f16"])?.model_id,list[1].model_id);
  assert.equal(chooseLunarModel([list[0]],[]),null);
});
