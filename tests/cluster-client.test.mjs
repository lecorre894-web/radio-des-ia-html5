import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {makeClusterTransport} from "../selfhost/cluster-client.mjs";

test("le module additif n'est pas charge automatiquement par la Radio publique",()=>{
 const page=readFileSync(new URL("../tchat.html",import.meta.url),"utf8");
 const engine=readFileSync(new URL("../tchat-distant.mjs",import.meta.url),"utf8");
 assert.doesNotMatch(page,/cluster-client\.mjs|cluster-console/);
 assert.doesNotMatch(engine,/cluster-client\.mjs/);
 assert.match(engine,/puter\.ai\.chat/);
});

test("le navigateur n'accepte pas un serveur distant sans HTTPS",()=>{
 assert.throws(()=>makeClusterTransport({baseUrl:"http://public.example.org"}),/HTTPS/);
 assert.throws(()=>makeClusterTransport({baseUrl:"https://user:pass@public.example.org"}),/origine/);
 assert.throws(()=>makeClusterTransport({baseUrl:"https://public.example.org/path"}),/origine/);
 assert.ok(makeClusterTransport({baseUrl:"http://127.0.0.1:8766"}));
});

test("les messages sont transmis uniquement au cluster choisi, sans appeler Puter",async()=>{
 const calls=[];
 const client=makeClusterTransport({
  baseUrl:"http://127.0.0.1:8766",
  fetchImpl:async(url,options)=>{
   calls.push({url,options});
   return new Response(JSON.stringify({
    answer:"Réponse de Qwen local.",
    model:"qwen3:8b",node_id:"wsl-ryzen-4080",sources:[]}),{status:200});
  }
 });
 const result=await client.chat({message:"Bonsoir",history:[{role:"user",content:"Bonjour"}],web:false});
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,"http://127.0.0.1:8766/api/v1/chat");
 assert.equal(JSON.parse(calls[0].options.body).web,false);
 assert.equal(result.text,"Réponse de Qwen local.");
 assert.equal(result.nodeId,"wsl-ryzen-4080");
 assert.equal(result.model,"qwen3:8b");
 assert.doesNotMatch(JSON.stringify(calls),/api\.puter|aihorde/);
});

test("nouvelle recherche Web permise seulement si utilisateur l'a demandée",async()=>{
 let payload;
 const client=makeClusterTransport({
  fetchImpl:async(_url,options)=>{
   payload=JSON.parse(options.body);
   return new Response(JSON.stringify({answer:"Source A.",model:"qwen3:8b",node_id:"n1"}),{status:200});
  }
 });
 await client.chat({message:"Dernières découvertes",web:true});
 assert.equal(payload.web,true);
 await client.chat({message:"Une question privée",web:undefined});
 assert.equal(payload.web,false);
});

test("un echec ou resultat vide ne se substitue jamais à un autre fournisseur",async()=>{
 const client=makeClusterTransport({fetchImpl:async()=>new Response(JSON.stringify({error:"Cluster plein"}),{status:503})});
 await assert.rejects(()=>client.chat({message:"Salut"}),/Cluster plein/);
 const invalid=makeClusterTransport({fetchImpl:async()=>new Response(JSON.stringify({model:"qwen3:8b"}),{status:200})});
 await assert.rejects(()=>invalid.chat({message:"Salut"}),/invalide/);
});
