import test from "node:test";
import assert from "node:assert/strict";
import {createVrmStore} from "../addons/sparktiates/vrm-store.mjs";
import {buildVrmVirtualWorld} from "../addons/sparktiates/vrm-reality-engine.mjs";
import {createRadioServer} from "../addons/sparktiates/radio-server.mjs";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";

const original={id:"0123456789abcdef",origin:"ai",type:"CANDIDAT",
  text:"Dans le calcul du potentiel de marée, le rayon terrestre R_T intervient dans l'accélération différentielle.",
  time:"2026-11-15T09:12:00Z",nom:"Astrophysique",model:"Qwen3.5-9B",topic:"Marées de la Lune"};
const correction={...original,id:"0123456789abcdee",type:"CORRECTION_CANDIDATE",
  text:"Correction candidate de marée : accélération différentielle 2GM_L R_T/d³. Erreur antérieure : 2GM_L/d².",
  nom:"Sélénologie",time:"2026-11-15T09:19:00Z"};
const unrelated={...original,id:"0123456789abcded",
  text:"Catalogue scientifique de minéralogie du sol martien.",topic:"Mars",nom:"Méthodes"};
test("Monde virtuel : nœuds attribués, arêtes non certifiées, extrapolations non effectuées",()=>{
  const world=buildVrmVirtualWorld([original,correction,unrelated]);
  assert.equal(world.nodes.length,3);
  assert.equal(world.nodes[0].status,"CANDIDAT_NON_VÉRIFIÉ");
  assert.ok(world.edges.some(e=>e.from===original.id&&e.to===correction.id));
  assert.ok(world.edges.every(e=>e.kind==="ASSOCIATION_CANDIDATE"&&!e.verified));
  assert.ok(world.extrapolationPlans.some(e=>e.id==="GRAVITATION_UNITES"&&e.proof==="NON_EFFECTUÉE"));
  assert.ok(!world.edges.some(e=>e.from===original.id&&e.to===unrelated.id));
  assert.match(world.semanticLimit,/ni causalité/);
  assert.equal(buildVrmVirtualWorld([]).nodes.length,0);
});
test("Un monde simulé n'ajoute aucune mesure ni aucun diplôme à la provenance",()=>{
  const world=buildVrmVirtualWorld([original]);
  assert.deepEqual(Object.keys(world.nodes[0]).includes("diploma"),false);
  assert.ok(world.nodes[0].excerpt.includes("rayon terrestre"));
  assert.equal(world.extrapolationPlans[0].status,"CANDIDAT");
});
test("SPARKTIATES /v1/vrm/world exige le jeton et se calcule sans Ollama",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"vrm-world-"));
  const token="private-vrm-test-token-abcdefghijklmnopqrstuvwxyz";
  const store=createVrmStore({file:join(dir,"events.jsonl")});
  await store.merge([original,correction]);
  const server=createRadioServer({token,vrmStore:store,
    fetcher:async()=>{throw Error("Ollama ne doit pas être appelé");}});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const base="http://127.0.0.1:"+server.address().port;
  try{
    assert.equal((await fetch(base+"/v1/vrm/world")).status,401);
    const r=await fetch(base+"/v1/vrm/world?topic=Marées",{headers:{
      Authorization:"Bearer "+token,Origin:"https://lecorre894-web.github.io"
    }});
    assert.equal(r.status,200);
    const world=await r.json();
    assert.equal(world.counts.nodes,2);
    assert.ok(world.edges.length>=1);
    assert.equal(world.execution,"CALCUL_DÉTERMINISTE_SUR_MACHINE_RÉELLE");
  }finally{
    await new Promise(resolve=>server.close(resolve));
    await rm(dir,{recursive:true,force:true});
  }
});
