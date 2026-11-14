/* Salon local distinct : ne lit aucune cle ni aucun stockage de Radio des IA. */
const el=id=>document.getElementById(id);
const history=[];
let pending=false;
function addTurn(who,role,text){
 const box=document.createElement("article");box.className="turn "+role;
 const name=document.createElement("div");name.className="who";name.textContent=who;
 const body=document.createElement("div");body.className="body";body.textContent=text;
 box.append(name,body);
 const list=el("history");
 if(!history.length && list.firstElementChild?.classList.contains("hint"))list.replaceChildren();
 list.append(box);box.scrollIntoView({block:"nearest",behavior:"smooth"});
}
function showSources(sources,warnings=[]){
 const target=el("sources");target.replaceChildren();
 if(!sources.length){
  target.textContent="Aucun résultat documentaire joint à cette réponse.";
 }else{
  for(const [i,s] of sources.entries()){
   const p=document.createElement("p"),link=document.createElement("a"),detail=document.createElement("span");
   link.href=s.url;link.rel="noopener noreferrer";link.target="_blank";
   link.textContent="["+(i+1)+"] "+s.title+" ("+s.engine+")";
   detail.textContent=s.snippet?" — "+s.snippet:"";
   p.append(link,detail);target.append(p);
  }
 }
 if(warnings.length){
  const note=document.createElement("p");note.textContent="Recherche : "+warnings.join(" ");
  target.append(note);
 }
}
function report(message){el("progress").textContent=message;}
function lock(value){pending=value;el("send").disabled=value;el("clear").disabled=value;}
async function health(){
 try{
  const r=await fetch("/health",{cache:"no-store"});
  const d=await r.json();
  el("health").textContent=d.ready?
   "✓ Ollama détecté · Modèle : "+d.model+" · Recherche : "+d.web:
   "Ollama ou le modèle local n'est pas prêt : vérifie l'installation dans WSL.";
 }catch{el("health").textContent="Serveur local non détecté.";}
}
el("send").addEventListener("click",async()=>{
 if(pending)return;
 const message=el("message").value.trim();
 if(!message)return report("Écris une question avant l'envoi.");
 const profile=el("profile").value;
 const web=el("web").checked;
 lock(true);report("Calcul local en cours. Le temps dépend de ton GPU et du modèle.");
 const started=Date.now();
 try{
  const response=await fetch("/api/chat",{
   method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({message,profile,history:history.slice(-12),web}),
  });
  const data=await response.json();
  if(!response.ok)throw Error(data.error||"Échec HTTP "+response.status);
  addTurn("Vous","user",message);
  addTurn("Qwen local · "+profile,"assistant",data.answer);
  history.push({role:"user",content:message},{role:"assistant",content:data.answer});
  if(history.length>12)history.splice(0,history.length-12);
  showSources(data.sources||[],data.web_warnings||[]);
  el("message").value="";
  const seconds=Math.round((Date.now()-started)/1000);
  report("Réponse reçue en "+seconds+" s. "+(Number.isFinite(data.usage?.generated_tokens)?
    data.usage.generated_tokens+" tokens produits.":""));
 }catch(error){report("Aucun message supprimé : "+String(error?.message||error));}
 finally{lock(false);}
});
el("clear").addEventListener("click",()=>{
 if(pending)return;
 if(history.length && !confirm("Effacer uniquement cette discussion locale, sans toucher à Radio des IA ?"))return;
 history.splice(0);el("history").replaceChildren();
 const p=document.createElement("p");p.className="hint";p.textContent="Nouvelle conversation locale prête.";
 el("history").append(p);showSources([]);report("Mémoire locale de cette page réinitialisée.");
});
health();
