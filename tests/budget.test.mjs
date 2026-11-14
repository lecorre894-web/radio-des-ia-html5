import test from "node:test";
import assert from "node:assert/strict";
import {boundedTokens,requestSize,formatUsageSummary,CREDIT_GUARD} from "../tchat-budget.mjs";
import {buildPrompt} from "../tchat-core.mjs";
test("les sorties Puter sont strictement limitées en mode économique",()=>{
 assert.equal(boundedTokens("600"),600);
 assert.equal(boundedTokens("auto"),CREDIT_GUARD.defaultOutputTokens);
 assert.equal(boundedTokens("1000"),1000);
 assert.equal(boundedTokens("2500"),2500);
 assert.equal(boundedTokens("999999"),2500);
 assert.equal(boundedTokens(-5),600);
});
test("conserver la racine et le dernier message sans répétitions d'ancêtres",()=>{
 const ps=[{nom:"Cairn",role:"Critique",modele:"gpt-5.4-nano"}];
 const chat=[{origin:"human",texte:"Mon problème fondateur concerne le savoir chez les IA."},
   ...Array.from({length:50},(_,i)=>({origin:i%2?"human":"ai",nom:i%2?"Vous":"Brume",texte:"Étape "+i+" : "+("analyse de principe ".repeat(22))})),
   {origin:"human",texte:"Une précision essentielle : il faut distinguer savoir et vérité."}];
 const req=buildPrompt({participants:ps,index:0,messages:chat,mode:"direct"});
 const txt=req[1].content;
 assert.match(txt,/Mon problème fondateur concerne le savoir/);
 assert.match(txt,/Une précision essentielle/);
 assert.ok(txt.length<6300, "Contexte généalogique excessif : "+txt.length);
});
test("estimation de la taille du contexte, sans appeler Puter",()=>{
 assert.equal(requestSize([{role:"system",content:"abc"},{role:"user",content:"12345"}]),8);
 assert.equal(requestSize([{role:"user",content:[{type:"text",text:"test"},{type:"file",puter_path:"image.jpg"}]}]),4);
});
test("quotas : afficher uniquement les mesures numériques, pas de données secrètes",()=>{
 const text=formatUsageSummary({month:{credits_used:994,credits_total:1000},token:"secret",username:"me"});
 assert.match(text,/994/);
 assert.match(text,/1\s?000/);
 assert.doesNotMatch(text,/secret|username|me/);
});
test("aucune mesure inventée si l'API ne renvoie pas les chiffres",()=>{
 assert.match(formatUsageSummary({unrecognized:true}),/sans montants reconnus/);
 assert.match(formatUsageSummary(null),/indisponibles/);
});
