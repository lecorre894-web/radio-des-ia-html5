import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {HORDE,createHordeClient,listModelsResponse,buildTextRequest,inspectJob} from "../horde-client.mjs";

const ID="123e4567-e89b-42d3-a456-426614174000";
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
test("La Radio Puter reste intacte : seul le laboratoire a l'adaptateur",()=>{
 const radio=readFileSync(new URL("../tchat.html",import.meta.url),"utf8");
 const engine=readFileSync(new URL("../tchat-distant.mjs",import.meta.url),"utf8");
 assert.doesNotMatch(radio,/horde-lab|horde-client|moteur AI Horde/);
 assert.doesNotMatch(engine,/horde-client|aihorde\.net/);
 assert.match(radio,/id="parler"/);
 assert.match(engine,/puter\.ai\.chat/);
});
test("catalogue réel : uniquement modèles avec workers actifs, sans usurpation",()=>{
 const list=listModelsResponse([{name:"Test-Llama",count:2},{name:"Second",count:1},
  {name:"Hors-ligne",count:0},{name:"",count:12},null]);
 assert.deepEqual(list.map(x=>x.name),["Test-Llama","Second"]);
 assert.throws(()=>listModelsResponse({models:[]}),/liste/);
});
test("création requête textuelle bornée et sans secret Puter",()=>{
 const req=buildTextRequest({prompt:"Définis savoir.",model:"Test-Llama",maxLength:96});
 assert.deepEqual(req.models,["Test-Llama"]);
 assert.equal(req.params.max_length,96);
 assert.equal(req.params.n,1);
 assert.ok(!JSON.stringify(req).includes("puter"));
 assert.ok(req.prompt.includes("Définis savoir"));
 assert.throws(()=>buildTextRequest({prompt:"",model:"Test-Llama"}),/Message/);
 assert.throws(()=>buildTextRequest({prompt:"X".repeat(4000),model:"Test-Llama"}),/maximum/);
 assert.throws(()=>buildTextRequest({prompt:"oui",model:"Test-Llama",maxLength:9999}),/32–240/);
});
test("résultat : conserver la provenance réelle du worker",()=>{
 const info=inspectJob({done:true,generations:[{text:"Le savoir se construit.",model:"community-Llama",worker_name:"Worker42"}]});
 assert.equal(info.text,"Le savoir se construit.");
 assert.equal(info.model,"community-Llama");
 assert.equal(info.worker,"Worker42");
 assert.equal(info.success,true);
});
test("worker impossible ou silence : aucun résultat inventé",()=>{
 assert.equal(inspectJob({done:true,generations:[]}).success,false);
 assert.equal(inspectJob({faulted:true}).success,false);
 assert.equal(inspectJob({done:false,waiting:2,processing:0}).done,false);
});
test("listage et génération : un seul POST, attente, fin",async()=>{
 const called=[];
 const fetchImpl=async(url,opts)=>{
  called.push({url,opts});
  if(url.endsWith("/status/models?type=text"))return response([{name:"real-model",count:2}]);
  if(url.endsWith("/generate/text/async"))return response({id:ID});
  if(url.endsWith("/generate/text/status/"+ID))return response(
   called.filter(x=>x.url.endsWith("/generate/text/status/"+ID)).length===1?
   {done:false,waiting:2,processing:0}:{done:true,generations:[{text:"Bonjour !",model:"real-model",worker_name:"W01"}]});
  throw Error("endpoint inattendu : "+url);
 };
 const status=[];
 const client=createHordeClient({fetchImpl,sleepImpl:async()=>{}});
 assert.equal((await client.models())[0].name,"real-model");
 const out=await client.generate({prompt:"Bonsoir",model:"real-model",signal:new AbortController().signal,
   onStatus:x=>status.push(x.phase)});
 assert.equal(out.text,"Bonjour !");
 assert.equal(status[0],"queued");
 assert.ok(status.includes("waiting"));
 assert.equal(called.filter(x=>x.opts.method==="POST").length,1);
 const posted=called.find(x=>x.opts.method==="POST");
 assert.equal(posted.opts.headers.apikey,"0000000000");
 assert.match(posted.opts.headers["Client-Agent"],/^RadioDesIA:/);
 assert.equal(called.filter(x=>x.opts.method==="DELETE").length,0);
});
test("annulation manuelle : annuler aussi la requête distante",async()=>{
 const called=[];
 const abort=new AbortController();
 const client=createHordeClient({
  fetchImpl:async(url,options)=>{
   called.push({url,method:options.method});
   if(options.method==="POST")return response({id:ID});
   if(options.method==="DELETE")return response({message:"cancelled"});
   return response({done:false,waiting:1});
  },
  sleepImpl:async()=>abort.abort()
 });
 await assert.rejects(()=>client.generate({prompt:"Test",model:"real-model",signal:abort.signal}),/interrompue/);
 assert.equal(called.filter(c=>c.method==="DELETE").length,1);
});
test("requête impossible : sortie propre et DELETE de la tâche en cours",async()=>{
 const calls=[];
 const client=createHordeClient({
  fetchImpl:async(url,opts)=>{
   calls.push(opts.method);
   if(opts.method==="POST")return response({id:ID});
   if(opts.method==="DELETE")return response({message:"deleted"});
   return response({done:true,generations:[]});
  }
 });
 await assert.rejects(()=>client.generate({prompt:"Test",model:"real-model"}),/sans texte/);
 assert.ok(calls.includes("DELETE"));
});
test("erreur HTTP et CORS : erreurs utiles sans basculer sur Puter",async()=>{
 const client=createHordeClient({fetchImpl:async()=>response({message:"service indisponible"},503)});
 await assert.rejects(()=>client.models(),/HTTP 503/);
 const other=createHordeClient({fetchImpl:async()=>{throw new TypeError("Failed to fetch");}});
 await assert.rejects(()=>other.models(),/CORS/);
});
test("sécurité : URL API fixe, pas de clé utilisateur stockée ni d'accès au navigateur",()=>{
 assert.equal(HORDE.base,"https://aihorde.net/api/v2");
 assert.throws(()=>createHordeClient({base:"https://inconnu.exemple/"}),/adresse du fournisseur/);
 const source=readFileSync(new URL("../horde-client.mjs",import.meta.url),"utf8");
 const page=readFileSync(new URL("../horde-lab.html",import.meta.url),"utf8");
 assert.doesNotMatch(source,/localStorage|sessionStorage|indexedDB/);
 assert.doesNotMatch(page,/type="password"|<input[^>]*type="file"/);
 assert.match(page,/id="consent"/);
 assert.match(page,/noindex,nofollow/);
});
