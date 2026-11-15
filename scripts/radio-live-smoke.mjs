// Test réseau réel, un seul message neutre. Ne lit jamais l'historique personnel.
const ROOT="https://oai.aihorde.net/v1";
const timeout=(ms)=>AbortSignal.timeout(ms);
const listResponse=await fetch(ROOT+"/models",{signal:timeout(15_000),headers:{"Accept":"application/json"}});
if(!listResponse.ok)throw Error("AI Horde catalog HTTP "+listResponse.status);
const body=await listResponse.json();
const models=Array.isArray(body?.data)?body.data:[];
const available=models
  .filter(m=>typeof m?.id==="string"&&m.id.trim()&&Number(m?.x_horde?.worker_count)>0)
  .map(m=>({id:m.id,workers:Number(m.x_horde.worker_count),
    size:Number(m.id.match(/(?:^|[^a-z0-9])(\d+(?:\.\d+)?)b(?:$|[^a-z0-9])/i)?.[1]||0)}))
  .filter(m=>m.size>=7 && m.size<=32)
  .sort((a,b)=>{
    const score=m=>/qwen3\.5-9b/i.test(m.id)?1000:
      /qwen/i.test(m.id)?500:
      /gemma-4-dark-orthia/i.test(m.id)?-100:0;
    return score(b)-score(a)||b.workers-a.workers||a.size-b.size;
  });
if(!available.length){
  console.error("No 7–32B worker available for a meaningful chat smoke test.");
  process.exitCode=2;
}else{
  const chosen=available[0];
  console.log("LIVE_MODEL_SELECTED",JSON.stringify(chosen));
  const started=Date.now();
  const response=await fetch(ROOT+"/chat/completions",{
    method:"POST",signal:timeout(95_000),
    headers:{"Authorization":"Bearer 0000000000","Content-Type":"application/json"},
    body:JSON.stringify({
      model:chosen.id,stream:false,max_tokens:70,temperature:0.2,
      horde:{include_reasoning:false},
      messages:[
        {role:"system",content:"Réponds en français à la salutation de l'utilisateur."},
        {role:"user",content:"Bonjour"}
      ]
    })
  });
  const raw=await response.text();
  if(!response.ok)throw Error("AI Horde LIVE HTTP "+response.status+": "+raw.slice(0,300));
  const result=JSON.parse(raw);
  const answer=result?.choices?.[0]?.message?.content;
  if(typeof answer!=="string"||!answer.trim())throw Error("Réponse AI Horde vide.");
  console.log("LIVE_HORDE_RESPONSE",JSON.stringify({
    model:result?.model||chosen.id,
    elapsedSeconds:Math.round((Date.now()-started)/1000),
    text:answer.trim().slice(0,220),
    isNonempty:true
  }));
}
