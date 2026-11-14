import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRadioServer,validModelName,validMessages} from "../addons/sparktiates/radio-server.mjs";
import {sparktiatesEndpoint,buildSparktiatesMessages,sparktiatesModels,sparktiatesChat} from "../tchat-sparktiates.mjs";

test("SPARKTIATES interdit les passerelles HTTP publiques et les URL avec des secrets",()=>{
  assert.equal(sparktiatesEndpoint("http://127.0.0.1:8788"),"http://127.0.0.1:8788");
  assert.equal(sparktiatesEndpoint("https://pont.example"),"https://pont.example");
  assert.throws(()=>sparktiatesEndpoint("http://8.8.8.8:8788"),/HTTPS/);
  assert.throws(()=>sparktiatesEndpoint("https://pont.example/path"),/origine/);
  assert.throws(()=>sparktiatesEndpoint("https://user:pass@pont.example"),/origine/);
  assert.throws(()=>sparktiatesEndpoint("https://pont.example?key=abc"),/origine/);
});
test("Le prompt ne divulgue pas les anciens échanges par défaut",()=>{
  const hist=[
    {origin:"human",texte:"ancienne donnée confidentielle"},
    {origin:"ai",nom:"Cairn",texte:"analyse précédente"},
    {origin:"human",texte:"Que sait-on de la glace lunaire ?"}
  ];
  const privatePrompt=buildSparktiatesMessages({history:hist,shareHistory:false});
  assert.ok(JSON.stringify(privatePrompt).includes("glace lunaire"));
  assert.ok(!JSON.stringify(privatePrompt).includes("confidentielle"));
  assert.ok(!JSON.stringify(privatePrompt).includes("analyse précédente"));
  const shared=buildSparktiatesMessages({history:hist,shareHistory:true});
  assert.match(JSON.stringify(shared),/analyse précédente/);
  assert.ok(shared[0].content.includes("MESURÉ"));
});
test("Le client transmet seulement au serveur configuré et respecte le modèle choisi",async()=>{
  const token="x".repeat(32),endpoint="https://pont.example",model="qwen3:8b";
  const got=await sparktiatesModels({endpoint,token,fetcher:async(url,opts)=>{
    assert.equal(url,"https://pont.example/v1/models");
    assert.equal(opts.headers.Authorization,"Bearer "+token);
    return new Response(JSON.stringify({models:[{id:model,size:1}]}),{status:200});
  }});
  assert.equal(got[0].id,model);
  const res=await sparktiatesChat({endpoint,token,model,maxTokens:10000,
    messages:[{role:"user",content:"Lune"}],fetcher:async(url,opts)=>{
      assert.equal(url,"https://pont.example/v1/chat/completions");
      assert.equal(opts.headers.Authorization,"Bearer "+token);
      const body=JSON.parse(opts.body);
      assert.equal(body.model,model);
      assert.equal(body.max_tokens,1200);
      return new Response(JSON.stringify({model,choices:[{message:{content:"Calcul local"}}]}),{status:200});
    }});
  assert.equal(res.text,"Calcul local");
});
test("Le serveur refuse les appels non authentifiés et les origines non autorisées",async()=>{
  const secret="s".repeat(48);
  const server=createRadioServer({token:secret,fetcher:async()=>new Response(JSON.stringify({models:[]}),{status:200})});
  await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
  const url="http://127.0.0.1:"+server.address().port;
  try{
    const unauth=await fetch(url+"/v1/models");
    assert.equal(unauth.status,401);
    const bad=await fetch(url+"/v1/models",{headers:{Origin:"https://attacker.example",Authorization:"Bearer "+secret}});
    assert.equal(bad.status,403);
    const preflight=await fetch(url+"/v1/chat/completions",{
      method:"OPTIONS",headers:{Origin:"https://lecorre894-web.github.io",
        "Access-Control-Request-Headers":"authorization,content-type"}
    });
    assert.equal(preflight.status,204);
    assert.equal(preflight.headers.get("access-control-allow-origin"),"https://lecorre894-web.github.io");
  }finally{await new Promise(ok=>server.close(ok));}
});
test("5 tours locaux consécutifs sans compteur logiciel, réel modèle Ollama, zéro Pollinations",async()=>{
  const secret="z".repeat(48), calls=[];
  const fakeOllama=async(url,opts)=>{
    calls.push({url,body:opts.body?JSON.parse(opts.body):null});
    if(url.endsWith("/api/tags"))
      return new Response(JSON.stringify({models:[{name:"qwen3:8b",size:5000}]}),{status:200});
    if(url.endsWith("/api/chat"))
      return new Response(JSON.stringify({model:"qwen3:8b",message:{content:"Réponse de test sur la Lune"}}),{status:200});
    throw Error("Endpoint inattendu");
  };
  const server=createRadioServer({token:secret,fetcher:fakeOllama});
  await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
  const url="http://127.0.0.1:"+server.address().port;
  try{
    const models=await sparktiatesModels({endpoint:url,token:secret});
    assert.equal(models[0].id,"qwen3:8b");
    for(let i=0;i<5;i++){
      const out=await sparktiatesChat({endpoint:url,token:secret,model:"qwen3:8b",
        messages:[{role:"user",content:"Question lunaire n°"+i}]});
      assert.equal(out.text,"Réponse de test sur la Lune");
    }
    assert.equal(calls.filter(x=>x.url.endsWith("/api/chat")).length,5);
    assert.ok(calls.every(x=>x.url.startsWith("http://127.0.0.1:11434/")));
  }finally{await new Promise(ok=>server.close(ok));}
});
test("L'intégration conserve les 4 autres moteurs, les intervenants et les commandes originales",()=>{
  const html=readFileSync(new URL("../tchat.html",import.meta.url),"utf8");
  const script=readFileSync(new URL("../tchat-distant.mjs",import.meta.url),"utf8");
  for(const mode of ["puter","research-local","horde","pollinations","sparktiates"])
    assert.ok(html.includes('value="'+mode+'"'),mode);
  for(const id of ["sparktiatesControls","sparktiatesAdresse","sparktiatesToken",
    "sparktiatesActualiser","sparktiatesModele","sparktiatesPartagerContexte",
    "fil","parler","tour","infini","debattre"])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(script,/if\(isSparktiatesMode\(\)\)return nextSparktiatesTurn\(\)/);
  assert.match(script,/pollinationsAutomaticTurns>=3/);
  assert.match(script,/window\.puter\.ai\.chat/);
  assert.match(html,/ChatGPT et René Le Corre®/);
  assert.ok(!script.includes("localStorage.setItem('sparktiatesToken'"));
});
test("La validation du serveur interdit l'exécution de commandes et les modèles inattendus",()=>{
  assert.equal(validModelName("qwen3:8b"),true);
  assert.equal(validModelName("../../../etc/passwd"),false);
  assert.equal(validModelName("qwen3;rm -rf /"),false);
  assert.equal(validMessages([{role:"user",content:"bonjour"}]),true);
  assert.equal(validMessages([{role:"tool",content:"exec"}]),false);
});
