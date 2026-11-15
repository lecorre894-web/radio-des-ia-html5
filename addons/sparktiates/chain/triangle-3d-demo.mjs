/**
 * SPARKTIATES TRIANGLE 3D — three independent operating-system processes.
 * A, B and C each mine ONE genuine PoW block in their own process.
 * Full-mesh TCP: A↔B, B↔C, C↔A (all links full duplex).
 * After each block, both other vertices independently replay and verify it.
 *
 * This is a LOCAL private regtest, NOT 3 remote physical computers.
 */
import {fork} from "node:child_process";
import {fileURLToPath} from "node:url";
import {randomBytes} from "node:crypto";
import {performance} from "node:perf_hooks";
import {triangle3D} from "./triangle-3d.mjs";
import {genesisV2,V2_POLICY} from "./pow-v2.mjs";

const workerFile=fileURLToPath(new URL("./pow-v2-peer-process.mjs",import.meta.url));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function createProcess(id){
  const child=fork(workerFile,[],{
    stdio:["ignore","pipe","pipe","ipc"],
    env:{...process.env,SPARTKIATES_3D_VERTEX:id}
  });
  let seq=0,dead=false,stderr="";
  const pending=new Map();
  child.stderr?.on("data",buffer=>{
    stderr=(stderr+buffer.toString("utf8")).slice(-2500);
  });
  child.stdout?.resume();
  const fail=e=>{
    dead=true;
    for(const {reject,timer} of pending.values()){
      clearTimeout(timer);reject(e);
    }
    pending.clear();
  };
  child.once("error",fail);
  child.once("exit",code=>fail(Error("Vertex "+id+" process exit "+code+
    (stderr?": "+stderr:""))));
  child.on("message",m=>{
    if(!m||!Number.isInteger(m.requestId))return;
    const req=pending.get(m.requestId);
    if(!req)return;
    clearTimeout(req.timer);pending.delete(m.requestId);
    m.ok===true?req.resolve(m):req.reject(Error(
      "Vertex "+id+": "+String(m.error||"IPC failed")));
  });
  return {
    id,
    pid:child.pid,
    async request(type,data={},timeout=8000){
      if(dead||!child.connected)throw Error("Vertex "+id+" no longer active");
      const requestId=++seq;
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{
          pending.delete(requestId);
          reject(Error("Vertex "+id+" request "+type+" timeout"));
        },timeout);
        pending.set(requestId,{resolve,reject,timer});
        child.send({type,requestId,...data},e=>{
          if(!e)return;
          const waiting=pending.get(requestId);
          if(waiting){
            pending.delete(requestId);clearTimeout(waiting.timer);
            reject(e);
          }
        });
      });
    },
    async close(){
      if(!dead&&child.connected){
        try{await this.request("STOP",{},2500);}catch{}
        try{child.disconnect();}catch{}
      }
      if(!dead){
        await Promise.race([
          new Promise(resolve=>child.once("exit",resolve)),
          sleep(1500)
        ]);
        if(child.exitCode===null)child.kill("SIGTERM");
      }
    }
  };
}
async function waitForConcordance(vertices,height,{timeout=8000}={}){
  const start=Date.now();
  let last=[];
  while(Date.now()-start<timeout){
    last=await Promise.all(vertices.map(v=>v.request("STATUS",{},2000)));
    const hashes=new Set(last.map(s=>s.hash));
    const works=new Set(last.map(s=>s.work));
    const supplies=new Set(last.map(s=>s.supply));
    if(last.every(s=>s.height===height)&&hashes.size===1&&
       works.size===1&&supplies.size===1)return last;
    await sleep(30);
  }
  throw Error("SPARKTIATES triangle: échec de concordance à la hauteur "+
    height+"; sommets="+JSON.stringify(last.map(s=>({
      height:s.height,hash:s.hash
    }))));
}
export async function demonstrateTriangle3D({
  networkId="spk-net-0001",masterSecret=randomBytes(32).toString("hex")
}={}){
  const topology=triangle3D(networkId);
  const vertices=topology.vertices.map(v=>createProcess(v.id));
  const stamp=Math.floor(Date.now()/1000)-75;
  const started=performance.now(),mined=[],concordances=[];
  try{
    const starts=await Promise.all(vertices.map(v=>
      v.request("START",{networkId,masterSecret})));
    for(const edge of topology.edges){
      const from=topology.vertices.findIndex(v=>v.id===edge.from);
      const to=topology.vertices.findIndex(v=>v.id===edge.to);
      await vertices[from].request("CONNECT",{port:starts[to].listening.port});
    }
    const connected=await Promise.all(vertices.map(v=>v.request("STATUS")));
    if(connected.some(s=>s.stats.peers!==2||
      !s.peers.some(p=>p.direction==="incoming")||
      !s.peers.some(p=>p.direction==="outgoing")))
      throw Error("Triangle Full Duplex non connecté sur ses trois arêtes");
    const startState=await waitForConcordance(vertices,0);
    if(new Set(startState.map(s=>s.hash)).size!==1||
       startState[0].hash!==genesisV2(networkId).hash)
      throw Error("Genèse triangulaire différente");
    for(const step of topology.schedule){
      const vertex=vertices.find(v=>v.id===step.minerVertex);
      const block=await vertex.request("MINE",{
        timestamp:stamp+step.blockHeight
      },10000);
      if(block.mined.height!==step.blockHeight||
         block.report.attempts<1||
         block.report.hash!==block.mined.hash||
         block.report.nonce<0)
        throw Error("Bloc miné invalide par le sommet "+vertex.id);
      const states=await waitForConcordance(vertices,step.blockHeight);
      const expectedSupply=step.blockHeight*V2_POLICY.firstReward;
      if(states.some(s=>s.supply!==expectedSupply))
        throw Error("Conservation monétaire incorrecte à hauteur "+step.blockHeight);
      mined.push({
        vertex:vertex.id,height:block.mined.height,
        hash:block.mined.hash,nonce:block.report.nonce,
        actualSha256dAttempts:block.report.attempts,
        realHashPerSecond:block.report.realHashPerSecond,
        elapsedMs:block.report.elapsedMs,
        peerConfirmations:states.length-1
      });
      concordances.push({
        height:step.blockHeight,
        equalHash:true,equalWork:true,equalSupply:true,
        verifiedNodes:states.length,
        tip:states[0].hash,work:states[0].work,
        supplyAtomic:states[0].supply
      });
    }
    const final=await Promise.all(vertices.map(v=>v.request("STATUS")));
    if(final.some(s=>s.stats.peers!==2)||
       final.some(s=>s.height!==3||s.ownBalance!==V2_POLICY.firstReward))
      throw Error("Chaque sommet doit produire une subvention SPK-V2 vérifiable");
    const total=final.reduce((n,s)=>n+s.ownBalance,0);
    if(total!==final[0].supply||total!==V2_POLICY.firstReward*3)
      throw Error("Triangle : somme des gains des trois mineurs incorrecte");
    const durationMs=performance.now()-started;
    return {
      status:"PASS",networkId,chainId:topology.chainId,
      geometry:{
        coordinates:topology.vertices.map(v=>({id:v.id,...v.position})),
        edges:topology.edges,normal:topology.normal,
        areaVirtualSquareUnits:topology.areaVirtualSquareUnits,
        planarEmbeddingIn3D:true
      },
      architecture:{
        independentOsProcesses:vertices.length,
        fullDuplexTcpLinks:topology.edges.length,
        peersPerVertex:2,
        realExternalComputers:0,
        logicalNetworksAvailable:V2_POLICY.networkCount,
        logicalNetworksRunningInTest:1,
        physicalCpuClockGHz:null
      },
      mining:{genuineSha256d:true,blocks:mined,
        miningVertices:mined.map(b=>b.vertex)},
      consensus:{
        concordances,height:final[0].height,
        tip:final[0].hash,
        cumulativeWork:final[0].work,
        supplyAtomic:final[0].supply,
        balancesByVertex:Object.fromEntries(vertices.map((v,i)=>[
          v.id,final[i].ownBalance])),
        unanimousStateConvergence:true,
        independentRevalidation:true,
        noSignedQuorumRequired:true
      },
      transports:final.map((s,i)=>({
        vertex:vertices[i].id,
        sentFrames:s.stats.sent,receivedFrames:s.stats.received,
        chainSynchronizations:s.stats.syncs
      })),
      elapsedMs:durationMs,
      virtualCoordinatesArePhysicalDistance:false,
      bitcoinMainnetAssets:0
    };
  }finally{
    await Promise.allSettled(vertices.map(v=>v.close()));
  }
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href){
  try{
    const report=await demonstrateTriangle3D();
    console.log("SPARKTIATES_TRIANGLE_3D_PASS",JSON.stringify(report,null,2));
    if(report.status!=="PASS")process.exitCode=1;
  }catch(e){
    console.error("SPARKTIATES_TRIANGLE_3D_FAIL",String(e?.stack||e));
    process.exitCode=1;
  }
}
