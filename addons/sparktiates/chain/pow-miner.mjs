/**
 * SPARKTIATES CPU miner — real SHA256d operations on worker_threads.
 * Bounded test mining only; not a Bitcoin miner and not a 110 GHz clock.
 */
import {Worker} from "node:worker_threads";
import {cpus} from "node:os";
import {performance} from "node:perf_hooks";
import {createHash} from "node:crypto";
import {
  POW_POLICY,serializeHeader80,sha256d,displayedHash,
  headerHash,proofAccepted,validateBits,searchNonce
} from "./pow-core.mjs";

export function miningWorkers(requested=2){
  const n=Number(requested);
  if(!Number.isSafeInteger(n)||n<1||n>8)
    throw Error("SPK-MINER: 1 à 8 workers CPU maximum");
  return Math.min(n,Math.max(1,cpus()?.length||1));
}
export async function mineCandidate(candidate,{workers=2,maxAttempts=300000}={}){
  if(!candidate||!candidate.header)
    throw Error("SPK-MINER: bloc candidat requis");
  validateBits(candidate.header.bits);
  if(!Number.isSafeInteger(maxAttempts)||maxAttempts<1||maxAttempts>2_000_000)
    throw Error("SPK-MINER: quota de hachages invalide");
  const used=Math.min(miningWorkers(workers),maxAttempts);
  const counters=new Int32Array(new SharedArrayBuffer((used+1)*4));
  const child=[],start=performance.now();
  let winner=null;
  try{
    const requests=Array.from({length:used},(_,i)=>{
      const quota=Math.floor(maxAttempts/used)+(i<maxAttempts%used?1:0);
      const w=new Worker(new URL("./pow-worker.mjs",import.meta.url),{
        workerData:{
          header:candidate.header,start:i,stride:used,attemptLimit:quota,
          workerIndex:i,shared:counters.buffer
        }
      });
      child.push(w);
      return new Promise((resolve,reject)=>{
        let finished=false;
        const fail=e=>{
          if(finished)return;finished=true;reject(e);
        };
        w.once("message",message=>{
          if(finished)return;
          if(message.error){fail(Error("SPK-MINER: "+message.error));return;}
          if(message.found&&winner===null){
            winner={nonce:message.nonce,hash:message.hash,worker:i};
          }
          finished=true;resolve();
        });
        w.once("error",fail);
        w.once("exit",code=>{
          if(!finished)fail(Error("SPK-MINER: worker "+i+" sorti sans résultat ("+code+")"));
        });
      });
    });
    await Promise.all(requests);
    const elapsedMs=Math.max(0.001,performance.now()-start);
    const attempts=Array.from({length:used},(_,i)=>Atomics.load(counters,i+1))
      .reduce((sum,n)=>sum+n,0);
    if(winner===null)throw Error("SPK-MINER: preuve non trouvée après "+attempts+
      " hachages réels; bloc non accepté");
    const header={...candidate.header,nonce:winner.nonce};
    const hash=headerHash(header);
    if(hash!==winner.hash||!proofAccepted(header))
      throw Error("SPK-MINER: résultat du worker non vérifié");
    return {
      block:{...candidate,header,hash},
      report:{
        found:true,network:POW_POLICY.chainId,kind:"PHYSICAL_CPU_SHA256D",
        headerBytes:serializeHeader80(header).length,
        nonce:winner.nonce,hash,attempts,workers:used,
        elapsedMs,realHashPerSecond:attempts/(elapsedMs/1000),
        nBits:"0x"+header.bits.toString(16),
        targetHex:validateBits(header.bits).toString(16).padStart(64,"0"),
        proofValid:true,virtual110GHz:false,bitcoinMainnetReward:0
      }
    };
  }finally{
    Atomics.store(counters,0,-1);
    await Promise.allSettled(child.map(w=>w.terminate()));
  }
}
export function benchmarkSha256d({iterations=10000}={}){
  if(!Number.isSafeInteger(iterations)||iterations<100||iterations>100000)
    throw Error("SPK-MINER: benchmark limité de 100 à 100000 itérations");
  const bytes=Buffer.alloc(80);
  const start=performance.now();
  let hash="";
  for(let i=0;i<iterations;i++){
    bytes.writeUInt32LE(i,76);
    hash=displayedHash(bytes);
  }
  const elapsedMs=Math.max(0.001,performance.now()-start);
  const independent=Buffer.from(sha256d(bytes)).reverse().toString("hex");
  if(hash!==independent)throw Error("SPK-MINER: divergence SHA256d");
  return {
    algorithm:"SHA256(SHA256(header80))",
    headerBytes:80,
    iterations,elapsedMs,realHashPerSecond:iterations/(elapsedMs/1000),
    lastHash:hash,verified:true,
    virtual110GHz:false,realCpuFrequencyGHz:null
  };
}
export function referenceNonceMine(candidate,maxAttempts=300000){
  const p=searchNonce(candidate.header,{maxAttempts});
  if(!p.found)throw Error("Preuve non trouvée dans le quota");
  return {...candidate,header:{...candidate.header,nonce:p.nonce},hash:p.hash};
}
