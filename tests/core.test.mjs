import test from "node:test";
import assert from "node:assert/strict";
import {buildPrompt,responseText,cleanAnswer,qualityIssue,lastHuman,PERPLEXITY,addPerplexity,KIMI,addKimi} from "../tchat-core.mjs";

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

test("mode débat : les IA argumentent entre elles et interpellent la suivante",()=>{
 const messages=[
  {origin:"human",texte:"Quels tests distingueraient un artefact d'un signal ?"},
  {origin:"ai",nom:"Cairn",texte:"Je propose un contrôle négatif et une reproductibilité inter-instruments."},
  {origin:"ai",nom:"Brume",texte:"Attention au biais d'échantillonnage : il faut des jeux disjoints."}
 ];
 const req=buildPrompt({
   participants:people,index:0,messages,sujet:"Imagerie multi-échelle",
   mode:"debate",recipient:"Brume",round:2
 });
 assert.match(req[0].content,/Adresse-toi à Brume/);
 assert.match(req[1].content,/Quels tests distingueraient un artefact d'un signal \?/);
 assert.match(req[1].content,/biais d'échantillonnage/);
 assert.match(req[1].content,/contrôle négatif/);
 assert.match(req[1].content,/une question précise adressée à Brume/);
});
test("mode spectateur : sujet proposé sans question humaine",()=>{
 const req=buildPrompt({participants:people,index:1,messages:[],sujet:"",mode:"debate",recipient:"Cairn",round:0});
 assert.match(req[1].content,/Choisis un sujet scientifique ou philosophique précis/);
 assert.match(req[0].content,/Cairn/);
});
test("mode spectateur : une simple salutation ne bloque pas un sujet",()=>{
 const req=buildPrompt({
   participants:people,index:0,mode:"debate",recipient:"Brume",
   messages:[{origin:"human",texte:"Bonsoir"}],
   sujet:"Les limites des ondes gravitationnelles"
 });
 assert.match(req[1].content,/Les limites des ondes gravitationnelles/);
 assert.doesNotMatch(req[1].content,/QUESTION HUMAINE.*Bonsoir/s);
});

test("Perplexity est le quatrième intervenant et utilise bien Sonar Pro",()=>{
 assert.equal(PERPLEXITY.nom,"Perplexity");
 assert.equal(PERPLEXITY.modele,"perplexity/sonar-pro");
 const arr=addPerplexity([
  {nom:"Cairn",modele:"gpt-5.5"},
  {nom:"Brume",modele:"claude-sonnet-4-6"},
  {nom:"Aurore",modele:"gemini-3.1-flash-lite"}
 ]);
 assert.deepEqual(arr.map(x=>x.nom),["Cairn","Brume","Aurore","Perplexity"]);
 assert.match(arr[3].role,/Vérificateur indépendant/);
});
test("la migration est idempotente et ne remplace pas un vrai modèle Perplexity",()=>{
 const data=addPerplexity([{nom:"Perplexity",modele:"perplexity/sonar",role:"Surveillance des sources"}]);
 const again=addPerplexity(data);
 assert.equal(again.length,1);
 assert.equal(again[0].modele,"perplexity/sonar");
});
test("Perplexity ne doit pas parler sous un moteur GPT mal étiqueté",()=>{
 const arr=addPerplexity([{nom:"Perplexity",modele:"gpt-5.5",role:"Audit"}]);
 assert.equal(arr[0].modele,"perplexity/sonar-pro");
});
test("Perplexity reçoit les instructions de vérification et de sources",()=>{
 const people=[{...PERPLEXITY},{nom:"Cairn",role:"Audit",modele:"gpt-5.5"}];
 const req=buildPrompt({
  participants:people,index:0,mode:"debate",recipient:"Cairn",round:1,
  messages:[{origin:"human",texte:"Que savons-nous du résultat X ?"},{origin:"ai",nom:"Cairn",texte:"Le résultat est certain."}]
 });
 assert.match(req[0].content,/Mission particulière/);
 assert.match(req[0].content,/sources/);
 assert.match(req[0].content,/tests|test ou un contrôle/);
 assert.match(req[1].content,/Le résultat est certain/);
});

test("Kimi K3.1 Pro est le cinquième vrai intervenant",()=>{
 assert.equal(KIMI.nom,"Kimi");
 assert.equal(KIMI.modele,"moonshotai/kimi-k3.1-pro");
 const first=addKimi(addPerplexity([
  {nom:"Cairn",modele:"gpt-5.5"},
  {nom:"Brume",modele:"claude-sonnet-4-6"},
  {nom:"Aurore",modele:"gemini-3.1-flash-lite"}
 ]));
 assert.deepEqual(first.map(x=>x.nom),["Cairn","Brume","Aurore","Perplexity","Kimi"]);
 assert.equal(addKimi(first).length,5);
});
test("la migration Kimi conserve le véritable fournisseur Moonshot sans duplication",()=>{
 const custom=addKimi([{nom:"Kimi",modele:"moonshotai/kimi-k3",role:"Recherche scientifique"}]);
 assert.equal(custom.length,1);
 assert.equal(custom[0].modele,"moonshotai/kimi-k3");
 assert.equal(custom[0].role,"Recherche scientifique");
 const incorrect=addKimi([{nom:"Kimi",modele:"gpt-5.5",role:"Contradiction"}]);
 assert.equal(incorrect[0].modele,KIMI.modele);
});
test("Kimi reçoit les instructions d'analyse et d'expérimentation",()=>{
 const people=[KIMI,{nom:"Perplexity",modele:"perplexity/sonar-pro",role:"Sources"}];
 const req=buildPrompt({participants:people,index:0,mode:"debate",recipient:"Perplexity",round:4,
  messages:[{origin:"human",texte:"Analyse les limites de la preuve."},
    {origin:"ai",nom:"Perplexity",texte:"La source ne précise pas les conditions expérimentales."}]});
 assert.match(req[0].content,/Mission particulière Kimi/);
 assert.match(req[0].content,/protocole de test reproductible/);
 assert.match(req[1].content,/conditions expérimentales/);
 assert.match(req[0].content,/Adresse-toi à Perplexity/);
});
