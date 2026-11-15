import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {chatWithHorde,HORDE_MAX_REPLY_TOKENS,HORDE_DEFAULT_REPLY_TOKENS} from "../tchat-horde.mjs";

const code=readFileSync(new URL("../tchat-distant.mjs",import.meta.url),"utf8");
const html=readFileSync(new URL("../tchat.html",import.meta.url),"utf8");
const begin=code.indexOf("function mergeHordeAnswerParts(");
const end=code.indexOf("function getPollinationsStoredToken(",begin);
assert.ok(begin>=0&&end>begin);
const block=code.slice(begin,end);

function harness(responses){
  const state={
    messages:[{origin:"human",texte:"Explique la cause de la libration lunaire en détail",heure:"08:15"}],
    hordeModel:"lmstudio/Qwen3.5-9B",tours:0,hordeIndex:0,busy:false,auto:false,
    current:null,controller:null,activeCard:null
  };
  const elements={
    pieceUtiliser:{checked:false},hordePartagerContexte:{checked:false},
    hordeLongueur:{value:"1800"},sujet:{value:"La Lune"}
  };
  const calls=[],statuses=[],renders=[];
  const d={
    state,hordeLoading:false,hordeModels:[{id:state.hordeModel}],
    documentManager:null,$:id=>elements[id]||{},
    RESEARCH_ROLES:[{nom:"Audit scientifique",specialite:"Science"}],
    buildHordeMessages:()=>[{role:"system",content:"Réponds en français."},{role:"user",content:state.messages[0].texte}],
    chatWithHorde:async args=>{
      calls.push(args);
      const r=responses.shift();
      if(r instanceof Error)throw r;
      if(!r)throw Error("Trop de demandes");
      return {model:state.hordeModel,...r};
    },
    cleanAnswer:x=>x,qualityIssue:()=>"",
    render:()=>renders.push(state.messages.map(x=>x.texte)),
    buttonStates:()=>{},status:x=>statuses.push(x),speech:()=>{}
  };
  const fn=new Function("d",
    "const {state,hordeLoading,hordeModels,documentManager,$,RESEARCH_ROLES,buildHordeMessages,chatWithHorde,cleanAnswer,qualityIssue,render,buttonStates,status,speech}=d;\n"+
    block+"\nreturn {nextHordeTurn,mergeHordeAnswerParts,hordeContinuationPrompt};");
  return {...fn(d),state,calls,statuses,renders,elements};
}

test("AI Horde: 400 tokens n'est plus une limite cachée ; le maximum est 2500",async()=>{
  assert.equal(HORDE_DEFAULT_REPLY_TOKENS,1800);
  assert.equal(HORDE_MAX_REPLY_TOKENS,2500);
  for(const [chosen,expected] of [[1800,1800],[2500,2500],[5000,2500]]){
    await chatWithHorde({
      model:"lmstudio/Qwen3.5-9B",
      messages:[{role:"user",content:"Bonjour"}],
      maxTokens:chosen,
      fetcher:async(_,init)=>{
        const body=JSON.parse(init.body);
        assert.equal(body.max_tokens,expected);
        return {ok:true,async text(){return JSON.stringify({
          model:body.model,choices:[{message:{content:"Bonjour."},finish_reason:"stop"}]});}};
      }
    });
  }
});
test("La suite est automatiquement ajoutée dans la même bulle si finish_reason=length",async()=>{
  const h=harness([
    {text:"La libration lunaire vient de",finishReason:"length"},
    {text:"la géométrie de l'orbite elliptique.",finishReason:"stop"}
  ]);
  await h.nextHordeTurn();
  assert.equal(h.calls.length,2);
  assert.equal(h.calls[0].maxTokens,1800);
  assert.equal(h.calls[1].messages.at(-1).role,"user");
  assert.match(h.calls[1].messages.at(-1).content,/Continue exactement/);
  assert.equal(h.state.messages.length,2);
  assert.equal(h.state.messages[1].texte,"La libration lunaire vient de la géométrie de l'orbite elliptique.");
  assert.equal(h.state.tours,1);
  assert.equal(h.state.busy,false);
  assert.ok(h.renders.length>=3);
  assert.match(h.statuses.at(-1),/réponse complète/);
});
test("Trois segments au maximum : pas de boucle infinie sur limite persistante",async()=>{
  const h=harness(Array.from({length:4},(_,i)=>({text:"Partie "+(i+1)+".",finishReason:"length"})));
  await h.nextHordeTurn();
  assert.equal(h.calls.length,3);
  assert.equal(h.state.messages.length,2);
  assert.match(h.statuses.at(-1),/encore atteint sa limite/);
});
test("La réponse déjà reçue est conservée si la continuation échoue",async()=>{
  const h=harness([{text:"Première explication.",finishReason:"length"},new Error("Réseau coupé")]);
  await h.nextHordeTurn();
  assert.equal(h.calls.length,2);
  assert.equal(h.state.messages.length,2);
  assert.equal(h.state.messages[1].texte,"Première explication.");
  assert.match(h.statuses.at(-1),/réponse partielle conservée/);
});
test("Aucun appel supplémentaire après arrêt naturel",async()=>{
  const h=harness([{text:"Réponse terminée.",finishReason:"stop"}]);
  await h.nextHordeTurn();
  assert.equal(h.calls.length,1);
  assert.equal(h.state.tours,1);
});
test("Le Salon évite reconstruction et défilements forcés lors des actions",()=>{
  const start=code.indexOf("function render(){");
  const stop=code.indexOf("function addHuman(){",start);
  const render=code.slice(start,stop);
  assert.ok(start>=0&&stop>start);
  assert.ok(render.includes("new WeakMap")||code.includes("const renderedMessageViews=new WeakMap()"));
  assert.doesNotMatch(render,/host\.replaceChildren\(/);
  assert.match(render,/host\.insertBefore\(/);
  assert.doesNotMatch(code,/scrollIntoView\?\.\(\{behavior:"smooth",block:"start"\}\)/);
  assert.doesNotMatch(code,/lastElementChild\?\.scrollIntoView/);
  assert.match(html,/id="hordeLongueur"/);
  assert.match(html,/overflow-anchor:none/);
  assert.match(html,/reprise=20261115c/);
});
