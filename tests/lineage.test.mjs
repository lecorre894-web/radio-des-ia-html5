import test from "node:test";
import assert from "node:assert/strict";
import {buildPrompt} from "../tchat-core.mjs";
import {updateLineageMemory,archiveLineageSession,buildLineageContext,LINEAGE_LIMITS} from "../tchat-lineage.mjs";

const participants=[
 {nom:"Cairn",role:"Épistémologie",modele:"gpt-5.4-nano"},
 {nom:"IA4",role:"Analyse critique",modele:"gpt-5.4-nano"}
];
const dialogue=[
 {origin:"human",nom:"Vous",heure:"11:01:04",texte:"Bien une question d'alchimie, êtes vous vraiment des intelligences ou simulez vous d'en être une ? Réfléchissez aux maux aux mots"},
 {origin:"ai",nom:"IA4",heure:"11:01:05",texte:"Je suis un système d'IA générative. Sur le plan fonctionnel, je peux produire des réponses utiles. Pour préciser, que signifie intelligence pour vous ?"},
 {origin:"human",nom:"Vous",heure:"11:03:21",texte:"Intelligence douée de savoir par exemple"}
];
test("la définition humaine est reliée à sa vraie question d'origine",()=>{
 const prompt=buildPrompt({participants,index:0,messages:dialogue,mode:"direct"});
 assert.match(prompt[1].content,/Intelligence douée de savoir par exemple/);
 assert.match(prompt[1].content,/êtes vous vraiment des intelligences/);
 assert.match(prompt[1].content,/que signifie intelligence pour vous/);
 assert.match(prompt[1].content,/RÉPONSE ANTÉRIEURE/);
 assert.match(prompt[0].content,/Ne traite pas une clarification brève comme un sujet indépendant/);
});
test("le fil relie également les modèles successifs en débat",()=>{
 const prompt=buildPrompt({participants,index:1,messages:dialogue,mode:"debate",recipient:"Cairn"});
 assert.match(prompt[1].content,/FIL GÉNÉALOGIQUE/);
 assert.match(prompt[1].content,/Intelligence douée de savoir par exemple/);
 assert.match(prompt[1].content,/que signifie intelligence pour vous/);
 assert.match(prompt[0].content,/Adresse-toi à Cairn/);
});
test("le registre local est idempotent, sans multiplication des mêmes réponses",()=>{
 const once=updateLineageMemory(null,dialogue);
 const twice=updateLineageMemory(once,dialogue);
 assert.equal(once.events.length,3);
 assert.equal(twice.events.length,3);
 assert.equal(once.root,dialogue[0].texte);
 assert.deepEqual(once,twice);
});
test("les salutations seules ne deviennent pas la racine scientifique",()=>{
 const messages=[{origin:"human",texte:"Bonsoir"},
  {origin:"ai",nom:"Cairn",texte:"Bonsoir !"},
  ...dialogue];
 const memory=updateLineageMemory(null,messages);
 assert.match(memory.root,/question d'alchimie/);
 assert.doesNotMatch(memory.root,/^Bonsoir/);
});
test("un très long historique conserve sa racine après sauvegarde des 150 derniers tours",()=>{
 const more=[...dialogue];
 for(let i=0;i<240;i++)more.push({origin:i%2?"human":"ai",nom:i%2?"Vous":"Brume",
   heure:String(i),texte:"Analyse progressive de la thèse étape "+i+" : "+("données contrôlées ".repeat(20))});
 const memory=updateLineageMemory(null,more);
 assert.ok(memory.events.length<=LINEAGE_LIMITS.maxEvents);
 const recovered=more.slice(-150);
 const prompt=buildPrompt({participants,index:0,messages:recovered,memory,mode:"direct"});
 assert.match(prompt[1].content,/question d'alchimie/);
 assert.match(prompt[1].content,/étape 239/);
});
test("les anciens salons sont archivés de façon compacte sans effacer le suivant",()=>{
 const memory=updateLineageMemory(null,dialogue);
 const archive=archiveLineageSession([],memory,"Intelligence et savoir");
 assert.equal(archive.length,1);
 assert.match(archive[0].root,/question d'alchimie/);
 const newMessage=[{origin:"human",texte:"Reprenons le point précédent sur la définition du savoir"}];
 const active=buildLineageContext(newMessage,{archives:archive,includeArchives:true});
 const separate=buildLineageContext(newMessage,{archives:archive,includeArchives:false});
 assert.match(active,/AUTRES SALONS/);
 assert.match(active,/question d'alchimie/);
 assert.doesNotMatch(separate,/AUTRES SALONS/);
});
test("les instructions du dernier message prévalent sur les archives",()=>{
 const old=archiveLineageSession([],updateLineageMemory(null,dialogue));
 const prompt=buildPrompt({participants,index:0,mode:"direct",archives:old,
  messages:[{origin:"human",texte:"Nouveau sujet : calcule 6 × 7 exactement"}]});
 assert.match(prompt[1].content,/Nouveau sujet : calcule 6 × 7 exactement/);
 assert.match(prompt[0].content,/La dernière demande humaine prévaut si le sujet a changé/);
});
test("les textes n'ont pas de résumé génératif inventé et sont explicitement abrégés",()=>{
 const long=[{origin:"human",texte:"Explique ce calcul : "+("A".repeat(12000))},
  {origin:"ai",nom:"Brume",texte:"réponse "+("B".repeat(9000))},
  {origin:"human",texte:"Cela ne répond pas à mon exemple : "+("C".repeat(14000))}];
 const memory=updateLineageMemory(null,long);
 assert.ok(memory.root.length<=LINEAGE_LIMITS.rootChars+3);
 const context=buildLineageContext(long,{memory,maxChars:2000});
 assert.ok(context.length<=2000);
 assert.match(context,/extrait abrégé/);
 assert.doesNotMatch(context,/mesure certifiée par laboratoire/);
});
test("le GIF local et les réponses incomplètes ne brouillent pas les ancêtres",()=>{
 const seq=[...dialogue,{origin:"human",gifId:"gf123",texte:"GIF animé partagé"},
 {origin:"ai",nom:"Cairn",texte:""}];
 const memory=updateLineageMemory(null,seq);
 assert.equal(memory.events.length,3);
 assert.doesNotMatch(buildLineageContext(seq,{memory}),/GIF animé partagé/);
});
test("la mémoire exportée contient des extraits de conversation uniquement",()=>{
 const memory=updateLineageMemory(null,dialogue);
 assert.ok(!("apiKey" in memory));
 assert.ok(!("token" in memory));
 assert.ok(memory.events.every(x=>["human","ai"].includes(x.origin)&&x.texte));
});
