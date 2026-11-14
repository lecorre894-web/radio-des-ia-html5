import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {normalizeHordeModels,buildHordeMessages,listHordeModels,chatWithHorde,HORDE_BASE} from "../tchat-horde.mjs";

function mockResponse(body,{ok=true,status=200,headers={}}={}){
  return {ok,status,headers:new Headers(headers),async text(){return JSON.stringify(body);}};
}

test("Le catalogue AI Horde ne contient que les identifiants servis, sans modèle inventé",()=>{
  const models=normalizeHordeModels({object:"list",data:[
    {id:"community-7b",context_length:4096,x_horde:{worker_count:2}},
    {id:"community-9b",x_horde:{worker_count:3}},
    {id:"community-7b"}, {id:""}
  ]});
  assert.deepEqual(models.map(m=>m.id),["community-9b","community-7b"]);
  assert.equal(models[1].context,4096);
});
test("Le contexte du Salon n'est pas envoyé sans autorisation ; on transmet seulement le dernier message humain",()=>{
  const history=[
    {origin:"human",texte:"Ancien secret (ne pas envoyer)"},
    {origin:"ai",nom:"Cairn",texte:"Ancienne réponse"},
    {origin:"human",texte:"Pourquoi la face cachée de la Lune reste-t-elle invisible depuis la Terre ?"}
  ];
  const out=buildHordeMessages({history,topic:"La Lune",role:"Astrophysique"});
  const text=JSON.stringify(out);
  assert.equal(out.length,2);
  assert.ok(text.includes("Pourquoi la face cachée"));
  assert.ok(!text.includes("Ancien secret"));
  assert.ok(!text.includes("Ancienne réponse"));
  assert.ok(text.includes("MESURÉ"));
});
test("Partage explicite : échanges précédents cités sans usurper une IA",()=>{
  const hist=[{origin:"human",texte:"question ancienne"},{origin:"ai",nom:"Kimi",texte:"une hypothèse"},
    {origin:"human",texte:"question actuelle"}];
  const out=buildHordeMessages({history:hist,includeHistory:true,role:"Audit scientifique"});
  assert.equal(out.length,2);
  assert.match(out[1].content,/question ancienne/);
  assert.match(out[1].content,/Intervenant IA \[Kimi\]/);
  assert.match(out[0].content,/non ChatGPT|non ChatGPT, Claude, Kimi/);
  assert.equal(out.filter(m=>m.role==="assistant").length,0);
});
test("Catalogue : un appel GET seulement avec la bonne adresse",async()=>{
  let called=0;
  const models=await listHordeModels({fetcher:async(url,options)=>{
    called++;
    assert.equal(url,HORDE_BASE+"/models");
    assert.equal(options.method,"GET");
    return mockResponse({data:[{id:"Example"}]});
  }});
  assert.equal(called,1);
  assert.equal(models[0].id,"Example");
});
test("Une réponse réelle utilise la clé anonyme documentée, le modèle sélectionné, pas Puter",async()=>{
  let called=0;
  const resp=await chatWithHorde({model:"worker-model",messages:[{role:"user",content:"La Lune"}],maxTokens:2500,
    fetcher:async(url,options)=>{
      called++;
      assert.equal(url,HORDE_BASE+"/chat/completions");
      assert.equal(options.headers.Authorization,"Bearer 0000000000");
      const request=JSON.parse(options.body);
      assert.equal(request.model,"worker-model");
      assert.equal(request.stream,false);
      assert.ok(request.max_tokens<=400);
      assert.equal(request.horde.include_reasoning,false);
      return mockResponse({model:"worker-model",choices:[{message:{content:"Réponse documentée"}}]});
    }});
  assert.equal(called,1);
  assert.equal(resp.text,"Réponse documentée");
  assert.equal(resp.model,"worker-model");
});
test("Échec réseau : aucune répétition automatique ni promesse de disponibilité",async()=>{
  let called=0;
  await assert.rejects(chatWithHorde({model:"a",messages:[{role:"user",content:"x"}],
    fetcher:async()=>{
      called++;
      return mockResponse({error:{message:"pas de travailleurs"}},{ok:false,status:503});
    }}),/AI Horde HTTP 503/);
  assert.equal(called,1);
});
test("La Radio historique conserve Puter et le moteur local plus AI Horde",()=>{
  const html=readFileSync(new URL("../tchat.html",import.meta.url),"utf8");
  const script=readFileSync(new URL("../tchat-distant.mjs",import.meta.url),"utf8");
  for(const id of ["moteurDialogue","hordeControls","hordeActualiser","hordeModele",
    "hordePartagerContexte","hordeEtat","moi","parler","tour","infini","debattre","fil"]){
    assert.ok(html.includes('id="'+id+'"'),id);
  }
  assert.ok(html.includes('value="puter"'));
  assert.ok(html.includes('value="research-local"'));
  assert.ok(html.includes('value="horde"'));
  assert.match(script,/if\(isHordeMode\(\)\)return nextHordeTurn\(\)/);
  assert.match(script,/window\.puter\.ai\.chat\(/);
  assert.match(script,/nextResearchTurn/);
  assert.match(script,/state\.hordeModel/);
  assert.match(html,/ChatGPT et René Le Corre®/);
});
