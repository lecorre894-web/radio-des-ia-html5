import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {routeHordeQuestion,detectHordeMetaOutput,generalistRetryMessages} from "../tchat-horde-quality.mjs";
import {buildHordeMessages} from "../tchat-horde.mjs";

const question="Bonsoirs en sachant que la douleur ça fait très mal pourquoi les IA cherchent-elles à la découvrir ?";
const meta=[
  '"'+question+'"',
  "(Good evening, knowing that pain hurts a lot, why do AIs seek to discover it?)",
  "Astrophysics, lunar physics, orbital dynamics, gravitation, geophysics, dimensional calculation.",
  "French. Scientific rigor, explicit hypotheses, equations, units, counter-examples, limits.",
  "The user is asking a philosophical/biological/AI question, but my temporary methodological role is an astrophysicist/geophysicist.",
  "* The user is asking about AI and pain.",
  "* My role is Astrophysics/Geophysics.",
  "* Conflict: The question is outside my specific domain of expertise."
].join("\n");

test("Une question sur la douleur remplace le rôle astrophysique hérité du Salon lunaire",()=>{
  const routed=routeHordeQuestion({history:[{origin:"human",texte:question}],topic:"La Lune"});
  assert.equal(routed.id,"cognition");
  assert.equal(routed.label,"Sciences cognitives");
  assert.equal(routed.isTopicShift,true);
  const prompt=buildHordeMessages({history:[{origin:"human",texte:question}],
    topic:"La Lune",role:"Astrophysique",includeHistory:false});
  assert.match(prompt[0].content,/Neurosciences/);
  assert.doesNotMatch(prompt[0].content,/Astrophysique/);
  assert.doesNotMatch(prompt[1].content,/Sujet directeur : La Lune/);
});
test("Une question vraiment lunaire reste routée vers la physique lunaire",()=>{
  const routed=routeHordeQuestion({history:[{origin:"human",texte:"Explique la libration de la Lune."}]});
  assert.equal(routed.id,"lunar");
  assert.match(routed.role,/Astrophysique/);
});
test("Le contexte privé ancien n'est jamais envoyé sans consentement",()=>{
  const history=[{origin:"human",texte:"information privée ancienne"},{origin:"human",texte:question}];
  assert.doesNotMatch(JSON.stringify(buildHordeMessages({history,includeHistory:false})),/information privée ancienne/);
  assert.match(JSON.stringify(buildHordeMessages({history,includeHistory:true})),/information privée ancienne/);
  const retry=generalistRetryMessages({history,topic:"La Lune",domain:"cognition"});
  assert.equal(retry[1].content,question);
  assert.doesNotMatch(JSON.stringify(retry),/information privée ancienne/);
});
test("La mauvaise réponse visible est rejetée, une bonne réponse scientifique est conservée",()=>{
  assert.match(detectHordeMetaOutput(meta),/consignes|commenté/);
  assert.match(detectHordeMetaOutput("<think>Je dois réfléchir</think>Réponse"),/Raisonnement/);
  assert.equal(detectHordeMetaOutput("La nociception détecte le dommage ; la souffrance subjective des IA reste non démontrée."),"");
  assert.equal(detectHordeMetaOutput("MESURÉ, RECONSTRUIT, CANDIDAT, ARTEFACT et INCONNU désignent différents statuts de preuve."),"");
});

const source=readFileSync(new URL("../tchat-distant.mjs",import.meta.url),"utf8");
const start=source.indexOf("async function nextHordeTurn(){");
const end=source.indexOf("function getPollinationsStoredToken(){",start);
assert.ok(start>0 && end>start);
const functionText=source.slice(start,end);
function harness(responses){
  const state={busy:false,auto:false,hordeModel:"lmstudio/Qwen3.5-9B",hordeIndex:0,
    messages:[{origin:"human",texte:question,nom:"Vous",heure:"05:55"}],
    controller:null,current:null,activeCard:null,tours:0,sujet:"La Lune"};
  const nodes={pieceUtiliser:{checked:false},hordePartagerContexte:{checked:false},
    sujet:{value:"La Lune"},longueur:{value:"400"}};
  const calls=[],statuses=[];
  const d={
    state,hordeLoading:false,hordeModels:[{id:state.hordeModel,workers:1}],documentManager:null,
    $:id=>nodes[id]||{},
    routeHordeQuestion,buildHordeMessages,detectHordeMetaOutput,generalistRetryMessages,
    cleanAnswer:x=>String(x).trim(),qualityIssue:()=>"",
    chatWithHorde:async args=>{
      calls.push(args);
      if(!responses.length)throw Error("Troisième appel interdit");
      const value=responses.shift();
      if(value instanceof Error)throw value;
      return {text:value,model:state.hordeModel};
    },
    status:s=>statuses.push(s),render:()=>{},buttonStates:()=>{},speech:()=>{},
    boundedTokens:x=>Number(x),isHordeMode:()=>true,HORDE_WAIT_LIMIT_MS:180_000
  };
  const fn=new Function("d",
    "const {state,hordeLoading,hordeModels,documentManager,$,routeHordeQuestion,buildHordeMessages,detectHordeMetaOutput,generalistRetryMessages,cleanAnswer,qualityIssue,chatWithHorde,status,render,buttonStates,speech,boundedTokens,isHordeMode,HORDE_WAIT_LIMIT_MS}=d;\n"+
    functionText+"\nreturn nextHordeTurn;");
  return {state,calls,statuses,execute:fn(d)};
}
test("Une sortie méta est rejetée puis une unique reformulation française est acceptée",async()=>{
  const good="Les IA étudient la douleur pour comprendre les mécanismes biologiques. Les signaux artificiels ne prouvent pas une souffrance vécue.";
  const h=harness([meta,good]);
  await h.execute();
  assert.equal(h.calls.length,2);
  assert.match(h.calls[0].messages[0].content,/Neurosciences/);
  assert.match(h.calls[1].messages[0].content,/nociception/i);
  assert.equal(h.state.messages.length,2);
  assert.equal(h.state.messages[1].texte,good);
  assert.match(h.state.messages[1].nom,/Sciences cognitives/);
  assert.equal(h.state.tours,1);
  assert.ok(h.statuses.some(x=>x.includes("Une seule reformulation")));
});
test("Deux réponses méta : aucun contenu défaillant publié, pas de troisième appel",async()=>{
  const h=harness([meta,meta]);await h.execute();
  assert.equal(h.calls.length,2);
  assert.equal(h.state.messages.length,1);
  assert.equal(h.state.messages[0].texte,question);
  assert.equal(h.state.tours,0);
  assert.ok(h.statuses.some(x=>x.includes("Deux réponses méta")));
});
test("Erreur API : aucune seconde tentative automatique et historique conservé",async()=>{
  const h=harness([new Error("Réseau indisponible")]);await h.execute();
  assert.equal(h.calls.length,1);
  assert.equal(h.state.messages.length,1);
  assert.ok(h.statuses.some(x=>x.includes("Aucun nouvel essai automatique")));
});
