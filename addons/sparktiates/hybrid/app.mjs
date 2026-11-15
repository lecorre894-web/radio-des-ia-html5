import {
  VIRTUAL_CLOCK_HZ,VIRTUAL_SLOTS,physicalWorkerCount,virtualClockSeconds,
  makeJobs,runWorkerPool,computeKernel,checksumResults,verifySamples
} from "./engine.mjs";
import {createPrivateSwarm} from "./private-swarm.mjs";
import {buildVrmVirtualWorld} from "../vrm-reality-engine.mjs";

const $=id=>document.getElementById(id);
const formatInteger=n=>new Intl.NumberFormat("fr-FR",{maximumFractionDigits:0}).format(n);
const number=n=>new Intl.NumberFormat("fr-FR",{maximumFractionDigits:3}).format(n);
const actualWorkers=physicalWorkerCount(navigator.hardwareConcurrency||2,8);
const newWorker=()=>new Worker(new URL("./compute-worker.mjs",import.meta.url),{type:"module"});
const pool=$("poolSize");
for(let i=1;i<=actualWorkers;i++){
  const option=document.createElement("option");
  option.value=String(i);
  option.textContent=i+" worker"+(i>1?"s":"");
  if(i===actualWorkers)option.selected=true;
  pool.append(option);
}
$("workersCount").textContent=String(actualWorkers);
let running=false,world=null;
const swarm=createPrivateSwarm({
  createWorker:newWorker,
  onPeers:peers=>{
    $("swarmStatus").textContent=swarm.enabled?
      "Essaim privé actif · "+peers.length+" autre(s) onglet(s) autorisé(s). "+
      "Seuls les travaux numériques sont échangés.":"Essaim arrêté. Aucun partage entre onglets.";
  }
});
function buttonsBusy(busy){
  for(const id of ["run","workCount","rounds","poolSize"]){
    $(id).disabled=busy;
  }
}
async function run(){
  if(running)return;
  running=true;buttonsBusy(true);
  $("results").hidden=true;
  const jobs=makeJobs(Number($("workCount").value),Number($("rounds").value));
  const hardware=physicalWorkerCount(navigator.hardwareConcurrency,Number(pool.value));
  const peers=swarm.enabled?swarm.peers():[];
  const remoteJobs=peers.length?jobs.slice(0,Math.min(4,peers.length*2,jobs.length-1)):[];
  const localJobs=jobs.slice(remoteJobs.length);
  const totalUnits=jobs.reduce((a,j)=>a+j.steps,0);
  const start=performance.now();
  let remoteFinished=0,remoteFallback=0;
  $("computeStatus").textContent="Exécution locale · "+hardware+" workers. "+
    remoteJobs.length+" travaux proposés à l'essaim privé.";
  try{
    const localPromise=runWorkerPool(localJobs,{
      createWorker:newWorker,count:hardware,
      onProgress:(done,total)=>{
        if(done===total||done%8===0)
          $("computeStatus").textContent="Calcul : "+(done+remoteFinished)+"/"+jobs.length+
            " travaux, moteurs physiques réellement sollicités.";
      }
    });
    const remotePromise=Promise.all(remoteJobs.map(async(job,i)=>{
      const peer=peers[i%peers.length];
      try{
        const result=await swarm.runOnPeer(peer.id,job,{timeoutMs:6500});
        // Only synthetic deterministic jobs travel. Verify *every* remote result.
        if(result.value!==computeKernel(job.seed,job.steps))
          throw Error("Résultat pair non vérifié");
        remoteFinished++;
        return result;
      }catch{
        remoteFallback++;
        const result=await runWorkerPool([job],{createWorker:newWorker,count:1});
        remoteFinished++;
        return result[0];
      }
    }));
    const [locally,remotely]=await Promise.all([localPromise,remotePromise]);
    const byId=new Map([...locally,...remotely].map(x=>[x.id,x]));
    const ordered=jobs.map(j=>byId.get(j.id));
    const checksum=checksumResults(jobs,ordered);
    const check=verifySamples(jobs,ordered,{sampleCount:8});
    if(!check.pass)throw Error("Intégrité en échec au travail "+check.failedJob);
    const elapsed=Math.max(0.001,performance.now()-start);
    const throughput=totalUnits/(elapsed/1000);
    $("realRate").textContent=formatInteger(throughput);
    $("realTime").textContent=number(elapsed)+" ms";
    $("virtualTime").textContent=number(virtualClockSeconds(totalUnits)*1e6)+" µs";
    $("integrity").textContent="PASS · "+check.checked+" vérifications";
    $("checksum").textContent="Empreinte d'agrégation : 0x"+checksum;
    $("results").hidden=false;
    $("computeStatus").textContent="Terminé · "+formatInteger(jobs.length)+
      " travaux ; "+formatInteger(totalUnits)+" opérations réellement exécutées. "+
      "Réponses P2P : "+(remoteJobs.length-remoteFallback)+
      " ; secours local : "+remoteFallback+
      ". L'horloge 110 GHz est exclusivement une simulation.";
  }catch(e){
    $("computeStatus").textContent="Échec mesuré : "+String(e.message||e)+
      ". Aucun résultat annoncé comme réussi.";
  }finally{running=false;buttonsBusy(false);}
}
$("run").addEventListener("click",()=>void run());
$("resetResult").addEventListener("click",()=>{
  $("results").hidden=true;$("computeStatus").textContent="Prêt. Aucune mesure affichée.";
});
$("joinSwarm").addEventListener("click",()=>{
  try{
    swarm.join();
    $("joinSwarm").disabled=true;$("leaveSwarm").disabled=false;
    $("swarmStatus").textContent="Essaim privé actif. Ouvre un second onglet et active-le aussi.";
  }catch(e){
    $("swarmStatus").textContent="Essaim indisponible : "+String(e.message||e);
  }
});
$("leaveSwarm").addEventListener("click",()=>{
  swarm.close();$("joinSwarm").disabled=false;$("leaveSwarm").disabled=true;
});
$("newTab").addEventListener("click",()=>window.open("./index.html","_blank","noopener,noreferrer"));
window.addEventListener("pagehide",()=>swarm.close());

async function readVrmEvents(max=200){
  return new Promise((resolve,reject)=>{
    const open=indexedDB.open("radio-des-ia-vrm-v1");
    open.onerror=()=>reject(open.error||Error("VRM indisponible."));
    open.onsuccess=()=>{
      const db=open.result;
      if(!db.objectStoreNames.contains("events")){
        db.close();resolve([]);return;
      }
      let found=[];
      try{
        const tx=db.transaction("events","readonly");
        const req=tx.objectStore("events").index("time").openCursor(null,"prev");
        req.onsuccess=()=>{
          const cursor=req.result;
          if(cursor&&found.length<max){
            found.push(cursor.value);
            cursor.continue();
          }else{
            db.close();
            resolve(found.reverse());
          }
        };
        req.onerror=()=>{db.close();reject(req.error||Error("Lecture VRM interrompue."));};
      }catch(e){db.close();reject(e);}
    };
  });
}
$("loadVrm").addEventListener("click",async()=>{
  $("memoryStatus").textContent="Lecture de la VRM locale en cours…";
  $("exportWorld").disabled=true;
  try{
    const events=await readVrmEvents(200);
    world=buildVrmVirtualWorld(events,{maxEvents:200});
    $("nodes").textContent=String(world.counts.nodes);
    $("edges").textContent=String(world.counts.edges);
    $("checks").textContent=String(world.extrapolationPlans.length);
    $("memoryResults").hidden=false;
    const list=$("worldPreview");list.replaceChildren();
    const items=world.extrapolationPlans.slice(0,4).map(e=>
      "["+e.status+"] "+e.action+" (preuve : "+e.proof+")");
    if(!items.length&&events.length)items.push(
      "Citations chargées ; aucun contrôle thématique prédéfini. Elles restent non vérifiées.");
    for(const item of items){
      const li=document.createElement("li");li.textContent=item;list.append(li);
    }
    $("exportWorld").disabled=!events.length;
    $("memoryStatus").textContent=events.length?
      "VRM lue localement : "+events.length+" événements. Graphe non génératif, aucune transmission.":
      "Aucun événement VRM enregistré sur cette origine. Active d'abord la VRM dans la Radio.";
  }catch(e){
    $("memoryStatus").textContent="Lecture impossible : "+String(e.message||e);
  }
});
$("exportWorld").addEventListener("click",()=>{
  if(!world)return;
  const blob=new Blob([JSON.stringify(world,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement("a");
  anchor.href=url;anchor.download="sparktiates-vrm-monde-virtuel.json";
  document.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
});
if("serviceWorker" in navigator&&
  (location.protocol==="https:"||location.hostname==="localhost"||location.hostname==="127.0.0.1")){
  navigator.serviceWorker.register("./sw.js",{scope:"./"}).catch(()=>{});
}
