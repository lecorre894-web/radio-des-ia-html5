import {LOCAL_SPEAKERS,STORAGE_KEY,normalizedTranscript,requestForTurn,safeStatus}
  from "./radio-sparktiates-core.mjs";
/* Salon SPARKTIATES local : pas de Puter, pas d'API ou d'images tierces.
 * Tous les appels applicatifs sont sur la même origine 127.0.0.1:8766.
 */
const $=id=>document.getElementById(id);
const label=id=>LOCAL_SPEAKERS.find(s=>s.id===id)?.name||"Modèle local";
let transcript=[];
let active=false,stopAfterTurn=false,model="";
try{transcript=normalizedTranscript(JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]"));}catch{}
function save(){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(transcript.slice(-150)));}catch{
    setProgress("Attention : sauvegarde locale du navigateur indisponible.");
  }
}
function setProgress(value){$("progress").textContent=value;}
function addItem(kind,text,name,actualModel=""){
  const article=document.createElement("article");
  article.className="turn "+(kind==="human"?"user":"assistant");
  const who=document.createElement("div");who.className="who";
  who.textContent=name+(actualModel?" · "+actualModel:"");
  const body=document.createElement("div");body.className="body";
  body.textContent=text;
  article.append(who,body);
  $("log").append(article);
  $("log").scrollTop=$("log").scrollHeight;
}
function draw(){
  $("log").replaceChildren();
  if(!transcript.length){
    const p=document.createElement("p");
    p.className="hint";
    p.textContent="Premier message : il restera la racine du fil local.";
    $("log").append(p);
  }
  for(const item of transcript)addItem(item.kind,item.text,item.name,item.model);
}
function record(kind,name,text,actualModel=""){
  if(transcript.length===0)$("log").replaceChildren();
  const item={kind,name,text,model:actualModel,at:new Date().toISOString()};
  transcript.push(item);
  if(transcript.length>150)transcript.splice(0,transcript.length-150);
  addItem(kind,text,name,actualModel);
  save();
}
function showSources(sources){
  const root=$("sources");root.replaceChildren();
  let found=0;
  for(const source of (Array.isArray(sources)?sources.slice(0,8):[])){
    try{
      const url=new URL(String(source.url));
      if(url.protocol!=="https:")continue;
      const p=document.createElement("p");
      const a=document.createElement("a");a.href=url.href;a.target="_blank";
      a.rel="noreferrer noopener";a.textContent=String(source.title||url.hostname).slice(0,140);
      const span=document.createElement("span");span.textContent=" — "+String(source.snippet||"").slice(0,450);
      p.append(a,span);root.append(p);found++;
    }catch{}
  }
  if(!found)root.textContent="Aucune source renvoyée pour ce tour.";
}
function lock(value){
  active=value;
  for(const id of ["send","cycle","new","speaker","export"])$(id).disabled=value;
  $("stop").disabled=!value;
}
async function checkServer(){
  try{
    const [response,ident]=await Promise.all([
      fetch("/api/v1/status",{cache:"no-store"}),
      fetch("/api/v1/personas",{cache:"no-store"})
    ]);
    const status=await response.json(),roles=await ident.json();
    if(!response.ok||!ident.ok)throw Error(status.error||roles.error||"Serveur non disponible.");
    const snapshot=safeStatus(status);
    model=String(roles.model||"aucun modèle actif");
    $("health").textContent=snapshot.online>0?
      "✓ "+snapshot.online+" nœud(s) disponible(s) · "+snapshot.usable+
      " slot(s) · "+snapshot.active+" tâche(s) en cours":
      "Aucun nœud de calcul local prêt. Ollama ou le modèle est absent.";
    $("identity").textContent="Modèle déclaré : "+model+
      " · Six rôles logiciels, pas six modèles propriétaires distincts.";
  }catch(error){$("health").textContent="SPARKTIATES indisponible : "+String(error?.message||error);}
}
async function sendTurn(question,speaker,web){
  const payload=requestForTurn({question,speaker,transcript,web});
  const res=await fetch("/api/v1/chat",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(payload)
  });
  let data;
  try{data=await res.json();}catch{throw Error("Réponse HTTP non JSON.");}
  if(!res.ok)throw Error(String(data.error||"Serveur HTTP "+res.status).slice(0,250));
  if(typeof data.answer!=="string"||!data.answer.trim())throw Error("Le modèle n'a produit aucune réponse.");
  const actualModel=String(data.model||"modèle non identifié").slice(0,128);
  record("local",label(speaker),data.answer,actualModel);
  showSources(data.sources);
  setProgress(label(speaker)+" : réponse du nœud "+String(data.node_id||"inconnu")+
    " · "+actualModel+" · aucun crédit Puter.");
}
async function launch(profiles){
  if(active)return;
  const question=$("message").value.trim();
  if(!question||question.length>2600)return setProgress("Question obligatoire (2 600 caractères maximum).");
  const web=$("web").checked;
  lock(true);stopAfterTurn=false;
  record("human","Toi",question);
  $("message").value="";
  let completed=0;
  try{
    for(const role of profiles){
      if(stopAfterTurn)break;
      setProgress("Calcul réel demandé à "+label(role)+"… "+(completed+1)+"/"+profiles.length);
      try{await sendTurn(question,role,web);}
      catch(error){
        setProgress("Interrompu au rôle "+label(role)+" : "+String(error?.message||error)+
          ". Les messages déjà enregistrés sont conservés.");
        break;
      }
      completed++;
    }
    if(completed===profiles.length)setProgress(completed+" rôle(s) terminé(s). "+
      "Tour limité ; aucune boucle infinie ni modèle externe.");
    if(stopAfterTurn)setProgress("Cycle arrêté après "+completed+" rôle(s). Messages conservés.");
  }finally{lock(false);void checkServer();}
}
$("send").addEventListener("click",()=>void launch([$("speaker").value]));
$("cycle").addEventListener("click",()=>void launch(LOCAL_SPEAKERS.map(s=>s.id)));
$("stop").addEventListener("click",()=>{stopAfterTurn=true;setProgress("Arrêt demandé après la réponse en cours.");});
$("new").addEventListener("click",()=>{
  if(active)return;
  if(transcript.length&&!confirm("Effacer uniquement la discussion SPARKTIATES locale ?"))return;
  transcript=[];save();draw();showSources([]);
  setProgress("Nouveau salon local. Radio des IA publique non touchée.");
});
$("export").addEventListener("click",()=>{
  const data={format:"radio-sparktiates-local-v1",exportedAt:new Date().toISOString(),
    transcript:normalizedTranscript(transcript)};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download="radio-sparktiates-local.json";
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
draw();void checkServer();
