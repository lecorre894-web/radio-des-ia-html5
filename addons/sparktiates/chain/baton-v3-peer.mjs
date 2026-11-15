/**
 * One physical Node.js PROCESS per triangle vertex.
 * The same PoW chain is shared among all vertices and 2048 relay channels.
 * Private IPC only. No wallet seed, secret or private key is printed.
 */

import {makeBatonCandidate,expectedRoute,BATON_V3} from "./baton-v3.mjs";
import {balanceV2} from "./pow-v2.mjs";
import {mineV2Sequential} from "./pow-v2-miner.mjs";
import {createBatonOverlay} from "./baton-v3-overlay.mjs";
import {createBatonLedger,createOrLoadBatonWallet} from "./baton-v3-ledger.mjs";

let overlay=null,ledger=null,wallet=null,owner=null;
async function handle(msg){
  const {type,requestId}=msg||{};
  if(!Number.isSafeInteger(requestId))return;
  const reply=value=>process.send?.({ok:true,requestId,...value});
  try{
    if(type==="START"){
      if(overlay)throw Error("Vertex already online");
      ledger=createBatonLedger({vertex:msg.vertex,directory:msg.directory});
      wallet=createOrLoadBatonWallet({vertex:msg.vertex,directory:msg.directory});
      owner=wallet.owner;
      overlay=createBatonOverlay({
        vertex:msg.vertex,secret:msg.secret,
        initialChain:ledger.state.chain,
        onState:next=>ledger.persist(next)
      });
      const listener=await overlay.listen();
      reply({listener,owner,vertex:overlay.vertex});
    }else if(type==="CONNECT"){
      if(!overlay)throw Error("Vertex offline");
      const link=await overlay.connect(msg.port);
      reply({link,peers:overlay.peers});
    }else if(type==="STATUS"){
      if(!overlay)throw Error("Vertex offline");
      const next=expectedRoute(overlay.state);
      reply({
        vertex:overlay.vertex,height:overlay.state.height,
        tip:overlay.state.hash,genesis:overlay.genesis.hash,
        work:overlay.state.cumulativeWork.toString(),
        issued:overlay.state.supply,
        balance:balanceV2(overlay.state,owner),
        owner,nextRelay:next.relayId,nextVertex:next.triangleVertex,
        ledger:{height:ledger.state.height,tip:ledger.state.hash,
          entries:ledger.verify().entries.length},
        peers:overlay.peers,stats:overlay.stats
      });
    }else if(type==="MINE"){
      if(!overlay)throw Error("Vertex offline");
      const state=overlay.state,route=expectedRoute(state);
      if(route.triangleVertex!==overlay.vertex)
        throw Error("Wrong triangle vertex for this relay");
      const candidate=makeBatonCandidate(state,{
        miner:owner,timestamp:msg.timestamp
      });
      const result=mineV2Sequential(candidate,{maxAttempts:750000});
      const accepted=overlay.commitMinedBlock(result.block);
      reply({block:accepted,route,report:result.report});
    }else if(type==="STOP"){
      await overlay?.close();overlay=null;
      reply({closed:true});
    }else throw Error("Unknown IPC command");
  }catch(e){
    process.send?.({ok:false,requestId,error:String(e.message||e).slice(0,300)});
  }
}
process.on("message",msg=>{void handle(msg);});
process.on("disconnect",()=>{
  void overlay?.close().finally(()=>process.exit(0));
});
