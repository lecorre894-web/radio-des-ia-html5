import test from "node:test";
import assert from "node:assert/strict";
import {
 catalogOptions,resolveParticipantModel,eligibleParticipants,nextEligibleIndex,providerForSpeaker
} from "../tchat-models.mjs";
import {buildPrompt} from "../tchat-core.mjs";

const people=[
 {nom:"Cairn",modele:"gpt-5.4-nano"},
 {nom:"Brume",modele:"claude-sonnet-4-6"},
 {nom:"Aurore",modele:"gemini-3.1-flash-lite"},
 {nom:"IA4",modele:"gpt-5.4-nano"},
 {nom:"Perplexity",modele:"perplexity/sonar-pro"},
 {nom:"Kimi",modele:"moonshotai/kimi-k3.1-pro"}
];
test("les deux marques absentes restent indisponibles, sans faux fournisseurs",()=>{
 const catalog=["gpt-5.4-nano","claude-sonnet-4-6","gemini-3.1-flash-lite"].map(id=>({id}));
 for(const p of people.slice(-2)){
  const result=resolveParticipantModel(p,catalog);
  assert.equal(result.available,false);
  assert.equal(result.selected,null);
  assert.equal(result.changed,false);
 }
});
test("catalogue réel : priorité à un vrai modèle Moonshot ou Perplexity",()=>{
 const catalog=["moonshotai/kimi-k2.6","perplexity/sonar","perplexity/sonar-pro","moonshotai/kimi-k3"]
   .map(id=>({id}));
 assert.equal(resolveParticipantModel(people[4],catalog).selected,"perplexity/sonar-pro");
 assert.equal(resolveParticipantModel(people[5],catalog).selected,"moonshotai/kimi-k3");
 assert.deepEqual(catalogOptions(catalog,"perplexity"),["perplexity/sonar-pro","perplexity/sonar"]);
});
test("ne jamais attribuer une fausse identité à une autre IA",()=>{
 const catalog=[{id:"openai/sonar-pro",name:"Perplexity Sonar"},{id:"gpt-5.4-nano"},{id:"moonshotai/other"}];
 assert.equal(resolveParticipantModel(people[4],catalog).selected,null);
 assert.equal(resolveParticipantModel(people[5],catalog).selected,null);
 assert.equal(providerForSpeaker(people[4]),"perplexity");
});
test("le tour ignore Perplexity et Kimi absents, mais conserve IA4",()=>{
 const valid=new Set(["gpt-5.4-nano","claude-sonnet-4-6","gemini-3.1-flash-lite"]);
 assert.deepEqual(eligibleParticipants(people,valid),[0,1,2,3]);
 assert.equal(nextEligibleIndex(people,valid,4),0);
 assert.equal(nextEligibleIndex(people,valid,5),0);
 assert.equal(nextEligibleIndex(people,valid,3),3);
});
test("aucun modèle valide : aucun tour inutile",()=>{
 assert.equal(nextEligibleIndex(people,new Set(["aucun"]),0),-1);
});
test("catalogue absent : conserver le chemin historique sans blocage",()=>{
 assert.equal(nextEligibleIndex(people,new Set(),4),4);
});
test("simple bonsoir : réponse naturelle plutôt qu'un formulaire",()=>{
 const req=buildPrompt({participants:people,index:0,messages:[{origin:"human",texte:"Bonsoir"}],mode:"direct"});
 assert.match(req[1].content,/SALUTATION HUMAINE/);
 assert.match(req[1].content,/N'exige ni formulaire/);
 assert.doesNotMatch(req[1].content,/Réponds directement et utilement/);
});
test("question scientifique : préservation du texte initial et des unités",()=>{
 const req=buildPrompt({participants:people,index:0,messages:[{origin:"human",texte:"Faut-il 10 ms ou 100 ms ?"}],mode:"direct"});
 assert.match(req[1].content,/Faut-il 10 ms ou 100 ms \?/);
 assert.match(req[1].content,/QUESTION HUMAINE ORIGINALE/);
});
