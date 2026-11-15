import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildHordeMessages} from "../tchat-horde.mjs";

test("Un Bonjour est transmis sans charte ni brouillon ajouté",()=>{
  const messages=buildHordeMessages({
    history:[{origin:"human",texte:"Bonjour"}],topic:"La Lune",role:"Astrophysique"
  });
  assert.equal(messages.length,2);
  assert.equal(messages[1].content,"Bonjour");
  assert.ok(messages[0].content.length<450);
  assert.doesNotMatch(JSON.stringify(messages),/DRAFT|System prompt constraints|QUESTION HUMAINE ACTUELLE|Ton rôle méthodologique/);
});
test("Une question humaine ne change pas de sujet à cause de l'ancien rôle",()=>{
  const question="Pourquoi les IA cherchent-elles à découvrir la douleur ?";
  const messages=buildHordeMessages({
    history:[{origin:"human",texte:question}],topic:"La Lune",role:"Astrophysique"
  });
  assert.equal(messages[1].content,question);
  assert.doesNotMatch(messages[0].content,/Astrophysique/);
});
test("Pas de transfert de données antérieures sans autorisation",()=>{
  const h=[
    {origin:"human",texte:"Ne pas envoyer mes anciennes informations"},
    {origin:"ai",nom:"Kimi",texte:"Un ancien diagnostic"},
    {origin:"human",texte:"Bonjour"}
  ];
  const privateCall=JSON.stringify(buildHordeMessages({history:h,includeHistory:false}));
  assert.doesNotMatch(privateCall,/Ne pas envoyer|ancien diagnostic/);
  const shared=JSON.stringify(buildHordeMessages({history:h,includeHistory:true}));
  assert.match(shared,/Ne pas envoyer/);
  assert.match(shared,/Intervenant IA \\[Kimi\\]/);
});
test("Salon conservé : stockage et commandes non détruits",()=>{
  const source=readFileSync(new URL("../tchat-distant.mjs",import.meta.url),"utf8");
  const page=readFileSync(new URL("../tchat.html",import.meta.url),"utf8");
  assert.match(source,/const KEY = "radio-salon-distant-v1"/);
  assert.match(source,/localStorage\\.setItem\\(KEY,JSON\\.stringify/);
  assert.match(source,/function retryLastHuman\\(\\)/);
  assert.match(source,/async function nextHordeTurn\\(\\)/);
  assert.doesNotMatch(source,/detectHordeMetaOutput|lastHordeBadAnswer|initScientificCoordinator/);
  for(const id of ["fil","moi","hordeModele","hordeActualiser","reessayerDernier"])
    assert.ok(page.includes('id="'+id+'"'));
  for(const engine of ["puter","research-local","horde","pollinations","sparktiates"])
    assert.ok(page.includes('value="'+engine+'"'));
});
