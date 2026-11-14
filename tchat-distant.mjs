import {buildPrompt, responseText, cleanAnswer, qualityIssue, PERPLEXITY, addPerplexity, KIMI, addKimi} from "./tchat-core.mjs?v=kimi-k3-1";
// Le module documents est optionnel : une erreur d'import ne doit pas désactiver le Salon.

const $ = id => document.getElementById(id);
let documentManager=null;
let reactionBoard=null;
const KEY = "radio-salon-distant-v1";
const START = [
  {nom:"Cairn",role:"Épistémologie, audit critique, contradictions argumentées",modele:"gpt-5.5"},
  {nom:"Brume",role:"Mathématiques, physique et méthodologie expérimentale",modele:"claude-sonnet-4-6"},
  {nom:"Aurore",role:"Philosophie, science ouverte et nouvelles hypothèses",modele:"gemini-3.1-flash-lite"},
  {...PERPLEXITY},
  {...KIMI}
];
const state = {
  participants: structuredClone(START), messages: [], sujet:"", next:0, tours:0,
  auto:false, mode:"direct", perplexityIntroduced:true, kimiIntroduced:true, busy:false, controller:null, activeCard:null, current:null, catalog:[],
  validModels:new Set(), lastRender:0
};
function status(value){$("etat").textContent=value;}
function available(){if(!window.puter?.ai?.chat)throw Error("Puter.js indisponible. Vérifie Internet et les bloqueurs de scripts.");return window.puter;}
function save(){
  try{
    localStorage.setItem(KEY,JSON.stringify({
      participants:state.participants, messages:state.messages.slice(-150),
      sujet:state.sujet, next:state.next, tours:state.tours,
      perplexityIntroduced:state.perplexityIntroduced,
      kimiIntroduced:state.kimiIntroduced
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
    // Ajout non destructif pour les salons sauvegardés avant l'arrivée de Perplexity.
    if(!d.perplexityIntroduced)state.participants=addPerplexity(state.participants);
    if(!d.kimiIntroduced)state.participants=addKimi(state.participants);
    state.perplexityIntroduced=true;
    state.kimiIntroduced=true;
    state.messages=(Array.isArray(d.messages)?d.messages:[]).filter(x=>x&&typeof x.texte==="string");
    state.sujet=String(d.sujet||"").slice(0,4000);
    state.next=Number(d.next)||0;
    state.tours=Number(d.tours)||0;
  }catch{}
}
function buttonStates(){
  $("tour").disabled=state.busy;
  $("infini").disabled=state.busy || state.auto;
  $("debattre").disabled=state.busy || state.auto;
  $("arreter").disabled=!state.busy&&!state.auto;
  $("nouveau").disabled=state.busy;
  $("connecter").disabled=state.busy;
  $("etatMode").textContent=state.auto?(state.mode==="debate"?"∞ Débat IA ↔ IA":"∞ Discussion automatique"):state.busy?"IA en cours de réponse":"Salon prêt";
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
    modele.addEventListener("change",()=>{
      const requested=modele.value.trim()||p.modele;
      if(p.nom.trim().toLowerCase()==="perplexity" && !requested.startsWith("perplexity/")){
        status("Perplexity doit utiliser un véritable modèle de la famille perplexity/ ; modification refusée.");
        modele.value=p.modele;return;
      }
      if(p.nom.trim().toLowerCase()==="kimi" && !requested.startsWith("moonshotai/kimi-")){
        status("Kimi doit utiliser un véritable modèle Moonshot Kimi ; modification refusée.");
        modele.value=p.modele;return;
      }
      p.modele=requested;save();
    });
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
  if(m.gifId){
    const holder=document.createElement("div");
    holder.className="reactionMessage";
    card.append(holder);
    if(reactionBoard)void reactionBoard.renderMessageGif(String(m.gifId),holder);
  }
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
  let value=$("moi").value.trim();
  if(!value && documentManager?.hasAttachments() && $("pieceUtiliser")?.checked){
    value="Analyse les documents et images joints : précise les éléments vérifiables, les informations manquantes et les limites de leur interprétation.";
  }
  if(!value)return;
  if(documentManager?.isReading()){status("Lecture du document en cours : réessayer lorsque l'import est terminé.");return;}
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
    // Ne jamais substituer GPT/Claude à Perplexity en conservant son étiquette.
    const warnings=[];
    for(const speaker of state.participants){
      if(names.has(speaker.modele))continue;
      if(speaker.nom.trim().toLowerCase()==="perplexity" || speaker.modele.startsWith("perplexity/")){
        const alternative=["perplexity/sonar-pro","perplexity/sonar","perplexity/sonar-reasoning-pro"].find(id=>names.has(id));
        if(alternative)speaker.modele=alternative;
        else warnings.push("Perplexity indisponible dans ce catalogue : aucun remplacement par une autre IA.");
        continue;
      }
      if(speaker.nom.trim().toLowerCase()==="kimi" || speaker.modele.startsWith("moonshotai/kimi-")){
        const alternative=["moonshotai/kimi-k3.1-pro","moonshotai/kimi-k3.1-pro-highspeed","moonshotai/kimi-k3","moonshotai/kimi-k2.6"].find(id=>names.has(id));
        if(alternative)speaker.modele=alternative;
        else warnings.push("Kimi indisponible dans ce catalogue : aucun remplacement par une autre IA.");
        continue;
      }
      const fallback=["gpt-5.5","gpt-5.4-nano","claude-sonnet-4-6"].find(id=>names.has(id));
      if(fallback)speaker.modele=fallback;
    }
    renderParts();
    $("catalogue").textContent=state.catalog.length+" modèles distants référencés ; disponibilité, tarifs et capacités variables."+ (warnings.length?" "+warnings.join(" "):"");
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
  const currentIndex=(state.next-1+state.participants.length)%state.participants.length;
  const messages=buildPrompt({
    participants:state.participants,index:currentIndex,
    messages:state.messages,sujet:state.sujet,mode:state.mode,
    recipient:state.participants[state.next%state.participants.length]?.nom,
    round:state.tours
  });
  const current={origin:"ai",nom:participant.nom,modele:participant.modele,heure:new Date().toLocaleTimeString("fr-FR"),texte:""};
  state.messages.push(current);state.current=current;state.busy=true;
  state.controller=new AbortController();
  render();buttonStates();
  status(participant.nom+" réfléchit avec "+participant.modele+"…");
  let prepared={messages,cleanup:async()=>{}};
  try{
    // Le module externe ne touche pas au moteur de dialogue : aucun document = chemin IA d'origine.
    if($("pieceUtiliser")?.checked && !documentManager)
      throw new Error("Module documentaire non encore chargé. Les modèles restent disponibles sans document.");
    if(documentManager)prepared=await documentManager.prepare(messages);
    const opts={model:participant.modele,stream:true,signal:state.controller.signal};
    const long=$("longueur").value;
    if(long!=="auto")opts.max_tokens=Number(long);
    const stream=await window.puter.ai.chat(prepared.messages,opts);
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
    try{await prepared.cleanup();}catch{} // La suppression distante est tentée même en cas d'échec du modèle.
    state.busy=false;state.controller=null;state.current=null;state.activeCard=null;render();buttonStates();
  }
}
async function launchInfinity(mode="direct"){
  if(state.auto || state.busy)return;
  if(!window.puter?.auth?.isSignedIn()){status("Connecte Puter avant de lancer ∞.");return;}
  if(mode!=="direct" && mode!=="debate")throw Error("Mode de discussion inconnu");
  const question=mode==="debate"
    ?"Lancer le DÉBAT IA ↔ IA ? Les modèles vont se répondre, proposer des objections et des questions, même sans message humain."
    :"Lancer la discussion automatique entre IA ?";
  if(!confirm(question+"\n\nChaque tour consomme des crédits Puter. Il n'y a pas de nombre maximal programmé et le Salon s'arrête avec Arrêter, la fermeture de la page, ou une erreur. Continuer ?"))return;
  state.mode=mode;
  state.sujet=$("sujet").value.trim();
  save();
  state.auto=true;buttonStates();
  status(mode==="debate"?"Débat IA ↔ IA actif : vous pouvez écouter ou intervenir.":"Discussion IA automatique active.");
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
  // Module externe chargé à part : même si le CDN ou un format échoue, les cinq IA restent actives.
  void import("./tchat-documents.mjs?v=documents-2")
    .then(({createDocumentManager})=>{
      documentManager=createDocumentManager({getPuter:()=>window.puter,onStatus:message=>status(message)});
    })
    .catch(error=>{
      const indicator=$("pieceEtat");
      if(indicator)indicator.textContent="Analyse documentaire indisponible : "+String(error?.message||error);
      if($("pieceFichier"))$("pieceFichier").disabled=true;
      if($("pieceUtiliser"))$("pieceUtiliser").checked=false;
    });
  // Le tableau de réactions est facultatif et ne peut pas bloquer le moteur IA.
  void import("./tchat-reactions.mjs?v=reactions-1")
    .then(({createReactionBoard})=>{
      reactionBoard=createReactionBoard({
        onInsert:(value)=>{
          const field=$("moi");
          const start=field.selectionStart??field.value.length;
          const end=field.selectionEnd??start;
          field.setRangeText(String(value),start,end,"end");
          field.focus();
        },
        onSendGif:({id,name})=>{
          state.messages.push({
            origin:"human",nom:"Vous",gifId:String(id),
            texte:"[GIF animé local partagé : "+String(name).slice(0,120)+". Les pixels de ce GIF ne sont pas transmis aux modèles IA.]",
            heure:new Date().toLocaleTimeString("fr-FR")
          });
          render();
          status("GIF ajouté à votre conversation personnelle ; aucun appel IA ni crédit consommé.");
        }
      });
      if(reactionBoard)render(); // Restaurer les aperçus des messages GIF conservés dans IndexedDB.
    })
    .catch(error=>{
      const button=$("reactionToggle"),label=$("reactionStatus");
      if(button)button.disabled=true;
      if(label)label.textContent="Tableau émojis/GIF indisponible : "+String(error?.message||error);
    });
  $("connecter").addEventListener("click",signIn);
  $("catalogueBouton").addEventListener("click",loadCatalog);
  $("parler").addEventListener("click",addHuman);
  $("tour").addEventListener("click",()=>{if(!state.auto)state.mode="direct";void nextTour()});
  $("infini").addEventListener("click",()=>void launchInfinity("direct"));
  $("debattre").addEventListener("click",()=>void launchInfinity("debate"));
  $("arreter").addEventListener("click",stop);
  $("ajouter").addEventListener("click",()=>{
    if(state.busy)return;
    const name=$("nouveauNom").value.trim()||"IA"+(state.participants.length+1);
    if(["perplexity","kimi"].includes(name.toLowerCase()) && state.participants.some(p=>p.nom.toLowerCase()===name.toLowerCase())){
      status(name+" est déjà présent comme intervenant.");return;
    }
    state.participants.push({nom:name,
      role:$("nouveauRole").value.trim()||"Analyse critique",
      modele:name.toLowerCase()==="perplexity"?PERPLEXITY.modele:name.toLowerCase()==="kimi"?KIMI.modele:"gpt-5.5"});
    $("nouveauNom").value="";$("nouveauRole").value="";renderParts();save();
  });
  $("nouveau").addEventListener("click",()=>{
    if(state.busy)return;
    if(!confirm("Effacer cette conversation locale ? Vous pouvez d'abord l'exporter."))return;
    state.messages=[];state.next=0;state.tours=0;state.mode="direct";state.sujet="";$("sujet").value="";documentManager?.clear();render();status("Nouveau Salon prêt");
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
