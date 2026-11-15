/**
 * Bounded CPU mining on an actual machine; retargeted nBits accepted.
 * Genuine SHA256d hashes, not virtual 110 GHz computations.
 */
import {Worker} from "node:worker_threads";
import {cpus} from "node:os";
import {performance} from "node:perf_hooks";
import {serializeHeader80,displayedHash} from "./pow-core.mjs";
import {decodeCanonicalTarget} from "./pow-v2.mjs";
export function mineV2Sequential(candidate,{maxAttempts=1000000,start=0,stride=1}={}){
  if(!candidate?.header||!Number.isInteger(maxAttempts)||maxAttempts<1||
     maxAttempts>2_000_000||!Number.isInteger(start)||start<0||
     !Number.isInteger(stride)||stride<1)
    throw Error("SPK-V2-MINER: paramètres invalides");
  const target=decodeCanonicalTarget(candidate.header.bits);
  const bytes=serializeHeader80({...candidate.header,nonce:0});
  const tick=performance.now();
  let attempts=0;
  for(let nonce=start;nonce<=0xffffffff&&attempts<maxAttempts;nonce+=stride){
    bytes.writeUInt32LE(nonce,76);
    const hash=displayedHash(bytes);attempts++;
    if(BigInt("0x"+hash)<=target){
      const elapsedMs=Math.max(.001,performance.now()-tick);
      return {block:{...candidate,header:{...candidate.header,nonce},hash},
        report:{proofValid:true,attempts,nonce,hash,elapsedMs,
          realHashPerSecond:attempts/(elapsedMs/1000),workers:1}};
    }
  }
  throw Error("SPK-V2-MINER: aucun PoW obtenu en "+attempts+" essais");
}
export async function mineV2Parallel(candidate,{workers=2,maxAttempts=600000}={}){
  if(!candidate?.header||!Number.isInteger(workers)||workers<1||workers>8||
     !Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>2_000_000)
    throw Error("SPK-V2-MINER: limite de minage invalide");
  const target=decodeCanonicalTarget(candidate.header.bits);
  serializeHeader80(candidate.header);
  const count=Math.min(workers,Math.max(1,cpus().length),maxAttempts);
  const shared=new SharedArrayBuffer((count+1)*Int32Array.BYTES_PER_ELEMENT);
  const counters=new Int32Array(shared),children=[],time=performance.now();
  let winner=null;
  try{
    const jobs=Array.from({length:count},(_,index)=>new Promise((resolve,reject)=>{
      const quota=Math.floor(maxAttempts/count)+(index<maxAttempts%count?1:0);
      const worker=new Worker(new URL("./pow-v2-worker.mjs",import.meta.url),{
        workerData:{header:candidate.header,start:index,stride:count,
          limit:quota,index,shared}});
      children.push(worker);let ended=false;
      const bad=e=>{if(!ended){ended=true;reject(e);}};
      worker.once("message",msg=>{
        if(ended)return;
        if(msg.type!=="RESULT"){bad(Error(msg.message||"invalid mining result"));return;}
        if(msg.won&&winner===null)winner={nonce:msg.nonce,hash:msg.hash};
        ended=true;resolve();
      });
      worker.once("error",bad);
      worker.once("exit",code=>{if(!ended)bad(Error("Worker stopped: "+code));});
    }));
    await Promise.all(jobs);
    const elapsedMs=Math.max(.001,performance.now()-time);
    const attempts=Array.from({length:count},(_,i)=>Atomics.load(counters,i+1))
      .reduce((a,b)=>a+b,0);
    if(!winner)throw Error("SPK-V2-MINER: aucune preuve après "+attempts+" hachages réels");
    const header={...candidate.header,nonce:winner.nonce};
    const hash=displayedHash(serializeHeader80(header));
    if(hash!==winner.hash||BigInt("0x"+hash)>target)
      throw Error("SPK-V2-MINER: résultat miner incorrect");
    return {block:{...candidate,header,hash},report:{
      proofValid:true,nonce:winner.nonce,hash,attempts,
      elapsedMs,realHashPerSecond:attempts/(elapsedMs/1000),
      workers:count,virtual110GHz:false}};
  }finally{
    Atomics.store(counters,0,-1);
    await Promise.allSettled(children.map(w=>w.terminate()));
  }
}
