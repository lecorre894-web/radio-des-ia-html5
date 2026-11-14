/* AI Horde — moteur expérimental ISOLÉ : aucun accès aux données de Radio des IA.
 * API : https://aihorde.net/api/ (v2 text async).
 * Aucune dépendance Puter, GitHub Pages, clé secrète ou stockage de navigateur.
 */
export const HORDE={
  base:"https://aihorde.net/api/v2",
  clientAgent:"RadioDesIA:0.1:https://github.com/lecorre894-web/radio-des-ia-html5",
  anonymousKey:"0000000000",
  maxPrompt:3600,
  maxOutput:240,
  maxContext:2048,
  pollIntervalMs:4500,
  maxPolls:28,
  maxModelName:160
};
const REQUEST_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function listModelsResponse(data){
  if(!Array.isArray(data))throw new Error("Le catalogue reçu n'est pas une liste de modèles.");
  return data.filter(x=>x&&typeof x.name==="string"&&x.name.length<=HORDE.maxModelName&&
    Number.isFinite(Number(x.count))&&Number(x.count)>0)
   .map(x=>({name:x.name,workers:Number(x.count),performance:Number(x.performance)||0}))
   .sort((a,b)=>b.workers-a.workers||a.name.localeCompare(b.name));
}
export function buildTextRequest({prompt,model,maxLength=160}={}){
  const input=String(prompt||"").trim();
  if(!input||input.length>HORDE.maxPrompt)throw new Error("Message requis (maximum 3 600 caractères).");
  const selected=String(model||"").trim();
  if(!selected||selected.length>HORDE.maxModelName)throw new Error("Sélectionnez un modèle réellement disponible.");
  const len=Math.floor(Number(maxLength));
  if(!Number.isFinite(len)||len<32||len>HORDE.maxOutput)throw new Error("Réponse limitée à 32–240 tokens.");
  return {
    prompt:"### Instruction\nRéponds en français, précisément et sans inventer de faits. "+
      "Tu es un modèle communautaire indépendant, et non ChatGPT, Claude ou Kimi.\n"+
      input+"\n### Réponse\n",
    params:{n:1,max_length:len,max_context_length:HORDE.maxContext,temperature:0.7,top_p:0.9},
    models:[selected],
    nsfw:false,
    censor_nsfw:true,
    trusted_workers:false,
    slow_workers:true
  };
}
export function inspectJob(data){
  if(!data||typeof data!=="object")throw new Error("Statut AI Horde illisible.");
  const generated=Array.isArray(data.generations)?data.generations:[];
  const complete=generated.find(x=>typeof x?.text==="string"&&x.text.trim());
  if(complete){
    return {done:true,success:true,text:complete.text,
      model:String(complete.model||"inconnu"),
      worker:String(complete.worker_name||"anonyme")};
  }
  if(data.faulted===true||data.is_possible===false){
    return {done:true,success:false,error:"Aucun résultat : requête impossible ou worker défaillant."};
  }
  if(data.done===true){
    return {done:true,success:false,error:"La requête s'est terminée sans texte exploitable."};
  }
  return {done:false,success:false,waiting:Number(data.waiting)||0,
    processing:Number(data.processing)||0,queuePosition:Number(data.queue_position)||0,
    waitTime:Number(data.wait_time)||0};
}
function cleanFetchError(error){
  const msg=String(error?.message||error||"");
  if(/Failed to fetch|NetworkError|CORS|fetch failed/i.test(msg))
    return new Error("Impossible de joindre AI Horde depuis ce navigateur (réseau ou restriction CORS). La Radio principale reste intacte.");
  return error instanceof Error?error:new Error(msg);
}
async function parseJSONResponse(response){
  let body=null;
  try{body=await response.json();}catch{}
  if(!response.ok){
    const detail=String(body?.message||body?.error||"").slice(0,180);
    throw new Error("AI Horde HTTP "+response.status+(detail?" : "+detail:""));
  }
  if(body===null||typeof body!=="object")throw new Error("Réponse non JSON de AI Horde.");
  return body;
}
export function createHordeClient({fetchImpl=globalThis.fetch,sleepImpl=null,base=HORDE.base}={}){
  if(typeof fetchImpl!=="function")throw new Error("Fetch indisponible.");
  if(base!==HORDE.base)throw new Error("L'adresse du fournisseur ne peut pas être modifiée dans ce prototype.");
  const sleep=sleepImpl||((ms,signal)=>new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(new Error("Requête interrompue."));return;}
    const t=setTimeout(()=>{signal?.removeEventListener("abort",abort);resolve();},ms);
    const abort=()=>{clearTimeout(t);reject(new Error("Requête interrompue."));};
    signal?.addEventListener("abort",abort,{once:true});
  }));
  async function request(path,options={}){
    const headers={
      "Client-Agent":HORDE.clientAgent,
      "apikey":HORDE.anonymousKey,
      ...(options.body?{"Content-Type":"application/json"}:{})
    };
    let response;
    try{response=await fetchImpl(base+path,{
      method:options.method||"GET",headers,signal:options.signal,
      ...(options.body?{body:JSON.stringify(options.body)}:{})
    });}catch(error){throw cleanFetchError(error);}
    return parseJSONResponse(response);
  }
  async function models({signal}={}){
    return listModelsResponse(await request("/status/models?type=text",{signal}));
  }
  async function cancel(id){
    if(!REQUEST_ID.test(id))throw new Error("Identifiant de requête invalide.");
    return request("/generate/text/status/"+id,{method:"DELETE"});
  }
  async function generate({prompt,model,maxLength=160,signal,onStatus=()=>{}}={}){
    const payload=buildTextRequest({prompt,model,maxLength});
    if(signal?.aborted)throw new Error("Requête interrompue.");
    const accepted=await request("/generate/text/async",{method:"POST",body:payload,signal});
    const id=String(accepted.id||"");
    if(!REQUEST_ID.test(id))throw new Error("AI Horde n'a pas renvoyé d'identifiant de requête valide.");
    onStatus({phase:"queued",id,warning:String(accepted.message||"").slice(0,120)});
    let finished=false;
    try{
      for(let i=0;i<HORDE.maxPolls;i++){
        if(signal?.aborted)throw new Error("Requête interrompue.");
        const info=inspectJob(await request("/generate/text/status/"+id,{signal}));
        if(info.done){
          if(!info.success)throw new Error(info.error);
          finished=true;return {...info,id};
        }
        onStatus({...info,phase:"waiting",attempt:i+1});
        await sleep(HORDE.pollIntervalMs,signal);
      }
      throw new Error("Temps maximal d'attente atteint : demande annulée, sans modification de la Radio.");
    }finally{
      if(!finished){
        // Sans annuler sur le même AbortSignal, déjà déclenché.
        try{await cancel(id);}catch{}
      }
    }
  }
  return {models,generate,cancel};
}
