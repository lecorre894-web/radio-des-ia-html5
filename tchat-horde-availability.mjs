/**
 * Advisory Horde availability — never assumes a live model is fast or doctoral.
 * No inference request or personal content; stats are public and optional.
 */
export const HORDE_STATUS_URL="https://aihorde.net/api/v2/status/models?type=text";
export const HORDE_WAIT_LIMIT_MS=180_000;
export function modelSizeB(name){
  const match=String(name||"").match(/(?:^|[^a-z0-9])(\d+(?:\.\d+)?)b(?=$|[^a-z0-9])/i);
  return match?Number(match[1]):null;
}
function count(value){
  return value!==null && value!==undefined && value!=="" &&
    Number.isFinite(Number(value)) && Number(value)>=0 ? Number(value) : null;
}
export function addHordeAvailability(models,statuses=[]){
  const exact=new Map();
  for(const x of Array.isArray(statuses)?statuses:[])
    if(x&&typeof x.name==="string")exact.set(x.name,x);
  return (Array.isArray(models)?models:[]).map(m=>{
    const x=exact.get(m.id);
    return {
      ...m,
      workers:x?count(x.count):count(m.workers),
      etaSeconds:x?count(x.eta):null,
      queuedJobs:x?count(x.jobs):null,
      sizeB:modelSizeB(m.id),
      liveStats:Boolean(x)
    };
  });
}
export function chooseResponsiveHorde(models){
  // Prefer substantial but not extremely large models when their worker
  // availability is known. A role is not evidence of doctoral competence.
  const candidates=(Array.isArray(models)?models:[]).filter(m=>
    m.workers!==null && m.workers>0 &&
    m.sizeB!==null && m.sizeB>=7 && m.sizeB<=32);
  if(!candidates.length)return null;
  const withEta=candidates.filter(m=>Number.isFinite(m.etaSeconds));
  const source=withEta.length?withEta:candidates;
  return [...source].sort((a,b)=>
    (a.etaSeconds??Infinity)-(b.etaSeconds??Infinity) ||
    (b.workers??0)-(a.workers??0) || a.id.localeCompare(b.id,"fr"))[0];
}
export async function getHordeAvailability({fetcher=fetch,signal}={}){
  const r=await fetcher(HORDE_STATUS_URL,{method:"GET",mode:"cors",cache:"no-store",signal});
  if(!r.ok)throw Error("Disponibilité AI Horde HTTP "+r.status);
  const text=await r.text();
  if(text.length>1_500_000)throw Error("Réponse de disponibilité anormalement volumineuse.");
  let data;
  try{data=JSON.parse(text);}
  catch{throw Error("Statistiques Horde non JSON.");}
  if(!Array.isArray(data))throw Error("Liste Horde incorrecte.");
  return data.filter(x=>x&&typeof x.name==="string");
}
