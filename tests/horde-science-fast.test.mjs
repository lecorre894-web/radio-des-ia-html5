import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  normalizeHordeModels,buildHordeMessages,listHordeModels,chatWithHorde,
  HORDE_BASE,HORDE_ANONYMOUS_KEY
} from "../tchat-horde.mjs";

test("Version restaurée : modèles AI Horde annoncés, pas de travailleurs fictifs",()=>{
  const values=normalizeHordeModels({data:[
    {id:"lmstudio/Qwen3.5-9B",x_horde:{worker_count:1}},
    {id:"Community/fast-8B",x_horde:{worker_count:2}},
    {id:"Community/fast-8B",x_horde:{worker_count:2}}
  ]});
  assert.equal(values.length,2);
  assert.equal(values[0].id,"Community/fast-8B");
  assert.equal(values[0].workers,2);
});
test("Questions humaines reprises fidèlement et contexte partagé uniquement sur consentement",()=>{
  const history=[
    {origin:"human",texte:"Une ancienne information privée"},
    {origin:"ai",nom:"Cairn",texte:"Réponse ancienne"},
    {origin:"human",texte:"Quel rôle joue la Lune dans les marées terrestres ?"}
  ];
  const minimum=buildHordeMessages({history,topic:"La Lune",includeHistory:false});
  const text=JSON.stringify(minimum);
  assert.match(text,/Quel rôle joue la Lune/);
  assert.doesNotMatch(text,/information privée/);
  assert.match(text,/MESURÉ/);
  const shared=buildHordeMessages({history,topic:"La Lune",includeHistory:true});
  assert.match(JSON.stringify(shared),/information privée/);
});
test("Catalogue et génération via le fournisseur AI Horde sans Puter ni Pollen",async()=>{
  const list=await listHordeModels({fetcher:async(url,opts)=>{
    assert.equal(url,HORDE_BASE+"/models");
    assert.equal(opts.method,"GET");
    return {ok:true,async text(){return JSON.stringify({data:[{id:"lmstudio/Qwen3.5-9B",x_horde:{worker_count:1}}]});}};
  }});
  assert.equal(list[0].id,"lmstudio/Qwen3.5-9B");
  const result=await chatWithHorde({
    model:list[0].id,messages:[{role:"user",content:"Lune"}],maxTokens:9999,
    fetcher:async(url,opts)=>{
      assert.equal(url,HORDE_BASE+"/chat/completions");
      assert.equal(opts.headers.Authorization,"Bearer "+HORDE_ANONYMOUS_KEY);
      const body=JSON.parse(opts.body);
      assert.equal(body.max_tokens,400);
      assert.equal(body.model,list[0].id);
      return {ok:true,async text(){return JSON.stringify({choices:[{message:{content:"La Lune influence les marées."}}]});}};
    }
  });
  assert.match(result.text,/La Lune/);
});
test("Le Salon fonctionnel conserve les cinq moteurs et les anciens messages",()=>{
  const html=readFileSync(new URL("../tchat.html",import.meta.url),"utf8");
  const js=readFileSync(new URL("../tchat-distant.mjs",import.meta.url),"utf8");
  for(const engine of ["puter","horde","pollinations","research-local","sparktiates"])
    assert.ok(html.includes('value="'+engine+'"'),engine);
  for(const id of ["hordeActualiser","hordeModele","hordePartagerContexte","fil","reessayerDernier","parler"])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(js,/if\(isHordeMode\(\)\)return nextHordeTurn\(\)/);
  assert.match(js,/window\.puter\.ai\.chat/);
  assert.doesNotMatch(js,/initScientificCoordinator|initNoaaValidation/);
  assert.match(html,/ChatGPT et René Le Corre®/);
});
