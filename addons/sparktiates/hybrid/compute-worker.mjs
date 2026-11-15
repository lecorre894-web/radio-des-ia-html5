import {computeKernel} from "./engine.mjs";
self.onmessage=event=>{
  const item=event.data;
  if(item?.type!=="RUN")return;
  try{
    const job=item.job;
    const value=computeKernel(job.seed,job.steps);
    self.postMessage({type:"RESULT",result:{id:job.id,value}});
  }catch(e){
    self.postMessage({type:"FAIL",message:String(e.message||e)});
  }
};
