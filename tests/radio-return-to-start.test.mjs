import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {normalizeHordeModels,buildHordeMessages} from "../tchat-horde.mjs";

test("Catalogue réel sans compteur de travailleurs : INCONNU, pas zéro",()=>{
  const models=normalizeHordeModels({data:[
    {id:"lmstudio/Qwen3.5-9B",owned_by:"aihorde"},
    {id:"Nimbz/Gemma-4-Dark-Orthia-31B",owned_by:"aihorde"},
    {id:"koboldcpp/Qwen3-14B",x_horde:{worker_count:2}}
  ]});
  assert.equal(models.length,3);
  assert.equal(models.find(m=>m.id==="lmstudio/Qwen3.5-9B").workers,null);
  assert.equal(models.find(m=>m.id==="koboldcpp/Qwen3-14B").workers,2);
});

test("Bonjour est transmis sans ajout de consignes au tour humain",()=>{
  const result=buildHordeMessages({history:[{origin:"human",texte:"Bonjour"}],topic:"La Lune"});
  assert.deepEqual(result.map(m=>m.role),["system","user"]);
  assert.equal(result[1].content,"Bonjour");
  assert.ok(result[0].content.length<450);
});

const code=readFileSync(new URL("../tchat-distant.mjs",import.meta.url),"utf8");
const from=code.indexOf("async function refreshHordeModels(){");
const to=code.indexOf("async function nextHordeTurn(){",from);
assert.ok(from>=0&&to>from,"La fonction de chargement du catalogue doit rester en place.");
const body=code.slice(from,to);

function simulate(){
  const state={
    busy:false,auto:false,hordeModel:"Nimbz/Gemma-4-Dark-Orthia-31B",
    messages:[{origin:"human",texte:"Bonjour",heure:"06:17"}]
  };
  const store=new Map();
  const node={value:"",options:[],replaceChildren(){this.options=[];},
    append(option){this.options.push(option);}};
  const note=[],calls=[];
  const d={
    state,document:{createElement:()=>({value:"",textContent:""})},
    $:()=>node,buttonStates:()=>{},hordeStatus:s=>note.push(s),status:s=>note.push(s),
    localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},
    listHordeModels:async()=>{
      calls.push("GET catalog");
      return [
        {id:"lmstudio/Qwen3.5-9B",workers:null,context:null},
        {id:"Nimbz/Gemma-4-Dark-Orthia-31B",workers:null,context:null}
      ];
    },
    save:()=>{}
  };
  const factory=new Function("d",
    "const {state,document,$,buttonStates,hordeStatus,status,localStorage,listHordeModels,save}=d;\n"+
    "let hordeModels=[],hordeLoading=false;\n"+
    body+"\nreturn refreshHordeModels;");
  return {fn:factory(d),state,node,store,note,calls};
}

test("Reprise Gemma vers Qwen une seule fois, sans effacer ni envoyer la question",async()=>{
  const s=simulate();
  await s.fn();
  assert.equal(s.state.hordeModel,"lmstudio/Qwen3.5-9B");
  assert.equal(s.node.value,"lmstudio/Qwen3.5-9B");
  assert.deepEqual(s.state.messages,[{origin:"human",texte:"Bonjour",heure:"06:17"}]);
  assert.equal(s.calls.length,1);
  assert.equal(s.store.get("radio-horde-reprise-20261115"),"fait");
  assert.ok(s.note.some(x=>x.includes("Ta conversation est conservée")));
  s.state.hordeModel="Nimbz/Gemma-4-Dark-Orthia-31B";
  await s.fn();
  assert.equal(s.state.hordeModel,"Nimbz/Gemma-4-Dark-Orthia-31B",
    "Un choix manuel ultérieur ne doit pas être changé sans consentement");
});
test("La page conserve le stockage et les moteurs historiques",()=>{
  const html=readFileSync(new URL("../tchat.html",import.meta.url),"utf8");
  assert.match(code,/const KEY = "radio-salon-distant-v1"/);
  assert.ok(html.includes('id="moi"')&&html.includes('id="fil"'));
  for(const engine of ["puter","research-local","horde","pollinations","sparktiates"])
    assert.ok(html.includes('value="'+engine+'"'),engine);
  assert.doesNotMatch(code,/detectHordeMetaOutput|lastHordeBadAnswer/);
});
