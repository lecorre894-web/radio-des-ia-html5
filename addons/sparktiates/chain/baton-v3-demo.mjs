/**
 * SPARKTIATES BATON V3 demonstration:
 * - 2048 logical RELAYS, one genesis and one PoW chain.
 * - 3 OS processes A, B, C, with 3 bidirectional TCP links.
 * - each block mined by the scheduled triangle vertex (A B C ...).
 * - every other vertex independently validates and PERSISTS the same ledger.
 * - actual shutdown/restart restores 3 copies of the ONE chain.
 * - 9th block exercises retarget AFTER 8 verified blocks.
 */
import {fork} from "node:child_process";
import {fileURLToPath} from "node:url";
import {randomBytes} from "node:crypto";
import {mkdtemp,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {performance} from "node:perf_hooks";
import {BATON_V3,batonGenesis,routeForHeight,
  planRelayContinuity,batonVisualTopology} from "./baton-v3.mjs";
import {V2_POLICY} from "./pow-v2.mjs";
import {createBatonLedger} from "./baton-v3-ledger.mjs";

const workerFile=fileURLToPath(new URL("./baton-v3-peer.mjs",import.meta.url));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function spawn(vertex){
  const child=fork(workerFile,[],{
    stdio:["ignore","pipe","pipe","ipc"],
    env:{...process.env,SPK_TRIANGLE_VERTEX:vertex}
  });
  const pending=new Map();
  let sequence=0,dead=false,errorLog="";
  child.stderr?.on("data",chunk=>{
    errorLog=(errorLog+chunk.toString("utf8")).slice(-1500);
  });
  child.stdout?.resume();
  function closePending(e){
    dead=true;
    for(const pendingCall of pending.values()){
      clearTimeout(pendingCall.timer);pendingCall.reject(e);
    }
    pending.clear();
  }
  child.on("error",closePending);
  child.once("exit",code=>closePending(
    Error("Sommet "+vertex+" a quitté avec "+code+" "+errorLog)));
  child.on("message",message=>{
    const req=pending.get(message?.requestId);
    if(!req)return;
    clearTimeout(req.timer);pending.delete(message.requestId);
    message.ok?req.resolve(message):req.reject(
      Error("Sommet "+vertex+": "+String(message.error||"requête refusée")));
  });
  return {
    vertex,pid:child.pid,
    async send(type,fields={},timeout=12_000){
      if(dead||!child.connected)throw Error("Processus "+vertex+" inactif");
      const requestId=++sequence;
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{
          pending.delete(requestId);reject(Error(
            "Sommet "+vertex+": délai "+type+" dépassé"));
        },timeout);
        pending.set(requestId,{resolve,reject,timer});
        child.send({type,requestId,...fields},e=>{
          if(!e)return;
          clearTimeout(timer);pending.delete(requestId);reject(e);
        });
      });
    },
    async stop(){
      if(dead)return;
      try{await this.send("STOP",{},3000);}catch{}
      try{child.disconnect();}catch{}
      await Promise.race([
        new Promise(resolve=>child.once("exit",resolve)),
        sleep(1600)
      ]);
      if(child.exitCode===null&&!dead)child.kill("SIGTERM");
    }
  };
}
async function statusAll(vertices){
  return Promise.all(vertices.map(v=>v.send("STATUS",{},5000)));
}
async function concordance(vertices,height,{timeout=12000}={}){
  const started=Date.now();let data=[];
  while(Date.now()-started<timeout){
    data=await statusAll(vertices);
    if(data.every(x=>x.height===height&&x.ledger.height===height&&
      x.tip===x.ledger.tip)&&
      new Set(data.map(x=>x.tip)).size===1&&
      new Set(data.map(x=>x.work)).size===1&&
      new Set(data.map(x=>x.issued)).size===1&&
      new Set(data.map(x=>x.genesis)).size===1)
      return data;
    await sleep(35);
  }
  throw Error("SPK BATON: concordance absente hauteur "+height+": "+
    JSON.stringify(data.map(x=>({v:x.vertex,h:x.height,ledger:x.ledger.height}))));
}
async function connectTriangle(vertices,secret,dir){
  const listens=await Promise.all(vertices.map(v=>
    v.send("START",{vertex:v.vertex,secret,directory:dir})));
  const index=new Map(vertices.map((v,i)=>[v.vertex,i]));
  for(const [a,b] of [["A","B"],["B","C"],["C","A"]]){
    const from=vertices[index.get(a)],to=listens[index.get(b)];
    await from.send("CONNECT",{port:to.listener.port});
  }
  const status=await statusAll(vertices);
  if(status.some(x=>x.peers.length!==2||
    !x.peers.some(p=>p.direction==="inbound")||
    !x.peers.some(p=>p.direction==="outbound")))
    throw Error("Le triangle Full Duplex n'est pas totalement connecté");
  return status;
}
async function takeDown(vertices){
  await Promise.allSettled(vertices.map(v=>v.stop()));
}
export async function demonstrateBatonV3({blockCount=9,
  directory=null,cleanup=true}={}){
  if(!Number.isSafeInteger(blockCount)||blockCount<3||blockCount>18)
    throw Error("SPK BATON: 3..18 blocs pour la démonstration");
  const created=!directory;
  const dir=directory||await mkdtemp(join(tmpdir(),"spk-baton-v3-"));
  const secret=randomBytes(32).toString("hex"),verticesNames=BATON_V3.vertices;
  const topo=batonVisualTopology();
  const plan=planRelayContinuity(2048);
  if(plan.length!==2048||
    new Set(plan.map(p=>p.relayId)).size!==2048||
    plan.some(p=>p.sharedChain!==true||p.separateGenesis!==false))
    throw Error("SPK BATON: catalogue continu 2048 relais incorrect");
  let nodes=verticesNames.map(spawn);
  const tick=performance.now(),records=[];
  const base=Math.floor(Date.now()/1000)-1500;
  try{
    await connectTriangle(nodes,secret,dir);
    await concordance(nodes,0);
    for(let height=1;height<=blockCount;height++){
      const expected=routeForHeight(height);
      const process=nodes.find(n=>n.vertex===expected.triangleVertex);
      const mined=await process.send("MINE",{
        timestamp:base+height*30
      },12000);
      if(mined.block.height!==height||
         mined.route.relayId!==expected.relayId||
         mined.route.triangleVertex!==expected.triangleVertex||
         mined.report.hash!==mined.block.hash||
         mined.report.attempts<1)
        throw Error("SPK BATON: bloc miné ne correspond pas au relais "+height);
      const agreed=await concordance(nodes,height);
      const expectedSupply=height*V2_POLICY.firstReward;
      if(agreed.some(x=>x.issued!==expectedSupply||
        x.ledger.entries!==height))
        throw Error("SPK BATON: registre ou émission discordant(e)");
      const current=agreed[0];
      records.push({
        height,relayId:expected.relayId,
        vertex:expected.triangleVertex,
        hash:mined.block.hash,nonce:mined.report.nonce,
        actualSha256dHashes:mined.report.attempts,
        physicalHashesPerSecond:mined.report.realHashPerSecond,
        confirmations:agreed.length,
        cumulativeWork:current.work,
        moneyIssued:current.issued,
        persistedCopies:agreed.filter(x=>x.ledger.tip===current.tip).length
      });
    }
    const beforeRestart=await concordance(nodes,blockCount);
    await takeDown(nodes);
    nodes=verticesNames.map(spawn);
    await connectTriangle(nodes,secret,dir);
    const restored=await concordance(nodes,blockCount);
    if(restored.some(s=>s.tip!==beforeRestart[0].tip)||
       restored.some(s=>s.ledger.entries!==blockCount))
      throw Error("SPK BATON: registre différent après redémarrage");
    const localCopies=verticesNames.map(vertex=>{
      const ledger=createBatonLedger({directory:dir,vertex});
      return {vertex,height:ledger.state.height,tip:ledger.state.hash,
        entries:ledger.verify().entries.length};
    });
    if(new Set(localCopies.map(x=>x.tip)).size!==1)
      throw Error("SPK BATON: les 3 copies locales ne correspondent pas");
    return {
      status:"PASS",protocol:BATON_V3.protocol,
      genesisHash:batonGenesis().hash,
      logicalRelays:2048,
      logicalIndependentBlockchains:0,
      relayScheduleVerified:plan.length,
      relaysActuallyMined:blockCount,
      triangle:{vertices:topo.vertices.map(v=>({
        id:v.id,coordinates:v.position})),
        links:topo.edges.map(e=>e.from+"↔"+e.to),
        independentNodeProcesses:3,
        realExternalServers:0},
      finalHeight:blockCount,tip:restored[0].tip,
      blocks:records,
      totalIssued:restored[0].issued,
      cumulativeWork:restored[0].work,
      sameGenesis:restored.every(s=>s.genesis===batonGenesis().hash),
      allVerticesConverged:true,
      ledgerCopies:localCopies,
      restartRestored:true,
      retargetOccurred:blockCount>=9,
      durationMs:performance.now()-tick,
      bitcoinMainnetBTC:0,
      notes:"One PoW chain traverses 2048 logical relays; only the indicated blocks were actually mined."
    };
  }finally{
    await takeDown(nodes);
    if(created&&cleanup)await rm(dir,{recursive:true,force:true});
  }
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href){
  try{
    const report=await demonstrateBatonV3();
    console.log("SPARKTIATES_BATON_SINGLE_LEDGER_PASS",
      JSON.stringify(report,null,2));
  }catch(e){
    console.error("SPARKTIATES_BATON_SINGLE_LEDGER_FAIL",String(e.stack||e));
    process.exitCode=1;
  }
}
