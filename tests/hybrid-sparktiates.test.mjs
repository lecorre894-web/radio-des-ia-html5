import test from "node:test";
import assert from "node:assert/strict";
import {
  VIRTUAL_CLOCK_HZ,VIRTUAL_LOGICAL_CORES,VIRTUAL_TASKS_PER_CORE,VIRTUAL_SLOTS,
  MAX_PHYSICAL_WORKERS,physicalWorkerCount,virtualClockSeconds,
  computeKernel,makeJobs,checksumResults,verifySamples,runWorkerPool
} from "../addons/sparktiates/hybrid/engine.mjs";
import {createPrivateSwarm,validateSwarmJob} from "../addons/sparktiates/hybrid/private-swarm.mjs";
import {buildVrmVirtualWorld} from "../addons/sparktiates/vrm-reality-engine.mjs";

test("110 GHz est une horloge simulée, pas une fréquence matérielle mesurée",()=>{
  assert.equal(VIRTUAL_CLOCK_HZ,110_000_000_000);
  assert.equal(VIRTUAL_LOGICAL_CORES*VIRTUAL_TASKS_PER_CORE,VIRTUAL_SLOTS);
  assert.equal(VIRTUAL_SLOTS,16384);
  assert.equal(virtualClockSeconds(VIRTUAL_CLOCK_HZ),1);
  assert.equal(physicalWorkerCount(2,8),2);
  assert.equal(physicalWorkerCount(32,32),MAX_PHYSICAL_WORKERS);
  assert.equal(physicalWorkerCount(undefined,0),1);
  assert.throws(()=>virtualClockSeconds(-1));
});

test("Noyau stable, sorties identiques pour les mêmes graines et paramètres",()=>{
  const a=computeKernel(1989,60000);
  assert.equal(a,computeKernel(1989,60000));
  assert.notEqual(a,computeKernel(1990,60000));
  assert.notEqual(a,computeKernel(1989,60001));
  assert.throws(()=>computeKernel(1,1000001));
  assert.throws(()=>makeJobs(400,100));
  assert.throws(()=>makeJobs(2,1000001));
});

class FakeWorker {
  constructor(){this.onmessage=null;this.onerror=null;this.closed=false;}
  postMessage(message){
    queueMicrotask(()=>{
      if(this.closed)return;
      const {job}=message;
      this.onmessage?.({data:{type:"RESULT",result:{id:job.id,value:computeKernel(job.seed,job.steps)}}});
    });
  }
  terminate(){this.closed=true;}
}
test("Répartition déterministe de 64 calculs entre 1, 2, 4, 8 workers",async()=>{
  const jobs=makeJobs(64,1500);
  const reference=jobs.map(j=>({id:j.id,value:computeKernel(j.seed,j.steps)}));
  const expected=checksumResults(jobs,reference);
  const counts=[];
  for(const count of [1,2,4,8]){
    let made=0,last=0;
    const actual=await runWorkerPool(jobs,{
      count,createWorker:()=>{made++;return new FakeWorker();},
      onProgress:(done,total)=>{last=done;assert.ok(done<=total);}
    });
    assert.equal(last,64);
    assert.equal(made,count);
    assert.equal(checksumResults(jobs,actual),expected);
    assert.deepEqual(verifySamples(jobs,actual),{pass:true,checked:8,failedJob:null});
    counts.push(made);
  }
  assert.deepEqual(counts,[1,2,4,8]);
});

test("Une erreur volontaire de calcul est détectée plutôt que comptée comme puissance",()=>{
  const jobs=makeJobs(12,1100);
  const results=jobs.map(j=>({id:j.id,value:computeKernel(j.seed,j.steps)}));
  results[0].value^=7;
  assert.equal(verifySamples(jobs,results).pass,false);
  assert.throws(()=>checksumResults(jobs,results.slice(1)));
});

class TestChannel {
  static pool=new Set();
  constructor(name){this.name=name;this.onmessage=null;this.closed=false;TestChannel.pool.add(this);}
  postMessage(data){
    for(const peer of TestChannel.pool){
      if(peer!==this && !peer.closed && peer.name===this.name)
        queueMicrotask(()=>peer.onmessage?.({data}));
    }
  }
  close(){this.closed=true;TestChannel.pool.delete(this);}
}
test("Essaim P2P privé : consentement des deux onglets, calcul distribué, arrêt propre",async()=>{
  const options={createChannel:name=>new TestChannel(name),createWorker:()=>new FakeWorker()};
  const first=createPrivateSwarm(options),second=createPrivateSwarm(options);
  assert.equal(first.peers().length,0);
  assert.equal(second.peers().length,0);
  await assert.rejects(first.runOnPeer("no",makeJobs(1,900)[0]),/absent/);
  first.join();second.join();
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(first.peers().length,1);
  assert.equal(second.peers().length,1);
  const job=makeJobs(1,1200)[0];
  const remote=await first.runOnPeer(second.id,job);
  assert.deepEqual(remote,{id:job.id,value:computeKernel(job.seed,job.steps)});
  second.close();
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(first.peers().length,0);
  first.close();
  assert.equal(TestChannel.pool.size,0);
});
test("Essaim : validation des tâches uniquement numériques, aucune mémoire transmise",()=>{
  assert.ok(validateSwarmJob(makeJobs(1,5)[0]));
  assert.equal(validateSwarmJob({id:1,seed:2,steps:3,conversation:"secret"}),true);
  // Les champs supplémentaires ne sont jamais traités par le kernel.
  assert.equal(validateSwarmJob({id:1,seed:2,steps:0}),false);
  assert.equal(validateSwarmJob({id:1,seed:2,steps:1000001}),false);
  assert.equal(validateSwarmJob({id:256,seed:2,steps:100}),false);
});
test("Projection VRM : événements cités, associations candidates et zéro validation inventée",()=>{
  const base={origin:"ai",type:"CANDIDAT",time:"2026-11-15T09:15:00Z",
    topic:"Marées",model:"Qwen",evidence:"PROPOSITION_IA_NON_VÉRIFIÉE"};
  const events=[
    {...base,id:"aa00000000000001",nom:"Astrophysique",text:"Potentiel de marée et accélération différentielle."},
    {...base,id:"aa00000000000002",nom:"Méthodes",text:"Correction candidate de marée et erreur d'accélération différentielle."}
  ];
  const graph=buildVrmVirtualWorld(events);
  assert.equal(graph.counts.nodes,2);
  assert.ok(graph.edges.length>=1);
  assert.ok(graph.edges.every(e=>e.verified===false));
  assert.ok(graph.nodes.every(x=>x.status==="CANDIDAT_NON_VÉRIFIÉ"));
});
