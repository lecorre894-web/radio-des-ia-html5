import test from "node:test";
import assert from "node:assert/strict";
import {buildPrompt,responseText,cleanAnswer,qualityIssue,lastHuman} from "../tchat-core.mjs";

const people=[
 {nom:"Cairn",role:"Audit de la précision scientifique",modele:"gpt-5.5"},
 {nom:"Brume",role:"Mathématiques",modele:"claude-sonnet-4-6"}
];
test("la question humaine est préservée mot pour mot",()=>{
 const messages=[
  {origin:"human",texte:"Bonjour"},
  {origin:"ai",nom:"Cairn",texte:"Bonjour"},
  {origin:"human",texte:"C'est quoi l'Abilify, pas une application ?"}
 ];
 const req=buildPrompt({participants:people,index:1,messages,sujet:""});
 assert.equal(req.length,2);
 assert.match(req[1].content,/C'est quoi l'Abilify, pas une application \?/);
 assert.doesNotMatch(req[1].content,/Dernière contribution.*Bonjour/i);
 assert.match(req[0].content,/médicament/);
});
test("les différentes IA ont des rôles distincts",()=>{
 const req=buildPrompt({participants:people,index:0,messages:[],sujet:"Intégrité des données"});
 assert.match(req[0].content,/Cairn/);
 assert.match(req[1].content,/Intégrité des données/);
});
test("réponses structurées acceptées",()=>{
 assert.equal(responseText({message:{content:"Réponse exacte."}}),"Réponse exacte.");
 assert.equal(responseText({message:{content:[{type:"text",text:"Deux "},{type:"text",text:"parties"}]}}),"Deux parties");
});
test("préfixes récurrents et répétitions détectés",()=>{
 assert.equal(cleanAnswer("[Cairn] [Brume] Bonjour",people),"Bonjour");
 assert.ok(qualityIssue("Bonjour",[{origin:"human",texte:"Parle-moi de la physique"}]));
 assert.ok(qualityIssue("Une preuve.",[{origin:"ai",texte:"Une preuve."}]));
 assert.equal(qualityIssue("Une hypothèse mesurable nouvelle.",[{origin:"human",texte:"Propose une hypothèse"}]),"");
});
