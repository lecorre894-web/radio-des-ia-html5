/**
 * SPARKTIATES CHAIN — isolated validator / loopback HTTP transport.
 * Persisted signed-height locks; no external discovery, no web wallet,
 * no dangerous RPC, no unencrypted remote listener.
 */
import {createServer} from "node:http";
import {mkdir,readFile,writeFile,rename} from "node:fs/promises";
import {dirname,join} from "node:path";
import {randomBytes,timingSafeEqual} from "node:crypto";
import {
  genesis,validatorList,initialState,transition,commitBlock,signVote,
  verifyCertificate,digest,balance,spendables,utxoRoot
} from "./chain-core.mjs";

const MAX_HTTP_BODY=512*1024;
function failure(message,status=422){
  return Object.assign(Error("SPK NODE: "+message),{status});
}
function safeToken(received,expected){
  const a=Buffer.from(String(received||"")),b=Buffer.from(String(expected||""));
  return a.length===b.length&&a.length>0&&timingSafeEqual(a,b);
}
async function writeAtomic(path,data){
  await mkdir(dirname(path),{recursive:true,mode:0o700});
  const temp=path+"."+randomBytes(6).toString("hex")+".tmp";
  try{
    await writeFile(temp,JSON.stringify(data,null,2)+"\n",{mode:0o600,flag:"wx"});
    await rename(temp,path);
  }catch(e){
    try{const {unlink}=await import("node:fs/promises");await unlink(temp);}catch{}
    throw e;
  }
}
async function readBody(req){
  const type=String(req.headers["content-type"]||"");
  if(!type.startsWith("application/json"))throw failure("JSON obligatoire",415);
  const parts=[];
  let size=0;
  for await(const chunk of req){
    size+=chunk.length;
    if(size>MAX_HTTP_BODY)throw failure("requête trop grande",413);
    parts.push(chunk);
  }
  try{return JSON.parse(Buffer.concat(parts).toString("utf8"));}
  catch{throw failure("JSON malformé",400);}
}
export async function createValidatorNode({
  identity,validators,dataDir,token,port=0,host="127.0.0.1"
}={}){
  if(!identity||typeof identity.privateKey!=="string"||
     typeof identity.publicKey!=="string"||
     typeof identity.id!=="string")throw failure("identité de validateur requise");
  const vs=validatorList(validators);
  if(!vs.some(v=>v.id===identity.id&&v.publicKey===identity.publicKey))
    throw failure("identité non inscrite dans la genèse");
  if(typeof dataDir!=="string"||!dataDir||!Number.isSafeInteger(port)||
     port<0||port>65535||host!=="127.0.0.1")
    throw failure("stockage ou port invalide");
  if(typeof token!=="string"||token.length<24)
    throw failure("jeton privé de 24 caractères minimum");
  const first=genesis(vs),file=join(dataDir,identity.id,"state.json");
  let state=initialState(first),locks={};
  try{
    const saved=JSON.parse(await readFile(file,"utf8"));
    if(saved.genesisHash!==first.hash||!Array.isArray(saved.blocks)||
       !saved.locks||typeof saved.locks!=="object")
      throw failure("snapshot incompatible");
    for(const item of saved.blocks){
      state=commitBlock(state,item.body,item.certificate,vs);
    }
    if(saved.height!==state.height||saved.tip!==state.hash||
       saved.utxoRoot!==utxoRoot(state.utxos))
      throw failure("snapshot incohérent, arrêt par sécurité");
    locks=saved.locks;
    // Verify all persisted locks are in the format expected for the height.
    for(const [h,hash] of Object.entries(locks)){
      if(!/^[1-9]\d*$/.test(h)||!Number.isSafeInteger(Number(h))||
         !/^[a-f0-9]{64}$/.test(hash))throw failure("verrous signés corrompus");
    }
  }catch(e){
    if(e.code!=="ENOENT")throw e;
  }
  let chainQueue=Promise.resolve();
  const serialize=fn=>{
    const run=chainQueue.then(fn);
    chainQueue=run.catch(()=>{});
    return run;
  };
  async function persist(next,updatedLocks=locks){
    await writeAtomic(file,{
      schema:1,genesisHash:first.hash,height:next.height,tip:next.hash,
      utxoRoot:utxoRoot(next.utxos),locks:updatedLocks,
      blocks:next.chain.slice(1)
    });
  }
  async function vote(body){
    return serialize(async()=>{
      if(!body||body.timestamp>Date.now()+120_000)
        throw failure("horodatage trop avancé");
      const hash=digest("SPK/block/v1",body);
      transition(state,body,vs);
      const previous=locks[String(body.height)];
      if(previous&&previous!==hash)
        throw failure("vote concurrent interdit : verrou de hauteur déjà posé",409);
      if(!previous){
        const nextLocks={...locks,[String(body.height)]:hash};
        await persist(state,nextLocks);
        locks=nextLocks;
      }
      return {validator:identity.id,signature:signVote(identity.privateKey,body.height,hash)};
    });
  }
  async function commit(body,certificate){
    return serialize(async()=>{
      const hash=verifyCertificate(body,certificate,vs);
      if(body.height<=state.height){
        const prior=state.chain[body.height];
        if(prior?.hash===hash)
          return {accepted:true,duplicate:true,height:state.height,hash:state.hash};
        throw failure("conflit historique détecté",409);
      }
      if(locks[String(body.height)]&&locks[String(body.height)]!==hash)
        throw failure("tentative de commettre un bloc différent du verrou",409);
      const next=commitBlock(state,body,certificate,vs);
      await persist(next);
      state=next;
      return {accepted:true,duplicate:false,height:state.height,hash:state.hash};
    });
  }
  const server=createServer(async(req,res)=>{
    const send=(code,data)=>{
      res.writeHead(code,{"Content-Type":"application/json; charset=utf-8",
        "Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
      res.end(JSON.stringify(data));
    };
    try{
      if(req.url==="/health"&&req.method==="GET"){
        send(200,{service:"SPARTKIATES CHAIN PRIVATE REGTEST",
          experimental:true,validator:identity.id,alive:true});return;
      }
      const supplied=String(req.headers.authorization||"");
      if(!supplied.startsWith("Bearer ")||
         !safeToken(supplied.slice(7),token)){
        send(401,{error:"Accès privé refusé"});return;
      }
      if(req.url==="/status"&&req.method==="GET"){
        send(200,{id:identity.id,height:state.height,hash:state.hash,
          genesisHash:first.hash,supply:state.supply,utxoRoot:utxoRoot(state.utxos),
          locks:Object.keys(locks).length,validators:vs.map(v=>v.id)});
        return;
      }
      if(req.url==="/chain"&&req.method==="GET"){
        send(200,{chain:state.chain});return;
      }
      if(req.url?.startsWith("/balance/")&&req.method==="GET"){
        const owner=decodeURIComponent(req.url.slice("/balance/".length));
        send(200,{owner,balance:balance(state,owner),
          spendables:spendables(state,owner)});return;
      }
      if(req.url==="/vote"&&req.method==="POST"){
        const request=await readBody(req);
        send(200,await vote(request.body));return;
      }
      if(req.url==="/commit"&&req.method==="POST"){
        const request=await readBody(req);
        send(200,await commit(request.body,request.certificate));return;
      }
      send(404,{error:"Route inconnue"});
    }catch(e){
      send(e.status||422,{error:String(e.message||e).slice(0,250)});
    }
  });
  let listening=false;
  return {
    id:identity.id,
    get state(){return state;},
    get locks(){return {...locks};},
    genesis:first,
    validators:vs,
    vote,commit,
    async listen(){
      if(listening)throw failure("nœud déjà démarré");
      await new Promise((resolve,reject)=>{
        server.once("error",reject);
        server.listen(port,host,()=>{
          server.off("error",reject);resolve();
        });
      });
      listening=true;
      return {port:server.address().port,host};
    },
    async close(){
      if(!listening)return;
      await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
      listening=false;
    }
  };
}
export async function rpc(port,route,token,body){
  if(!Number.isSafeInteger(port)||port<1||port>65535||
     !/^\/(?:health|status|chain|vote|commit|balance\/[a-zA-Z0-9_]+)$/.test(route))
    throw failure("destination RPC refusée");
  const response=await fetch("http://127.0.0.1:"+port+route,{
    method:body===undefined?"GET":"POST",
    headers:{Authorization:"Bearer "+token,...(body===undefined?{}:{"Content-Type":"application/json"})},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
    signal:AbortSignal.timeout(8000)
  });
  const data=await response.json();
  if(!response.ok)throw failure("RPC "+port+" "+response.status+": "+String(data.error||"refus"));
  return data;
}
