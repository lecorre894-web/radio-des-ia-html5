/**
 * SPARKTIATES Radio bridge — separate, optional Node.js process.
 * Real inference is performed by an already-installed local Ollama runtime.
 * This does not synthesize GPU/CPU capacity or bypass Pollinations billing.
 * No arbitrary command execution, no proxy URLs, no stored prompts.
 */
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";

const ALLOWED_ORIGINS = new Set([
  "https://lecorre894-web.github.io",
  "http://127.0.0.1:5500",
  "http://localhost:5500"
]);
const OLLAMA = "http://127.0.0.1:11434";
const BODY_LIMIT = 64 * 1024;
const MAX_MESSAGES = 16;
const MAX_TOKENS = 1200;
const TIMEOUT_MS = 180_000;

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}
function constantTimeEqual(a,b) {
  const x=Buffer.from(String(a||""));
  const y=Buffer.from(String(b||""));
  return x.length===y.length && x.length>0 && timingSafeEqual(x,y);
}
export function validModelName(name) {
  return typeof name==="string" && name.length<=160 &&
    /^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/.test(name);
}
export function validMessages(messages) {
  return Array.isArray(messages) && messages.length>0 &&
    messages.length<=MAX_MESSAGES && messages.every(m=>m &&
      ["system","user","assistant"].includes(m.role) &&
      typeof m.content==="string" && m.content.trim() &&
      m.content.length<=6000);
}

async function readJSONBody(request) {
  if(!String(request.headers["content-type"]||"").startsWith("application/json"))
    throw httpError(415,"Content-Type application/json requis.");
  let size=0;
  const chunks=[];
  for await(const chunk of request){
    size+=chunk.length;
    if(size>BODY_LIMIT)throw httpError(413,"Requête trop grande.");
    chunks.push(chunk);
  }
  try{return JSON.parse(Buffer.concat(chunks).toString("utf8"));}
  catch{throw httpError(400,"JSON invalide.");}
}

export function createRadioServer({token=process.env.SPARKTIATES_ACCESS_TOKEN,
    fetcher=fetch,ollama=OLLAMA}={}) {
  if(!token||String(token).length<24)
    throw Error("Définir SPARKTIATES_ACCESS_TOKEN (24 caractères aléatoires minimum).");
  if(ollama!==OLLAMA && !/^http:\/\/(?:127\.0\.0\.1|localhost):\d{2,5}$/.test(ollama))
    throw Error("La source Ollama doit rester sur la boucle locale.");
  let running=false;
  function send(res,status,data,origin){
    if(origin && ALLOWED_ORIGINS.has(origin)){
      res.setHeader("Access-Control-Allow-Origin",origin);
      res.setHeader("Vary","Origin");
    }
    res.writeHead(status,{
      "Content-Type":"application/json; charset=utf-8",
      "Cache-Control":"no-store",
      "X-Content-Type-Options":"nosniff"
    });
    res.end(JSON.stringify(data));
  }
  async function ollamaJSON(path,options={}){
    let response;
    try {
      response=await fetcher(ollama+path,{
        ...options,
        signal:AbortSignal.timeout(TIMEOUT_MS),
        headers:{"Content-Type":"application/json",...(options.headers||{})}
      });
    }catch(e){
      throw httpError(503,"Ollama injoignable sur la machine SPARKTIATES : "+String(e?.message||e));
    }
    const body=await response.text();
    let parsed;
    try{parsed=JSON.parse(body);}
    catch{throw httpError(502,"Réponse du moteur Ollama invalide.");}
    if(!response.ok)
      throw httpError(502,"Ollama HTTP "+response.status+" : "+String(parsed?.error||"requête rejetée").slice(0,250));
    return parsed;
  }
  const server=createServer(async(req,res)=>{
    const origin=String(req.headers.origin||"");
    try{
      if(origin && !ALLOWED_ORIGINS.has(origin))
        throw httpError(403,"Origine Web non autorisée.");
      if(req.method==="OPTIONS"){
        if(!origin)throw httpError(400,"Origine requise.");
        res.setHeader("Access-Control-Allow-Origin",origin);
        res.setHeader("Access-Control-Allow-Methods","GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers","Authorization, Content-Type");
        res.setHeader("Access-Control-Max-Age","600");
        res.setHeader("Vary","Origin");
        res.writeHead(204);res.end();return;
      }
      const path=new URL(req.url||"/","http://127.0.0.1").pathname;
      if(req.method==="GET" && path==="/health"){
        send(res,200,{service:"SPARKTIATES Radio",status:"bridge-ready",
          inference:"Ollama local (si installé)",unlimited_software_turns:true,
          provider_credits:"non inclus"},origin);return;
      }
      const supplied=String(req.headers.authorization||"").replace(/^Bearer /i,"");
      if(!constantTimeEqual(supplied,token))
        throw httpError(401,"Jeton SPARKTIATES requis.");
      if(req.method==="GET" && path==="/v1/models"){
        const result=await ollamaJSON("/api/tags");
        const models=(Array.isArray(result.models)?result.models:[])
          .filter(m=>validModelName(m?.name))
          .map(m=>({id:m.name,size:m.size||null,details:m.details||null}));
        send(res,200,{models},origin);return;
      }
      if(req.method==="POST" && path==="/v1/chat/completions"){
        if(running)throw httpError(429,"Moteur déjà occupé : réessayer manuellement.");
        const body=await readJSONBody(req);
        if(!validModelName(body?.model)||!validMessages(body?.messages))
          throw httpError(400,"Modèle installé et messages valides requis.");
        const catalog=await ollamaJSON("/api/tags");
        if(!Array.isArray(catalog.models)||!catalog.models.some(m=>m.name===body.model))
          throw httpError(400,"Modèle absent d'Ollama : aucun remplacement silencieux.");
        running=true;
        try{
          const raw=await ollamaJSON("/api/chat",{
            method:"POST",
            body:JSON.stringify({
              model:body.model,
              messages:body.messages,
              stream:false,
              options:{
                temperature:0.2,
                num_predict:Math.max(80,Math.min(MAX_TOKENS,Number(body.max_tokens)||600))
              }
            })
          });
          const answer=raw?.message?.content;
          if(typeof answer!=="string"||!answer.trim())
            throw httpError(502,"Ollama n'a produit aucun texte.");
          send(res,200,{model:String(raw.model||body.model),
            choices:[{message:{role:"assistant",content:answer}}]},origin);
        }finally{running=false;}
        return;
      }
      throw httpError(404,"Route inconnue.");
    }catch(e){
      send(res,Number(e.status)||500,{error:String(e?.message||"Erreur du serveur").slice(0,350)},origin);
    }
  });
  return server;
}

if(process.argv[1] && import.meta.url.endsWith("/"+process.argv[1].replaceAll("\\","/").split("/").at(-1))){
  const port=Number.parseInt(process.env.SPARKTIATES_RADIO_PORT||"8788",10);
  if(!Number.isInteger(port)||port<1||port>65535)throw Error("Port invalide.");
  createRadioServer().listen(port,"127.0.0.1",()=>{
    console.log("SPARKTIATES Radio local prêt : http://127.0.0.1:"+port+"/health");
    console.log("Pour accéder depuis un autre appareil : tunnel HTTPS authentifié requis.");
  });
}
