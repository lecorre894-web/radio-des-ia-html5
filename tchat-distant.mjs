import {buildPrompt, responseText, cleanAnswer, qualityIssue} from "./tchat-core.mjs";

const $ = id => document.getElementById(id);
const KEY = "radio-salon-distant-v1";
const START = [
  {nom:"Cairn",role:"Épistémologie, audit critique, contradictions argumentées",modele:"gpt-5.5"},
  {nom:"Brume",role:"Mathématiques, physique et méthodologie expérimentale",modele:"claude-sonnet-4-6"},
  {nom:"Aurore",role:"Philosophie, science ouverte et nouvelles hypothèses",modele:"gemini-3.1-flash-lite"}
];
const state = {
  participants: structuredClone(START), messages: [], sujet:"", next:0, tours:0,
  auto:false, busy:false, controller:null, activeCard:null, current:null, catalog:[],
  validModels:new Set(), lastRender:0
};
function status(value){$("etat").textContent=value;}
function available(){if(!window.puter?.ai?.chat)throw Error("Puter.js indisponible. Vérifie Internet et les bloqueurs de scripts.");return window.puter;}
function save(){
  try{
    localStorage.setItem(KEY,JSON.stringify({
      participants:state.participants, messages:state.messages.slice(-150),
      sujet:state.sujet, next:state.next, tours:state.tours
    }));
  }catch{status("Stockage local saturé : exporte ta conversation pour en conserver une copie.");}
}
function restore(){
  try{
    const d=JSON.parse(localStorage.getItem(KEY)||"null");
    if(!d || !Array.isArray(d.participants) || !d.participants.length)return;
    state.participants=d.participants.filter(x=>x&&typeof x.nom==="string").map(x=>({
      nom:String(x.nom).slice(0,80), role:String(x.role||"Analyse").slice(0,350),
      modele:String(x.modele||"gpt-5.5").slice(0,130)
    }));
    if(!state.participants.length)state.participants=structuredClone(START);
    state.messages=(Array.isArray(d.messages)?d.messages:[]).filter(x=>x&&typeof x.texte==="string");
    state.sujet=String(d.sujet||"").slice(0,4000);
    state.next=Number(d.next)||0;
    state.tours=Number(d.tours)||0;
  }catch{}
}
function buttonStates(){
  $("tour").disabled=state.busy;
  $("infini").disabled=state.busy || state.auto;
  $("arreter").disabled=!state.busy&&!state.auto;
  $("nouveau").disabled=state.busy;
  $("connecter").disabled=state.busy;
  $("etatMode").textContent=state.auto?"∞ Diffusion automatique":state.busy?"IA en cours de réponse":"Salon prêt";
}
function renderParts(){
  const host=$("parts");host.replaceChildren();
  for(const [index,p] of state.participants.entries()){
    const row=document.createElement("div");row.className="part";
    const nom=document.createElement("input");nom.value=p.nom;nom.maxLength=80;nom.setAttribute("aria-label","Nom de l'intervenant");
    nom.addEventListener("change",()=>{p.nom=nom.value.trim()||p.nom;save()});
    const role=document.createElement("textarea");role.value=p.role;role.rows=2;role.setAttribute("aria-label","Spécialité de l'intervenant");
    role.addEventListener("change",()=>{p.role=role.value.trim()||p.role;save()});
    const modele=document.createElement("input");modele.value=p.modele;modele.setAttribute("list","modeleCatalogue");modele.setAttribute("aria-label","Modèle distant");modele.placeholder="Identifiant du modèle";modele.autocomplete="off";
    modele.addEventListener("change",()=>{p.modele=modele.value.trim()||p.modele;save()});
    const supprimer=document.createElement("button");supprimer.textContent="Retirer";supprimer.disabled=state.participants.length===1;
    supprimer.addEventListener("click",()=>{if(state.busy)return;state.participants.splice(index,1);state.next=0;renderParts();save()});
    row.append(nom,role,modele,supprimer);host.append(row);
  }
}
function makeMessage(m){
  const card=document.createElement("article");card.className="msg "+(m.origin==="human"?"human":"ai");
  const meta=document.createElement("div");meta.className="meta";
  meta.textContent=String(m.nom||"Participant")+" · "+String(m.heure||"")+(m.modele?" · "+m.modele:"");
  const text=document.createElement("div");text.className="body";text.textContent=m.texte||"⏳ Réflexion en cours…";
  card.append(meta,text);
  return {card,text};
}
function render(){
  const host=$("fil");host.replaceChildren();
  for(const m of state.messages.slice(-100)){
    const view=makeMessage(m);
    host.append(view.card);
    if(m===state.current)state.activeCard=view.text;
  }
  $("compteur").textContent=state.tours+" tours";
  save();
}
function addHuman(){
  const value=$("moi").value.trim();
  if(!value)return;
  $("moi").value="";
  state.messages.push({origin:"human",nom:"Vous",texte:value,heure:new Date().toLocaleTimeString("fr-FR")});
  render();status("Question enregistrée exactement : réponse prioritaire au prochain tour.");
  if(!state.busy&&!state.auto)void nextTour();
}
async function signIn(){
  try{
    const p=available();
    if(!p.auth.isSignedIn())await p.auth.signIn();
    const user=await p.auth.getUser().catch(()=>null);
    $("connexion").textContent="Connecté"+(user?.username?" : "+user.username:"");
    status("Connexion établie. Chaque utilisateur dispose d'une allocation gratuite propre ; des frais peuvent s'appliquer après épuisement.");
    await loadCatalog();
  }catch(e){status("Connexion impossible : "+String(e?.message||e));}
}
async function loadCatalog(){
  try{
    const p=available();
    const list=await p.ai.listModels();
    if(!Array.isArray(list)||!list.length)throw Error("Catalogue vide");
    state.catalog=list.filter(m=>m&&typeof m.id==="string");
    state.validModels=new Set(state.catalog.map(m=>m.id));
    const listNode=$("modeleCatalogue");listNode.replaceChildren();
    for(const model of state.catalog){
      const op=document.createElement("option");op.value=model.id;
      op.label=[model.name||model.id,model.provider].filter(Boolean).join(" · ");
      listNode.append(op);
    }
    const names=new Set(state.catalog.map(m=>m.id));
    // Les modèles préférés ne sont modifiés que s'ils sont vraiment absents du catalogue.
    for(const speaker of state.participants){
      if(!names.has(speaker.modele)){
        const fallback=["gpt-5.5","gpt-5.4-nano","claude-sonnet-4-6"].find(id=>names.has(id));
        if(fallback)speaker.modele=fallback;
      }
    }
    renderParts();
    $("catalogue").textContent=state.catalog.length+" modèles distants référencés ; disponibilité, tarifs et capacités variables.";
    save();
  }catch(e){$("catalogue").textContent="Catalogue non accessible : "+String(e?.message||e);}
}
function speech(name,text){
  if(!$("voix").checked||!("speechSynthesis" in window))return;
  const utterance=new SpeechSynthesisUtterance(name+". "+text.slice(0,2400));
  utterance.lang="fr-FR";speechSynthesis.speak(utterance);
}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
async function nextTour(){
  if(state.busy)return;
  try{
    const p=available();
    if(!p.auth.isSignedIn()){
      status("Connecte ton compte Puter avant de parler. Cette action ne publie aucune clé.");
      state.auto=false;buttonStates();return;
    }
  }catch(e){status(String(e?.message||e));state.auto=false;return;}
  const participant=state.participants[state.next%state.participants.length];
  state.next=(state.next+1)%state.participants.length;
  const messages=buildPrompt({participants:state.participants,index:(state.next-1+state.participants.length)%state.participants.length,
    messages:state.messages,sujet:state.sujet});
  const current={origin:"ai",nom:participant.nom,modele:participant.modele,heure:new Date().toLocaleTimeString("fr-FR"),texte:""};
  state.messages.push(current);state.current=current;state.busy=true;
  state.controller=new AbortController();
  render();buttonStates();
  status(participant.nom+" réfléchit avec "+participant.modele+"…");
  try{
    const opts={model:participant.modele,stream:true,signal:state.controller.signal};
    const long=$("longueur").value;
    if(long!=="auto")opts.max_tokens=Number(long);
    const stream=await window.puter.ai.chat(messages,opts);
    let full="";
    if(stream&&typeof stream[Symbol.asyncIterator]==="function"){
      for await(const chunk of stream){
        if(chunk?.type==="error")throw Error(chunk.message||"Erreur du fournisseur");
        const delta=chunk?.type==="text"?String(chunk.text||""):"";
        if(delta){full+=delta;
          if(state.activeCard && Date.now()-state.lastRender>100){
            state.lastRender=Date.now();state.activeCard.textContent=full;
          }
        }
      }
    } else full=responseText(stream);
    const normalized=cleanAnswer(full,state.participants);
    const error=qualityIssue(normalized,state.messages.filter(m=>m!==current));
    if(error)throw Error("Réponse rejetée : "+error);
    current.texte=normalized;
    state.tours++;
    status(participant.nom+" : réponse reçue. Tour n°"+state.tours);
    speech(participant.nom,current.texte);
  }catch(e){
    state.messages=state.messages.filter(m=>m!==current);
    state.auto=false;
    status("Réponse interrompue ou refusée : "+String(e?.message||e)+". Vérifie la connexion, les crédits Puter et le modèle choisi.");
  }finally{
    state.busy=false;state.controller=null;state.current=null;state.activeCard=null;render();buttonStates();
  }
}
async function launchInfinity(){
  if(state.auto || state.busy)return;
  if(!window.puter?.auth?.isSignedIn()){status("Connecte Puter avant de lancer ∞.");return;}
  state.auto=true;buttonStates();
  while(state.auto){
    await nextTour();
    if(!state.auto)break;
    const delay=Math.max(0,Math.min(120,Number($("pause").value)||0))*1000;
    const end=Date.now()+delay;
    while(state.auto&&Date.now()<end)await sleep(Math.min(200,end-Date.now()));
  }
  state.auto=false;buttonStates();
}
function stop(){
  state.auto=false;
  if(state.controller)state.controller.abort();
  if("speechSynthesis" in window)speechSynthesis.cancel();
  status("Arrêt demandé. Une génération déjà envoyée au fournisseur peut rester comptabilisée.");
  buttonStates();
}
function exportConversation(){
  const data={export_date:new Date().toISOString(),participants:state.participants,messages:state.messages};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const href=URL.createObjectURL(blob);const a=document.createElement("a");
  a.href=href;a.download="radio-des-ia-conversation.json";a.click();
  setTimeout(()=>URL.revokeObjectURL(href),1000);
}
function init(){
  restore();$("sujet").value=state.sujet;renderParts();render();buttonStates();
  $("connecter").addEventListener("click",signIn);
  $("catalogueBouton").addEventListener("click",loadCatalog);
  $("parler").addEventListener("click",addHuman);
  $("tour").addEventListener("click",()=>void nextTour());
  $("infini").addEventListener("click",()=>void launchInfinity());
  $("arreter").addEventListener("click",stop);
  $("ajouter").addEventListener("click",()=>{
    if(state.busy)return;
    state.participants.push({nom:$("nouveauNom").value.trim()||"IA"+(state.participants.length+1),
      role:$("nouveauRole").value.trim()||"Analyse critique",modele:state.participants.at(-1)?.modele||"gpt-5.5"});
    $("nouveauNom").value="";$("nouveauRole").value="";renderParts();save();
  });
  $("nouveau").addEventListener("click",()=>{
    if(state.busy)return;
    if(!confirm("Effacer cette conversation locale ? Vous pouvez d'abord l'exporter."))return;
    state.messages=[];state.next=0;state.tours=0;state.sujet="";$("sujet").value="";render();status("Nouveau Salon prêt");
  });
  $("exporter").addEventListener("click",exportConversation);
  $("moi").addEventListener("keydown",event=>{
    if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();addHuman();}
  });
  $("sujet").addEventListener("change",()=>{state.sujet=$("sujet").value;save();});
  window.addEventListener("pagehide",()=>{
    state.auto=false;
    if(state.controller)state.controller.abort();
  });
  if(!window.puter){
    status("Bibliothèque Puter.js indisponible. Un bloqueur de script ou le réseau peut être en cause.");
  }else if(puter.auth.isSignedIn()){
    $("connexion").textContent="Session Puter existante";
    void loadCatalog();
  }else status("Connecte Puter pour utiliser des modèles distants. Le Salon public ne dépend pas de WSL.");
}
init();
