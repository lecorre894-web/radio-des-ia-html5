/* Garde-fou des crédits Puter. N'effectue aucun appel réseau ni aucune facturation. */
export const CREDIT_GUARD=Object.freeze({
  defaultOutputTokens:600,
  maximumOutputTokens:2500,
  directContextChars:3600,
  debateContextChars:4600
});
export function boundedTokens(choice){
  const value=Number(choice);
  if(!Number.isFinite(value)||value<=0)return CREDIT_GUARD.defaultOutputTokens;
  return Math.max(80,Math.min(CREDIT_GUARD.maximumOutputTokens,Math.floor(value)));
}
export function requestSize(messages){
  return (Array.isArray(messages)?messages:[]).reduce((sum,msg)=>{
    const content=msg?.content;
    if(typeof content==="string")return sum+content.length;
    if(Array.isArray(content))return sum+content.reduce((n,item)=>n+String(item?.text||"").length,0);
    return sum;
  },0);
}
export function formatUsageSummary(usage){
  if(!usage||typeof usage!=="object")return "Données d’usage indisponibles.";
  const found=[];
  const walk=(obj,route="",depth=0)=>{
    if(depth>3||found.length>=24||!obj||typeof obj!=="object")return;
    for(const [key,value] of Object.entries(obj)){
      const label=route?route+"."+key:key;
      if(typeof value==="number" && Number.isFinite(value) &&
         /(usage|cost|spend|credit|balance|limit|allowance|quota|total|used)/i.test(label)){
        found.push(label+" : "+value.toLocaleString("fr-FR",{maximumFractionDigits:4}));
      }else if(value&&typeof value==="object"&&!Array.isArray(value))walk(value,label,depth+1);
      if(found.length>=24)break;
    }
  };
  walk(usage);
  return found.length?found.join(" · "):
    "Données d’usage reçues mais sans montants reconnus. Consultez le tableau de bord Puter pour les détails.";
}
