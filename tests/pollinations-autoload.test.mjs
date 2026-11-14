import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {normalizePollinationsModels,listPollinationsModels} from "../tchat-pollinations.mjs";
const js=readFileSync(new URL("../tchat-distant.mjs",import.meta.url),"utf8");
const html=readFileSync(new URL("../tchat.html",import.meta.url),"utf8");

test("Après autorisation OAuth et restauration, la liste est actualisée sans génération",()=>{
  assert.match(js,/void finishPollinationsCallback\(\)\.then\(\(\)=>\{/);
  assert.match(js,/if\(pollinationsToken && isPollinationsMode\(\) && !pollinationsModels\.length\)/);
  assert.match(js,/void refreshPollinationsModels\(\)/);
  assert.match(js,/pollinationsModels=catalog/);
  assert.match(js,/async function refreshPollinationsModels\(\)/);
  assert.match(js,/const catalog=await listPollinationsModels\(\)/);
  // La sélection demeure explicitement sous le contrôle de l'utilisateur :
  assert.match(js,/state\.pollinationsModel="";select\.value=""/);
  assert.match(js,/pollinationsModele"\)\.addEventListener\("change"/);
  assert.match(js,/pollinationsApproved=false;save\(\)/);
});
test("Le catalogue est un appel public GET et non une génération qui dépense des crédits",async()=>{
  let calls=0;
  const list=await listPollinationsModels({fetcher:async(url,opts)=>{
    calls++;
    assert.equal(url,"https://gen.pollinations.ai/text/models");
    assert.equal(opts.method,"GET");
    assert.equal(opts.headers,undefined);
    return {
      ok:true,
      async text(){return JSON.stringify([{id:"openai/gpt-5.4-nano",title:"GPT 5.4 Nano"},
        {id:"anthropic/claude-sonnet-4.6",title:"Claude Sonnet"},
        {id:"openai/gpt-5.4-nano"}]);}
    };
  }});
  assert.equal(calls,1);
  assert.deepEqual(list.map(m=>m.id),["anthropic/claude-sonnet-4.6","openai/gpt-5.4-nano"]);
  assert.ok(!js.slice(js.indexOf("async function refreshPollinationsModels"),js.indexOf("async function nextPollinationsTurn"))
    .includes("chatWithPollinations("));
});
test("La Radio reste utilisable sans Pollinations, même si le catalogue échoue",()=>{
  for(const type of ["puter","research-local","horde","pollinations","sparktiates"])
    assert.ok(html.includes('value="'+type+'"'));
  for(const id of ["pollinationsModele","pollinationsActualiser","reessayerDernier","etatComposer"])
    assert.ok(html.includes('id="'+id+'"'));
  assert.match(js,/Catalogue Pollinations inaccessible/);
  assert.match(js,/Une fois le moteur configuré, utilise/);
  assert.match(html,/tchat-distant\.mjs\?v=[^"]+pollinations=3/);
});
