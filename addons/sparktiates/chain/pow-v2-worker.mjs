import {parentPort,workerData} from "node:worker_threads";
import {serializeHeader80,displayedHash} from "./pow-core.mjs";
import {decodeCanonicalTarget} from "./pow-v2.mjs";

const {header,start,stride,limit,index,shared}=workerData;
const view=new Int32Array(shared),target=decodeCanonicalTarget(header.bits);
const template=serializeHeader80({...header,nonce:0});
let counted=0,found=false;
try{
  for(let nonce=start;nonce<=0xffffffff&&counted<limit;nonce+=stride){
    if(Atomics.load(view,0)!==0)break;
    template.writeUInt32LE(nonce,76);
    const hash=displayedHash(template);
    counted++;Atomics.add(view,index+1,1);
    if(BigInt("0x"+hash)<=target){
      const won=Atomics.compareExchange(view,0,0,index+1)===0;
      parentPort.postMessage({type:"RESULT",won,nonce,hash,index,counted});
      found=true;break;
    }
  }
  if(!found)parentPort.postMessage({type:"RESULT",won:false,index,counted});
}catch(e){parentPort.postMessage({type:"ERROR",index,message:String(e.message||e)});}
