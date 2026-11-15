import test from "node:test";
import assert from "node:assert/strict";
import {tmpdir} from "node:os";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import {join} from "node:path";
import {vrmEventFromMessage,buildVrmContext,VRM_CHOICE} from "../tchat-vrm.mjs";
import {createVrmStore,normalizeVrmEvent} from "../addons/sparktiates/vrm-store.mjs";
import {createRadioServer} from "../addons/sparktiates/radio-server.mjs";

const old={
  origin:"ai",nom:"AI Horde · Astrophysique",modele:"lmstudio/Qwen3.5-9B",
  heure:"09:15:02",
  texte:"Audit de marée : erreur dans l'accélération maximale. \n"+
    "Formule d'origine : a_max = 2 G M_L / d².\n"+
    "Correction candidate : a_max = 2 G M_L R_T / d³. Cette correction doit être vérifiée."
};
const question={origin:"human",nom:"Vous",heure:"09:19:00",
  texte:"Vérifiez la contradiction entre le potentiel quadrupolaire et l'accélération de marée."};
const second={
  origin:"ai",nom:"AI Horde · Sélénologie",heure:"09:18:50",
  texte:"L'affirmation que le potentiel de marée est incorrect dimensionnellement doit être réexaminée : "+
    "Phi = -G M_L r²/(2 d³)(3 cos²(theta)-1) est en m²/s²."
};
const event1=vrmEventFromMessage(old,{topic:"Marées lunaires",at:"2026-11-15T09:15:00Z"});
const event2=vrmEventFromMessage(question,{topic:"Marées lunaires",at:"2026-11-15T09:19:00Z"});
const event3=vrmEventFromMessage(second,{topic:"Marées lunaires",at:"2026-11-15T09:18:50Z"});

test("VRM conserve les équations exactes, les auteurs et les preuves non certifiées",()=>{
  assert.match(event1.id,/^[a-f0-9]{16}$/);
  assert.equal(event1.type,"CORRECTION_CANDIDATE");
  assert.equal(event1.evidence,"PROPOSITION_IA_NON_VÉRIFIÉE");
  assert.equal(event2.type,"NOTE");
  assert.equal(event1.text,old.texte);
  assert.equal(vrmEventFromMessage(old,{topic:"autre",at:"2027-01-01T00:00:00Z"}).id,event1.id);
  assert.equal(vrmEventFromMessage({origin:"ai",texte:"",heure:"10:00"}),null);
});
test("La VRM restaure la discussion sur les marées sans déclarer les propos IA vrais",()=>{
  const context=buildVrmContext([event1,event3,event2],{question:question.texte,maxChars:3200});
  assert.match(context,/PROPOSITION_IA_NON_VÉRIFIÉE/);
  assert.match(context,/accélération maximale|accélération de marée/);
  assert.match(context,/2 G M_L/);
  assert.match(context,/CANDIDATS NON VÉRIFIÉS/);
  assert.ok(context.length<=3200);
  assert.equal(buildVrmContext([],{}),"");
});
test("Une réponse trop longue est conservée sans inventer de résumé génératif",()=>{
  const paragraph="Texte doctoral avec équation a_max = 2GM_L R_T/d^3.\n";
  const e=vrmEventFromMessage({origin:"ai",texte:paragraph.repeat(120),heure:"09:25"});
  const context=buildVrmContext([e],{question:"a_max marée",maxChars:1200});
  assert.ok(context.length<1200);
  assert.match(context,/2GM_L R_T/);
});
test("Le serveur valide strictement les écritures et refuse les changements d'identifiant",()=>{
  assert.deepEqual(normalizeVrmEvent(event1),event1);
  assert.throws(()=>normalizeVrmEvent({...event1,id:"../bad"}),/ID VRM/);
  assert.throws(()=>normalizeVrmEvent({...event1,type:"MESURÉ_CERTIFIÉ"}),/Type VRM/);
  assert.throws(()=>normalizeVrmEvent({...event1,text:"A".repeat(11000)}),/trop long/);
  assert.equal(VRM_CHOICE,"radio-vrm-enabled-v1");
});
test("SPARKTIATES écrit les événements sur disque, dédoublonne et les retrouve après redémarrage",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"vrm-sparktiates-"));
  const file=join(dir,"radio-vrm","events.jsonl");
  try{
    const a=createVrmStore({file});
    assert.deepEqual((await a.status()).events,0);
    assert.equal((await a.merge([event1,event2])).accepted,2);
    assert.equal((await a.merge([event1])).duplicates,1);
    await assert.rejects(a.merge([{...event1,text:"texte détourné"}]),/Conflit/);
    const b=createVrmStore({file});
    assert.equal((await b.status()).events,2);
    assert.deepEqual((await b.read({offset:0,limit:1})).next,1);
    const second=await b.read({offset:1,limit:2});
    assert.equal(second.events[0].text,event2.text);
    assert.equal(second.next,null);
    const raw=await readFile(file,"utf8");
    assert.equal(raw.trimEnd().split("\n").length,2);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test("HTTP privé : jeton, origine, transmission, lecture et refus sans autorisation",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"vrm-http-"));
  const token="vrm-test-token-0123456789abcdef";
  const server=createRadioServer({token,vrmStore:createVrmStore({file:join(dir,"events.jsonl")}),
    fetcher:async()=>{throw Error("Ollama ne doit pas être appelé pour la mémoire VRM");}});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const base="http://127.0.0.1:"+server.address().port;
  const h={"Authorization":"Bearer "+token,"Origin":"https://lecorre894-web.github.io"};
  try{
    assert.equal((await fetch(base+"/v1/vrm/events")).status,401);
    assert.equal((await fetch(base+"/v1/vrm/events",{
      headers:{...h,Origin:"https://evil.example"}
    })).status,403);
    const post=await fetch(base+"/v1/vrm/events",{
      method:"POST",headers:{...h,"Content-Type":"application/json"},
      body:JSON.stringify({events:[event1,event2]})
    });
    assert.equal(post.status,200);
    assert.equal((await post.json()).accepted,2);
    const get=await fetch(base+"/v1/vrm/events?offset=0&limit=50",{headers:h});
    assert.equal(get.status,200);
    assert.equal(get.headers.get("access-control-allow-origin"),h.Origin);
    const data=await get.json();
    assert.equal(data.total,2);
    assert.equal(data.events[0].text,event1.text);
    const err=await fetch(base+"/v1/vrm/events",{
      method:"POST",headers:{...h,"Content-Type":"application/json"},
      body:JSON.stringify({events:[{...event1,type:"DOCTORAT_CERTIFIÉ"}]})
    });
    assert.equal(err.status,422);
    const status=await fetch(base+"/v1/vrm/status",{headers:h});
    assert.equal((await status.json()).events,2);
  }finally{
    await new Promise(resolve=>server.close(resolve));
    await rm(dir,{recursive:true,force:true});
  }
});
