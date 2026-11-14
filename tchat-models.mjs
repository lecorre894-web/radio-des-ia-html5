/* Découverte de fournisseurs réels. Ne jamais rebaptiser une IA concurrente. */
export const REAL_PROVIDERS=Object.freeze({
 perplexity:{display:"Perplexity",prefix:/^perplexity\//i,preferred:[
 "perplexity/sonar-pro","perplexity/sonar-pro-search","perplexity/sonar",
 "perplexity/sonar-reasoning-pro","perplexity/sonar-deep-research"]},
 kimi:{display:"Kimi",prefix:/^moonshotai\/kimi-/i,preferred:[
 "moonshotai/kimi-k3.1-pro","moonshotai/kimi-k3.1-pro-highspeed",
 "moonshotai/kimi-k3","moonshotai/kimi-k2.7-code-fast","moonshotai/kimi-k2.7-code",
 "moonshotai/kimi-k2.6","moonshotai/kimi-k2.5"]}
});
export function providerForSpeaker(speaker){
 const name=String(speaker?.nom||"").trim().toLowerCase();
 if(name==="perplexity"||name==="kimi")return name;
 const model=String(speaker?.modele||"");
 if(REAL_PROVIDERS.perplexity.prefix.test(model))return "perplexity";
 if(REAL_PROVIDERS.kimi.prefix.test(model))return "kimi";
 return null;
}
export function providerMatches(provider,model){
 return Boolean(REAL_PROVIDERS[provider]?.prefix.test(String(model||"")));
}
export function catalogOptions(catalog,provider){
 const rule=REAL_PROVIDERS[provider];if(!rule)return [];
 const ids=[...new Set((Array.isArray(catalog)?catalog:[])
   .filter(m=>m&&typeof m.id==="string"&&rule.prefix.test(m.id))
   .map(m=>m.id))];
 return ids.sort((a,b)=>{
  const priority=x=>{const i=rule.preferred.findIndex(y=>y.toLowerCase()===x.toLowerCase());return i<0?1000:i;};
  return priority(a)-priority(b)||a.localeCompare(b);
 });
}
export function resolveParticipantModel(speaker,catalog){
 const provider=providerForSpeaker(speaker);
 const current=String(speaker?.modele||"");
 const actual=new Set((Array.isArray(catalog)?catalog:[]).map(m=>String(m?.id||"")));
 if(provider){
  const candidates=catalogOptions(catalog,provider);
  const selected=candidates.includes(current)?current:candidates[0]||null;
  return {provider,available:Boolean(selected),selected,candidates,changed:Boolean(selected&&selected!==current)};
 }
 const available=actual.has(current);
 const fallback=["gpt-5.5","gpt-5.4-nano","claude-sonnet-4-6"].find(m=>actual.has(m))||null;
 return {provider:null,available:available||Boolean(fallback),selected:available?current:fallback,
   candidates:[],changed:Boolean(!available&&fallback)};
}
export function eligibleParticipants(participants,validModels){
 const everyone=Array.isArray(participants)?participants:[];
 if(!(validModels instanceof Set)||validModels.size===0)return everyone.map((_,i)=>i);
 return everyone.flatMap((p,i)=>validModels.has(p.modele)?[i]:[]);
}
export function nextEligibleIndex(participants,validModels,start=0){
 const count=Array.isArray(participants)?participants.length:0;
 if(!count)return -1;
 for(let step=0;step<count;step++){
  const i=(Math.max(0,Number(start)||0)+step)%count;
  if(!(validModels instanceof Set)||validModels.size===0||validModels.has(participants[i]?.modele))return i;
 }
 return -1;
}
