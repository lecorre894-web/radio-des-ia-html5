/* Radio SPARKTIATES : préparation de contexte sans fournisseur externe.
 * Un seul modèle local Ollama derrière plusieurs rôles explicitement étiquetés.
 */
export const LOCAL_SPEAKERS=Object.freeze([
  Object.freeze({id:"cairn",name:"Cairn local",task:"Structure"}),
  Object.freeze({id:"brume",name:"Brume locale",task:"Critique"}),
  Object.freeze({id:"aurore",name:"Aurore locale",task:"Ouverture"}),
  Object.freeze({id:"controle",name:"Vérificateur local",task:"Validation"}),
  Object.freeze({id:"recherche",name:"Chercheur local",task:"Recherche"}),
  Object.freeze({id:"ia4",name:"IA4 locale",task:"Synthèse"})
]);
export const STORAGE_KEY="radio:sparktiates:salon:v1";
export function normalizedTranscript(items){
  if(!Array.isArray(items))return [];
  const valid=items.filter(x=>x&&["human","local"].includes(x.kind)
    &&typeof x.text==="string"&&x.text.length<=12000&&typeof x.name==="string")
    .map(x=>({kind:x.kind,text:x.text,name:x.name.slice(0,80),
      model:String(x.model||"").slice(0,128),at:String(x.at||"").slice(0,50)}));
  if(valid.length<=150)return valid;
  const last=valid.slice(-149);
  const root=valid.find(x=>x.kind==="human");
  return root&&!last.includes(root)?[root,...last]:valid.slice(-150);
}
export function buildLocalHistory(transcript){
  const items=normalizedTranscript(transcript);
  const root=items.find(x=>x.kind==="human");
  const recent=items.slice(-11).map(item=>({
    role:item.kind==="human"?"user":"assistant",
    content:(item.kind==="local"?item.name+" : ":"")+item.text.slice(0,800)
  }));
  if(root&&!recent.some(x=>x.role==="user"&&x.content===root.text.slice(0,800))){
    recent.unshift({role:"user",content:root.text.slice(0,800)});
  }
  return recent.slice(-12).map(x=>({role:x.role,content:x.content.slice(0,900)}));
}
export function requestForTurn({question,transcript=[],speaker="cairn",web=false}={}){
  const topic=String(question||"").trim();
  if(!topic||topic.length>2600)throw new Error("Question requise (2 600 caractères maximum).");
  if(!LOCAL_SPEAKERS.some(p=>p.id===speaker))throw new Error("Intervenant inconnu.");
  return {
    message:topic,
    profile:speaker,
    web:web===true,
    history:buildLocalHistory(transcript)
  };
}
export function safeStatus(status){
  if(!status||typeof status!=="object")return {online:0,usable:0,active:0};
  return {
    online:Math.max(0,Number(status.online_nodes)||0),
    usable:Math.max(0,Number(status.usable_slots)||0),
    active:Math.max(0,Number(status.running_jobs)||0)
  };
}
