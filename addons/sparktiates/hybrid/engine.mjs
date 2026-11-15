/**
 * SPARKTIATES HYBRID — moteur numérique local, déterministe et mesurable.
 * Une fréquence virtuelle de 110 GHz est une échelle SIMULÉE, jamais la
 * fréquence du CPU, et ne doit pas être présentée comme un benchmark matériel.
 */
export const VIRTUAL_CLOCK_HZ=110_000_000_000;
export const VIRTUAL_LOGICAL_CORES=32;
export const VIRTUAL_TASKS_PER_CORE=512;
export const VIRTUAL_SLOTS=VIRTUAL_LOGICAL_CORES*VIRTUAL_TASKS_PER_CORE;
export const MAX_PHYSICAL_WORKERS=8;
export const MAX_JOB_STEPS=1_000_000;
export function physicalWorkerCount(hardwareConcurrency=2,requested=8){
  const detected=Number.isFinite(+hardwareConcurrency)?Math.floor(+hardwareConcurrency):2;
  const requestedCount=Number.isFinite(+requested)?Math.floor(+requested):2;
  return Math.max(1,Math.min(MAX_PHYSICAL_WORKERS,detected||2,requestedCount||1));
}
export function virtualClockSeconds(workUnits){
  const n=Number(workUnits);
  if(!Number.isFinite(n)||n<0)throw Error("Quantité de travail virtuelle invalide.");
  return n/VIRTUAL_CLOCK_HZ;
}
export function computeKernel(seed,steps){
  if(!Number.isSafeInteger(steps)||steps<0||steps>MAX_JOB_STEPS)
    throw Error("Nombre de tours hors limites.");
  if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)
    throw Error("Graine de calcul hors limites.");
  let x=(seed>>>0)||1;
  for(let i=0;i<steps;i++){
    x^=x<<13;
    x^=x>>>17;
    x^=x<<5;
    x=(Math.imul(x,1664525)+1013904223)>>>0;
  }
  return x>>>0;
}
export function makeJobs(count=64,steps=60_000){
  if(!Number.isInteger(count)||count<1||count>256)throw Error("Nombre de travaux invalide.");
  if(!Number.isInteger(steps)||steps<1||steps>MAX_JOB_STEPS)throw Error("Longueur du calcul invalide.");
  return Array.from({length:count},(_,i)=>({
    id:i,seed:(Math.imul(i+1,2654435761)>>>0)||1,steps
  }));
}
export function checksumResults(jobs,results){
  if(jobs.length!==results.length)throw Error("Nombre de résultats incohérent.");
  let checksum=0x811c9dc5;
  for(let i=0;i<jobs.length;i++){
    const result=results[i];
    if(!result||result.id!==jobs[i].id||!Number.isSafeInteger(result.value)||
       result.value<0||result.value>0xffffffff)
      throw Error("Résultat invalide pour le travail "+i);
    checksum=(Math.imul(checksum^result.value,16777619))>>>0;
  }
  return checksum.toString(16).padStart(8,"0");
}
export function verifySamples(jobs,results,{sampleCount=6}={}){
  const indices=new Set([0,jobs.length-1]);
  const n=Math.min(jobs.length,Math.max(2,Math.floor(sampleCount)));
  for(let i=0;i<n;i++)indices.add(Math.floor(i*(jobs.length-1)/(n-1)));
  for(const i of indices){
    if(computeKernel(jobs[i].seed,jobs[i].steps)!==results[i]?.value)
      return {pass:false,checked:[...indices].length,failedJob:i};
  }
  return {pass:true,checked:indices.size,failedJob:null};
}
export async function runWorkerPool(jobs,{createWorker,count=2,onProgress=()=>{}}={}){
  if(!Array.isArray(jobs)||!jobs.length||jobs.length>256||typeof createWorker!=="function")
    throw Error("Travaux ou fabrique de workers invalides.");
  const poolSize=Math.min(Math.max(1,Math.floor(count)),MAX_PHYSICAL_WORKERS,jobs.length);
  const output=Array(jobs.length),workers=[];
  let cursor=0,finished=0;
  const runWorker=worker=>new Promise((resolve,reject)=>{
    let running=null,settled=false;
    const end=error=>{
      if(settled)return;
      settled=true;
      worker.onmessage=null;
      worker.onerror=null;
      error?reject(error):resolve();
    };
    const next=()=>{
      if(cursor>=jobs.length){end();return;}
      const index=cursor++,job=jobs[index];
      running=index;
      try{worker.postMessage({type:"RUN",job});}catch(e){end(e);}
    };
    worker.onmessage=event=>{
      const data=event?.data;
      if(data?.type!=="RESULT"||!data.result||
         data.result.id!==jobs[running]?.id){
        end(Error("Réponse de worker invalide."));return;
      }
      output[running]=data.result;
      finished++;
      onProgress(finished,jobs.length);
      next();
    };
    worker.onerror=e=>end(Error("Calcul du worker interrompu : "+String(e?.message||e)));
    next();
  });
  try{
    for(let i=0;i<poolSize;i++)workers.push(createWorker());
    await Promise.all(workers.map(runWorker));
    checksumResults(jobs,output);
    return output;
  }finally{
    for(const worker of workers)try{worker.terminate?.();}catch{}
  }
}
