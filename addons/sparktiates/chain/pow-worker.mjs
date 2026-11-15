/**
 * Physical CPU worker for private SPARKTIATES POW.
 * Each worker receives a disjoint nonce progression; atomics stop peers.
 * Reported attempts are exact and only count real SHA256d iterations.
 */
import {parentPort,workerData} from "node:worker_threads";
import {serializeHeader80,displayedHash,validateBits} from "./pow-core.mjs";

const {header,start,stride,attemptLimit,shared,workerIndex}=workerData;
const data=new Int32Array(shared);
const raw=serializeHeader80({...header,nonce:0});
const target=validateBits(header.bits);
let attempts=0;
try{
  for(let nonce=start;nonce<=0xffffffff&&attempts<attemptLimit;nonce+=stride){
    if(Atomics.load(data,0)!==0)break;
    raw.writeUInt32LE(nonce,76);
    const hash=displayedHash(raw);
    attempts++;
    Atomics.add(data,workerIndex+1,1);
    if(BigInt("0x"+hash)<=target){
      const winner=Atomics.compareExchange(data,0,0,workerIndex+1)===0;
      parentPort.postMessage({found:winner,nonce,hash,workerIndex,attempts});
      // The worker completes normally after posting its result.
    }
  }
  parentPort.postMessage({found:false,workerIndex,attempts});
}catch(e){
  parentPort.postMessage({error:String(e.message||e),workerIndex,attempts});
  process.exitCode=1;
}
