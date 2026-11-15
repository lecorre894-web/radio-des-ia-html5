/**
 * Worker PROCESS for independently executed SPARKTIATES V2 P2P.
 * Access only via local IPC. Secrets must never appear in stdout/stderr.
 */
import {newIdentity,address} from "./chain-core.mjs";
import {candidateV2} from "./pow-v2.mjs";
import {mineV2Sequential} from "./pow-v2-miner.mjs";
import {createFullDuplexOverlay} from "./pow-overlay-duplex.mjs";

let overlay=null;
const key=newIdentity();
const owner=address(key.publicKey);
async function handle(message){
  const {type,requestId}=message;
  if(typeof requestId!=="number"||!Number.isSafeInteger(requestId))return;
  const reply=value=>process.send?.({requestId,ok:true,...value});
  try{
    if(type==="START"){
      if(overlay)throw Error("Nœud déjà lancé");
      overlay=createFullDuplexOverlay({
        networkId:message.networkId,
        masterSecret:message.masterSecret
      });
      const listening=await overlay.listen();
      reply({listening,miner:owner});
    }else if(type==="CONNECT"){
      if(!overlay)throw Error("Nœud hors ligne");
      const connection=await overlay.connect(message.port);
      reply({connection,peers:overlay.peers});
    }else if(type==="MINE"){
      if(!overlay)throw Error("Nœud hors ligne");
      const timestamp=message.timestamp;
      const before=overlay.state;
      const draft=candidateV2(before,{miner:owner,timestamp});
      const result=mineV2Sequential(draft,{maxAttempts:750000});
      const accepted=overlay.acceptLocalBlock(result.block);
      reply({mined:accepted,report:result.report});
    }else if(type==="STATUS"){
      if(!overlay)throw Error("Nœud hors ligne");
      reply({height:overlay.state.height,hash:overlay.state.hash,
        chainId:overlay.state.chainId,
        work:overlay.state.cumulativeWork.toString(),
        stats:overlay.stats,peers:overlay.peers});
    }else if(type==="STOP"){
      await overlay?.close();overlay=null;
      reply({closed:true});
    }else throw Error("Commande IPC inconnue");
  }catch(e){
    process.send?.({requestId,ok:false,error:String(e.message||e).slice(0,350)});
  }
}
process.on("message",msg=>{void handle(msg);});
process.on("disconnect",()=>{void overlay?.close().finally(()=>process.exit(0));});
