import {buildPrompt, responseText, cleanAnswer, qualityIssue, PERPLEXITY, addPerplexity, KIMI, addKimi} from "./tchat-core.mjs?v=lineage-1";
import {updateLineageMemory,archiveLineageSession} from "./tchat-lineage.mjs?v=lineage-1";
import {boundedTokens,requestSize,formatUsageSummary} from "./tchat-budget.mjs?v=budget-1";
import {resolveParticipantModel,nextEligibleIndex,providerForSpeaker,providerMatches,catalogOptions} from "./tchat-models.mjs?v=diagnostic-1";
import {RESEARCH_MODELS,RESEARCH_ROLES,researchPrompts} from "./tchat-recherche-core.mjs?v=1";
import {listHordeModels,chatWithHorde,buildHordeMessages} from "./tchat-horde.mjs?v=1";
import {loadPuter} from "./puter-lazy.mjs?v=1";
import {POLLINATIONS_PENDING,POLLINATIONS_ACCESS,POLLINATIONS_APP,createPollinationsAuthorization,exchangePollinationsCode,listPollinationsModels,buildPollinationsMessages,chatWithPollinations} from "./tchat-pollinations.mjs?v=1";
import {sparktiatesEndpoint,sparktiatesModels,sparktiatesChat,buildSparktiatesMessages} from "./tchat-sparktiates.mjs?v=1";
// Le module documents est optionnel : une erreur d'import ne doit pas désactiver le Salon.

const $ = id => document.getElementById(id);
let documentManager=null;
let reactionBoard=null;
let researchEngine=null;
let researchLoading=false;
let hordeModels=[];
let hordeLoading=false;
let pollinationsModels=[];
let pollinationsToken="";
let pollinationsLoading=false;
let pollinationsApproved=false;
let sparktiatesModelsReady=[];
let sparktiatesLoading=false;
const KEY = "radio-salon-distant-v1";
const DRAFT_KEY = "radio-salon-brouillon-v1";
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
  validModels:new Set(), lastRender:0,
  memory:{root:"",events:[]},archives:[],includeArchives:true,
  researchIndex:0,engineChoice:"puter",researchModelChoice:"Qwen3.5-9B-q4f16_1-MLC",
  hordeModel:"",hordeIndex:0,pollinationsModel:"",pollinationsIndex:0,
  sparktiatesModel:"",sparktiatesIndex:0
};
function status(value){$("etat").textContent=value;}
function saveDraft(){
  // Le brouillon ne doit jamais dépendre du succès de la génération IA.
  try{
    const value=$("moi")?.value||"";
    if(value)localStorage.setItem(DRAFT_KEY,value);
    else localStorage.removeItem(DRAFT_KEY);
  }catch{
    status("Stockage local du brouillon indisponible : gardez une copie de votre texte.");
  }
}
function restoreDraft(){
  try{
    const saved=localStorage.getItem(DRAFT_KEY);
    if(saved!==null && $("moi"))$("moi").value=saved;
  }catch{}
}
async function available(){return await loadPuter();}
function save(){
  state.memory=updateLineageMemory(state.memory,state.messages);
  try{
    localStorage.setItem(KEY,JSON.stringify({
      participants:state.participants, messages:state.messages.slice(-150),
      sujet:state.sujet, next:state.next, tours:state.tours,
      perplexityIntroduced:state.perplexityIntroduced,
      kimiIntroduced:state.kimiIntroduced,
      memory:state.memory,archives:state.archives,includeArchives:state.includeArchives,
      researchIndex:state.researchIndex,engineChoice:state.engineChoice,
      researchModelChoice:state.researchModelChoice,
      hordeModel:state.hordeModel,hordeIndex:state.hordeIndex,
      pollinationsModel:state.pollinationsModel,pollinationsIndex:state.pollinationsIndex,
      sparktiatesModel:state.sparktiatesModel,sparktiatesIndex:state.sparktiatesIndex
    }));
  }catch{status("Stockage local saturé : exporte ta conversation pour en conserver une copie.");}
  renderLineageStatus();
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
    state.memory=updateLineageMemory(d.memory,state.messages);
    state.archives=Array.isArray(d.archives)?d.archives.slice(-8).filter(x=>x&&typeof x.root==="string"):[];
    state.includeArchives=d.includeArchives!==false;
    state.researchIndex=Math.max(0,Number(d.researchIndex)||0);
    state.engineChoice=["puter","research-local","horde","pollinations","sparktiates"].includes(d.engineChoice)?d.engineChoice:"puter";
    state.pollinationsModel=String(d.pollinationsModel||"").slice(0,220);
    state.pollinationsIndex=Math.max(0,Number(d.pollinationsIndex)||0);
    state.sparktiatesModel=String(d.sparktiatesModel||"").slice(0,160);
    state.sparktiatesIndex=Math.max(0,Number(d.sparktiatesIndex)||0);
    state.hordeModel=String(d.hordeModel||"").slice(0,200);
    state.hordeIndex=Math.max(0,Number(d.hordeIndex)||0);
    state.researchModelChoice=RESEARCH_MODELS.some(m=>m.id===d.researchModelChoice)
      ?d.researchModelChoice:RESEARCH_MODELS[0].id;
  }catch{}
}
function renderLineageStatus(){
  const panel=$("memoireResume");
  const toggle=$("memoireInterSalons");
  if(toggle)toggle.checked=state.includeArchives;
  if(panel){
    const root=String(state.memory?.root||state.sujet||"Aucune question fondatrice encore enregistrée.");
    panel.textContent="Racine du fil : "+root.slice(0,240)+
      (root.length>240?"…":"")+
      " · "+(state.memory?.events?.length||0)+" jalons locaux"+
      " · "+state.archives.length+" ancien(s) Salon(s) conservé(s).";
  }
}
function isResearchMode(){return state.engineChoice==="research-local";}
function isHordeMode(){return state.engineChoice==="horde";}
function isPollinationsMode(){return state.engineChoice==="pollinations";}
function isSparktiatesMode(){return state.engineChoice==="sparktiates";}
function sparktiatesStatus(value){
  const el=$("sparktiatesEtat");if(el)el.textContent=value;
}
function pollinationsStatus(message){
  const node=$("pollinationsEtat");
  if(node)node.textContent=message;
}
function hordeStatus(value){const node=$("hordeEtat");if(node)node.textContent=value;}
function researchStatus(value){const indicator=$("rechercheEtat");if(indicator)indicator.textContent=value;}
function buttonStates(){
  $("tour").disabled=state.busy;
  $("infini").disabled=state.busy || state.auto;
  $("debattre").disabled=state.busy || state.auto;
  $("arreter").disabled=!state.busy&&!state.auto;
  $("nouveau").disabled=state.busy;
  $("connecter").disabled=state.busy;
  $("moteurDialogue").disabled=state.busy || state.auto || researchLoading || hordeLoading || pollinationsLoading || sparktiatesLoading;
  for(const id of ["sparktiatesAdresse","sparktiatesToken","sparktiatesModele","sparktiatesActualiser","sparktiatesPartagerContexte"]){
    const el=$(id);if(el)el.disabled=state.busy || state.auto || sparktiatesLoading;
  }
  for(const id of ["pollinationsAppKey","pollinationsConnecter","pollinationsDeconnecter","pollinationsActualiser","pollinationsModele","pollinationsPartagerContexte"]){
    const el=$(id);if(el)el.disabled=state.busy || state.auto || pollinationsLoading;
  }
  $("hordeModele").disabled=state.busy || state.auto || hordeLoading;
  $("hordeActualiser").disabled=state.busy || state.auto || hordeLoading;
  $("hordePartagerContexte").disabled=state.busy || state.auto || hordeLoading;
  $("modeleRecherche").disabled=state.busy || state.auto || researchLoading || Boolean(researchEngine);
  $("chargerRecherche").disabled=state.busy || researchLoading || Boolean(researchEngine);
  $("dechargerRecherche").disabled=state.busy || researchLoading || !researchEngine;
  $("etatMode").textContent=state.auto?(state.mode==="debate"?"∞ Débat IA ↔ IA":"∞ Discussion automatique"):state.busy?"IA en cours de réponse":isResearchMode()?"Salon scientifique local":isHordeMode()?"Salon AI Horde":isPollinationsMode()?"Salon Pollinations":isSparktiatesMode()?"Salon SPARKTIATES":"Salon prêt";
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
    row.append(nom,role,modele,supprimer);
    if(state.validModels.size){
      const note=document.createElement("small");
      note.style.gridColumn="1 / -1";
      const valid=state.validModels.has(p.modele);
      note.textContent=valid?"✓ Modèle présent dans le catalogue Puter.":"⚠ Modèle absent du catalogue Puter : son tour sera ignoré sans modifier son identité.";
      row.append(note);
    }
    host.append(row);
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
  const raw=$("moi").value;
  // Ne jamais retirer les retours à la ligne : trim() sert uniquement à détecter un message vide.
  let value=raw;
  if(!raw.trim() && documentManager?.hasAttachments() && $("pieceUtiliser")?.checked){
    value="Analyse les documents et images joints : précise les éléments vérifiables, les informations manquantes et les limites de leur interprétation.";
  }
  if(!value.trim())return;
  if(documentManager?.isReading()){status("Lecture du document en cours : réessayer lorsque l'import est terminé.");return;}
  // Le message est d'abord enregistré ; le brouillon ne disparaît qu'après affichage.
  state.messages.push({origin:"human",nom:"Vous",texte:value,heure:new Date().toLocaleTimeString("fr-FR")});
  render();
  $("moi").value="";
  saveDraft();
  status("Message enregistré avec ses retours à la ligne. Réponse prioritaire au prochain tour.");
  if(!state.busy&&!state.auto)void nextTour();
}
async function signIn(){
  try{
    const p=await available();
    if(!p.auth.isSignedIn())await p.auth.signIn();
    const user=await p.auth.getUser().catch(()=>null);
    $("connexion").textContent="Connecté"+(user?.username?" : "+user.username:"");
    status("Connexion établie. Chaque utilisateur dispose d'une allocation gratuite propre ; des frais peuvent s'appliquer après épuisement.");
    await loadCatalog();
  }catch(e){status("Connexion impossible : "+String(e?.message||e));}
}
async function loadCatalog(){
  try{
    const p=await available();
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
    // Le catalogue réel de cette session fait autorité.
    const warnings=[];
    const audit=[];
    for(const speaker of state.participants){
      const result=resolveParticipantModel(speaker,state.catalog);
      if(result.selected && result.changed)speaker.modele=result.selected;
      if(!result.available){
        warnings.push(speaker.nom+" indisponible : tour ignoré, pas de faux modèle.");
      }
      audit.push(speaker.nom+" : "+(result.available?"disponible (« "+speaker.modele+" »)":"indisponible"));
    }
    renderParts();
    $("catalogue").textContent=state.catalog.length+" modèles distants référencés ; disponibilité, tarifs et capacités variables."+
      (warnings.length?" "+warnings.join(" "):" Tous les intervenants ont un modèle référencé.");
    const diag=$("diagnosticModeles");
    if(diag){
      diag.replaceChildren();
      const details=document.createElement("details"),summary=document.createElement("summary");
      summary.textContent="Diagnostic des modèles et fournisseurs (catalogue réel)";
      const report=document.createElement("pre");report.className="pieceExtrait";
      const providerInfo=["perplexity","kimi"].map(provider=>{
        const ids=catalogOptions(state.catalog,provider);
        return provider+" : "+(ids.length?ids.join(", "):"aucun identifiant reconnu");
      });
      report.textContent=audit.join("\n")+"\n\n"+providerInfo.join("\n");
      details.append(summary,report);diag.append(details);
    }
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
  if(isResearchMode())return nextResearchTurn();
  if(isHordeMode())return nextHordeTurn();
  if(isPollinationsMode())return nextPollinationsTurn();
  if(isSparktiatesMode())return nextSparktiatesTurn();
  try{
    const p=await available();
    if(!p.auth.isSignedIn()){
      status("Connecte ton compte Puter avant de parler. Cette action ne publie aucune clé.");
      state.auto=false;buttonStates();return;
    }
  }catch(e){status(String(e?.message||e));state.auto=false;return;}
  const currentIndex=nextEligibleIndex(state.participants,state.validModels,state.next);
  if(currentIndex<0){
    state.auto=false;
    status("Aucun modèle du Salon n'est disponible dans le catalogue Puter : aucun appel inutile.");
    buttonStates();return;
  }
  const participant=state.participants[currentIndex];
  const nextIndex=nextEligibleIndex(state.participants,state.validModels,currentIndex+1);
  state.next=(currentIndex+1)%state.participants.length;
  const messages=buildPrompt({
    participants:state.participants,index:currentIndex,
    messages:state.messages,sujet:state.sujet,mode:state.mode,
    recipient:state.participants[nextIndex<0?currentIndex:nextIndex]?.nom,
    round:state.tours,memory:state.memory,
    archives:state.archives,includeArchives:state.includeArchives
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
    opts.max_tokens=boundedTokens($("longueur").value);
    const size=requestSize(prepared.messages);
    if(size>18000){
      state.auto=false;
      if(!confirm("Le contexte de ce message contient "+size.toLocaleString("fr-FR")+
        " caractères. Cela peut consommer plus de crédits Puter. Envoyer quand même ?")){
        throw Error("Envoi annulé : contexte trop volumineux. Votre message reste conservé.");
      }
    }
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
async function loadResearch(){
  if(state.busy || researchLoading || researchEngine)return;
  researchLoading=true;buttonStates();
  const modelId=$("modeleRecherche").value;
  try{
    researchStatus("Vérification du GPU et du catalogue réel du modèle…");
    const {loadResearchEngine}=await import("./tchat-recherche-local.mjs?v=1");
    const result=await loadResearchEngine({
      modelId,onProgress:(message)=>researchStatus(message)
    });
    researchEngine=result;
    state.researchModelChoice=modelId;
    save();
    researchStatus("Prêt : "+modelId+". Calcul sur cet appareil sans Puter ni frais de génération par tour. Aucun doctorat garanti.");
    status("Moteur de recherche chargé. Sélectionne « Recherche locale » et utilise le Salon habituel.");
  }catch(e){
    researchStatus("Chargement impossible : "+String(e?.message||e)+
      ". Aucun remplacement automatique par une petite IA ; Puter reste disponible.");
  }finally{researchLoading=false;buttonStates();}
}
async function unloadResearch(){
  if(state.busy || researchLoading || !researchEngine)return;
  researchLoading=true;buttonStates();
  try{await researchEngine.unload();}finally{
    researchEngine=null;researchLoading=false;buttonStates();
    researchStatus("Modèle local déchargé. Les messages existants sont conservés.");
  }
}
async function nextResearchTurn(){
  if(state.busy)return;
  if(!researchEngine){
    state.auto=false;buttonStates();
    status("Mode scientifique local choisi, mais modèle non chargé. Clique d'abord sur « Charger le modèle scientifique ».");
    return;
  }
  if($("pieceUtiliser")?.checked && documentManager?.hasAttachments?.()){
    state.auto=false;buttonStates();
    status("Le moteur local ne traite pas les fichiers joints. Désactive « Inclure les textes extraits » ou repasse à Puter.");
    return;
  }
  const role=RESEARCH_ROLES[state.researchIndex%RESEARCH_ROLES.length];
  const prompts=researchPrompts({
    history:state.messages,topic:$("sujet").value||state.sujet,
    role,round:state.researchIndex
  });
  const current={
    origin:"ai",nom:"Conseil local · "+role.nom,
    modele:researchEngine.modelId,
    heure:new Date().toLocaleTimeString("fr-FR"),texte:""
  };
  state.messages.push(current);state.current=current;state.busy=true;render();buttonStates();
  status("Recherche locale sur "+researchEngine.modelId+" · rôle "+role.nom+"…");
  try{
    const answer=await researchEngine.complete(prompts,boundedTokens($("longueur").value));
    const normalized=cleanAnswer(answer,state.participants);
    const issue=qualityIssue(normalized,state.messages.filter(m=>m!==current));
    if(issue)throw Error("Réponse rejetée : "+issue);
    current.texte=normalized;
    state.researchIndex++;
    state.tours++;
    status(role.nom+" : tour local n°"+state.tours+". Aucun appel Puter.");
    speech(role.nom,current.texte);
  }catch(e){
    state.messages=state.messages.filter(m=>m!==current);
    state.auto=false;
    status("Recherche locale interrompue : "+String(e?.message||e)+". Les messages précédents sont conservés.");
  }finally{
    state.busy=false;state.current=null;state.activeCard=null;render();buttonStates();
  }
}
async function refreshHordeModels(){
  if(state.busy || state.auto || hordeLoading)return;
  hordeLoading=true;buttonStates();
  hordeStatus("Interrogation du catalogue des travailleurs AI Horde en ligne…");
  try{
    const available=await listHordeModels();
    hordeModels=available;
    const node=$("hordeModele");
    node.replaceChildren();
    const placeholder=document.createElement("option");
    placeholder.value="";placeholder.textContent="Choisissez un modèle réellement disponible";
    node.append(placeholder);
    for(const item of available){
      const option=document.createElement("option");
      option.value=item.id;
      option.textContent=item.id+(item.workers!==null?" · "+item.workers+" travailleurs":"")+
        (item.context!==null?" · contexte "+item.context:"");
      node.append(option);
    }
    if(available.some(m=>m.id===state.hordeModel))node.value=state.hordeModel;
    else {
      node.value="";
      state.hordeModel="";
    }
    save();
    hordeStatus(available.length
      ?available.length+" modèles communautaires annoncés en ligne. Choisis-en un. Leur qualité scientifique et disponibilité ne sont pas garanties."
      :"Aucun modèle en ligne. AI Horde ne peut pas répondre actuellement ; Puter et le mode local restent disponibles.");
  }catch(e){
    hordeModels=[];
    $("hordeModele").replaceChildren();
    const option=document.createElement("option");option.value="";option.textContent="Catalogue indisponible";$("hordeModele").append(option);
    state.hordeModel="";
    hordeStatus("Catalogue AI Horde indisponible : "+String(e?.message||e)+
      ". Si le navigateur bloque CORS, aucun appel de génération n'est lancé. Les autres moteurs sont préservés.");
  }finally{hordeLoading=false;buttonStates();}
}
async function nextHordeTurn(){
  if(state.busy)return;
  if(hordeLoading){state.auto=false;status("Actualisation des modèles AI Horde en cours.");buttonStates();return;}
  const model=state.hordeModel;
  if(!model || !hordeModels.some(m=>m.id===model)){
    state.auto=false;status("Sélectionne d'abord un modèle du catalogue AI Horde actualisé.");buttonStates();return;
  }
  if($("pieceUtiliser")?.checked && documentManager?.hasAttachments?.()){
    state.auto=false;status("AI Horde ne reçoit pas les pièces jointes. Désactive l'inclusion des documents pour continuer.");buttonStates();return;
  }
  const shareHistory=Boolean($("hordePartagerContexte")?.checked);
  const role=RESEARCH_ROLES[state.hordeIndex%RESEARCH_ROLES.length];
  const prompt=buildHordeMessages({
    history:state.messages,topic:$("sujet").value||state.sujet,
    role:role.nom+" — "+role.specialite,includeHistory:shareHistory
  });
  const current={origin:"ai",nom:"AI Horde · "+role.nom,modele:model,
    heure:new Date().toLocaleTimeString("fr-FR"),texte:""};
  state.messages.push(current);
  state.current=current;
  state.busy=true;
  state.controller=new AbortController();
  render();buttonStates();
  status("AI Horde · "+model+" : attente d'un travailleur bénévole. Tu peux arrêter.");
  try{
    const answer=await chatWithHorde({
      model,messages:prompt,maxTokens:boundedTokens($("longueur").value),
      signal:state.controller.signal
    });
    const normalized=cleanAnswer(answer.text,state.participants);
    const issue=qualityIssue(normalized,state.messages.filter(m=>m!==current));
    if(issue)throw Error("Réponse rejetée : "+issue);
    current.texte=normalized;
    current.modele=answer.model;
    state.hordeIndex++;
    state.tours++;
    status("AI Horde : réponse réelle de "+answer.model+
      " enregistrée. Tour n°"+state.tours+". Aucun crédit Puter utilisé.");
    speech(current.nom,current.texte);
  }catch(e){
    state.messages=state.messages.filter(m=>m!==current);
    state.auto=false;
    const reason=e?.name==="AbortError"
      ?"demande arrêtée dans le navigateur ; le réseau peut poursuivre une requête déjà lancée"
      :String(e?.message||e);
    status("AI Horde : "+reason+". Message humain et historique préservés. Aucun nouvel essai automatique.");
  }finally{
    state.busy=false;state.controller=null;state.current=null;state.activeCard=null;
    render();buttonStates();
  }
}
function getPollinationsStoredToken(){
  try {return String(sessionStorage.getItem(POLLINATIONS_ACCESS)||"");}
  catch{return "";}
}
async function connectPollinations(){
  if(state.busy || pollinationsLoading)return;
  const clientId=$("pollinationsAppKey").value.trim();
  pollinationsLoading=true;buttonStates();
  try{
    const prepared=await createPollinationsAuthorization({clientId});
    sessionStorage.setItem(POLLINATIONS_PENDING,JSON.stringify(prepared.pending));
    sessionStorage.setItem(POLLINATIONS_APP,clientId); // Identifiant PUBLIC, jamais le secret sk_.
    pollinationsStatus("Ouverture de l'autorisation Pollinations. Le fournisseur demande un accord explicite et un plafond de Pollen.");
    window.location.assign(prepared.url);
  }catch(e){
    pollinationsStatus("Connexion impossible : "+String(e?.message||e)+
      ". Crée une App Key pk_ et déclare exactement l'URL de retour indiquée.");
  }finally{pollinationsLoading=false;buttonStates();}
}
async function finishPollinationsCallback(){
  // Ne jamais intercepter la connexion d'un autre fournisseur : il faut un PKCE lancé ici.
  let hasPending=false;
  try{hasPending=Boolean(sessionStorage.getItem(POLLINATIONS_PENDING));}catch{}
  if(!hasPending)return;
  const params=new URLSearchParams(window.location.search||"");
  const code=params.get("code");
  const stateKey=params.get("state");
  const authError=params.get("error");
  if(!code && !authError)return;
  // Effacer immédiatement le code de l'URL avant tout autre travail.
  try{history.replaceState(null,"",window.location.pathname+window.location.hash);}catch{}
  if(authError){
    pollinationsStatus("Autorisation Pollinations refusée ou annulée : "+authError+". Aucun débit par la Radio.");
    try{sessionStorage.removeItem(POLLINATIONS_PENDING);}catch{}
    return;
  }
  pollinationsLoading=true;buttonStates();
  try{
    const pending=JSON.parse(sessionStorage.getItem(POLLINATIONS_PENDING)||"null");
    const token=await exchangePollinationsCode({code,state:stateKey,pending});
    pollinationsToken=token;
    sessionStorage.setItem(POLLINATIONS_ACCESS,token);
    state.engineChoice="pollinations";
    $("moteurDialogue").value="pollinations";
    $("pollinationsControls").hidden=false;
    $("hordeControls").hidden=true;
    save();
    pollinationsStatus("Autorisation obtenue pour cette session. Le plafond Pollen choisi sur le site fournisseur reste applicable.");
    status("Pollinations connecté. Actualise ses modèles, puis sélectionne un modèle.");
  }catch(e){
    pollinationsStatus("Retour Pollinations non exploitable : "+String(e?.message||e)+
      ". Utilise Chrome dans le même onglet pour conserver la preuve PKCE.");
  }finally{
    try{sessionStorage.removeItem(POLLINATIONS_PENDING);}catch{}
    pollinationsLoading=false;buttonStates();
  }
}
function disconnectPollinations(){
  pollinationsToken="";
  pollinationsApproved=false;
  try{
    sessionStorage.removeItem(POLLINATIONS_ACCESS);
    sessionStorage.removeItem(POLLINATIONS_APP);
    sessionStorage.removeItem(POLLINATIONS_PENDING);
  }catch{}
  $("pollinationsAppKey").value="";
  pollinationsStatus("Session de cette Radio déconnectée. Pour révoquer un jeton déjà délivré, utilise les clés de ton compte Pollinations.");
}
async function refreshPollinationsModels(){
  if(state.busy||state.auto||pollinationsLoading)return;
  pollinationsLoading=true;buttonStates();
  pollinationsStatus("Lecture du catalogue officiel des modèles texte Pollinations (sans paiement)…");
  try{
    const catalog=await listPollinationsModels();
    pollinationsModels=catalog;
    const select=$("pollinationsModele");
    select.replaceChildren();
    const placeholder=document.createElement("option");
    placeholder.value="";placeholder.textContent="Choisis un modèle du catalogue officiel";
    select.append(placeholder);
    for(const item of catalog){
      const option=document.createElement("option");
      option.value=item.id;
      option.textContent=item.title+(item.title!==item.id?" — "+item.id:"")+
        (item.publisher?" · "+item.publisher:"");
      select.append(option);
    }
    if(catalog.some(m=>m.id===state.pollinationsModel))select.value=state.pollinationsModel;
    else{state.pollinationsModel="";select.value="";}
    save();
    pollinationsStatus(catalog.length+" modèles texte répertoriés. Sélectionne un modèle. La liste est gratuite ; chaque réponse peut consommer du Pollen.");
  }catch(e){
    pollinationsModels=[];
    $("pollinationsModele").replaceChildren();
    state.pollinationsModel="";
    pollinationsStatus("Catalogue Pollinations inaccessible : "+String(e?.message||e)+". Les autres moteurs restent utilisables.");
  }finally{pollinationsLoading=false;buttonStates();}
}
async function nextPollinationsTurn(){
  if(state.busy)return;
  if(pollinationsLoading){
    state.auto=false;buttonStates();status("Pollinations est en cours de connexion ou d'actualisation.");return;
  }
  if(!pollinationsToken)pollinationsToken=getPollinationsStoredToken();
  if(!/^sk_[A-Za-z0-9_-]{4,}$/.test(pollinationsToken)){
    state.auto=false;buttonStates();
    status("Pollinations : connexion avec autorisation requise, sans copier ta clé secrète dans le site.");return;
  }
  const model=state.pollinationsModel;
  if(!model||!pollinationsModels.some(m=>m.id===model)){
    state.auto=false;buttonStates();
    status("Sélectionne un modèle du catalogue Pollinations actualisé.");return;
  }
  if($("pieceUtiliser")?.checked && documentManager?.hasAttachments?.()){
    state.auto=false;buttonStates();
    status("Pollinations : le moteur texte n'envoie pas les pièces jointes. Désactive leur inclusion.");return;
  }
  if(!state.auto && !pollinationsApproved){
    if(!confirm("Envoyer une question au modèle "+model+" via Pollinations ? Cela peut consommer des crédits Pollen de ton compte, dans la limite autorisée auprès du fournisseur. Aucun crédit Puter."))return;
    pollinationsApproved=true;
  }
  const role=RESEARCH_ROLES[state.pollinationsIndex%RESEARCH_ROLES.length];
  const messages=buildPollinationsMessages({
    history:state.messages,topic:$("sujet").value||state.sujet,
    role:role.nom+" — "+role.specialite,
    includeHistory:Boolean($("pollinationsPartagerContexte").checked)
  });
  const current={origin:"ai",nom:"Pollinations · "+role.nom,modele:model,
    heure:new Date().toLocaleTimeString("fr-FR"),texte:""};
  state.messages.push(current);state.current=current;state.busy=true;
  state.controller=new AbortController();render();buttonStates();
  status("Pollinations : interrogation du modèle "+model+" (crédits Pollen potentiellement utilisés)…");
  try{
    const output=await chatWithPollinations({
      model,messages,token:pollinationsToken,
      maxTokens:boundedTokens($("longueur").value),
      signal:state.controller.signal
    });
    const normalized=cleanAnswer(output.text,state.participants);
    const issue=qualityIssue(normalized,state.messages.filter(m=>m!==current));
    if(issue)throw Error("Réponse rejetée : "+issue);
    current.texte=normalized;current.modele=output.model;
    state.pollinationsIndex++;state.tours++;
    status("Pollinations : réponse de "+output.model+" enregistrée. Ce tour peut avoir dépensé du Pollen.");
    speech(current.nom,current.texte);
  }catch(e){
    state.messages=state.messages.filter(m=>m!==current);state.auto=false;
    status("Pollinations : "+String(e?.name==="AbortError"?"requête interrompue côté navigateur":e?.message||e)+
      ". Aucune relance automatique ; la facturation d'une demande déjà acceptée dépend du fournisseur.");
  }finally{
    state.busy=false;state.current=null;state.activeCard=null;state.controller=null;render();buttonStates();
  }
}
async function refreshSparktiatesModels(){
  if(state.busy || state.auto || sparktiatesLoading)return;
  sparktiatesLoading=true;buttonStates();
  sparktiatesStatus("Vérification de la passerelle SPARKTIATES et de ses modèles Ollama…");
  try{
    const endpoint=sparktiatesEndpoint($("sparktiatesAdresse").value);
    const token=$("sparktiatesToken").value.trim();
    const result=await sparktiatesModels({endpoint,token});
    sparktiatesModelsReady=result;
    const select=$("sparktiatesModele");
    select.replaceChildren();
    const empty=document.createElement("option");
    empty.value="";empty.textContent="Choisir un modèle local réellement installé";
    select.append(empty);
    for(const model of result){
      const option=document.createElement("option");
      option.value=model.id;option.textContent=model.id;
      select.append(option);
    }
    if(result.some(x=>x.id===state.sparktiatesModel))select.value=state.sparktiatesModel;
    else{select.value="";state.sparktiatesModel="";}
    save();
    sparktiatesStatus(result.length
      ?result.length+" modèle(s) Ollama disponibles sur ce serveur. Sélectionne le modèle à utiliser. Tours sans plafond logiciel."
      :"SPARKTIATES répond, mais aucun modèle Ollama n'est installé. Aucun faux modèle ne sera proposé.");
  }catch(e){
    sparktiatesModelsReady=[];
    state.sparktiatesModel="";
    const select=$("sparktiatesModele");select.replaceChildren();
    const empty=document.createElement("option");
    empty.value="";empty.textContent="Serveur non vérifié";select.append(empty);
    sparktiatesStatus("SPARKTIATES indisponible : "+String(e?.message||e)+
      ". Sur téléphone, 127.0.0.1 n'est pas le PC ; il faut un point d'accès HTTPS sécurisé. Aucun tour lancé.");
  }finally{sparktiatesLoading=false;buttonStates();}
}
async function nextSparktiatesTurn(){
  if(state.busy)return;
  const model=state.sparktiatesModel;
  if(sparktiatesLoading || !model || !sparktiatesModelsReady.some(x=>x.id===model)){
    state.auto=false;buttonStates();
    status("SPARKTIATES : vérifie la connexion et choisis un modèle Ollama installé avant de discuter.");return;
  }
  if($("pieceUtiliser")?.checked && documentManager?.hasAttachments?.()){
    state.auto=false;buttonStates();
    status("SPARKTIATES n'analyse pas les pièces jointes dans ce mode texte ; désactive leur inclusion.");return;
  }
  const endpoint=$("sparktiatesAdresse").value.trim();
  const token=$("sparktiatesToken").value.trim();
  const role=RESEARCH_ROLES[state.sparktiatesIndex%RESEARCH_ROLES.length];
  const messages=buildSparktiatesMessages({
    history:state.messages,topic:$("sujet").value||state.sujet,
    role:role.nom+" — "+role.specialite,
    shareHistory:Boolean($("sparktiatesPartagerContexte").checked)
  });
  const current={origin:"ai",nom:"SPARKTIATES · "+role.nom,modele:model,
    heure:new Date().toLocaleTimeString("fr-FR"),texte:""};
  state.messages.push(current);state.current=current;state.busy=true;
  state.controller=new AbortController();
  render();buttonStates();
  status("SPARKTIATES : calcul réel dans Ollama (« "+model+" »). Sans crédits Pollinations ou Puter.");
  try{
    const response=await sparktiatesChat({
      endpoint,token,model,messages,
      maxTokens:boundedTokens($("longueur").value),signal:state.controller.signal
    });
    const normalized=cleanAnswer(response.text,state.participants);
    const issue=qualityIssue(normalized,state.messages.filter(m=>m!==current));
    if(issue)throw Error("Réponse rejetée : "+issue);
    current.texte=normalized;current.modele=response.model;
    state.sparktiatesIndex++;state.tours++;
    status("SPARKTIATES : réponse de "+response.model+" — tour "+state.tours+
      ". Le prochain tour n'est pas plafonné par le logiciel.");
    speech(current.nom,current.texte);
  }catch(e){
    state.messages=state.messages.filter(m=>m!==current);
    state.auto=false;
    status("SPARKTIATES : "+String(e?.name==="AbortError"?"requête interrompue":e?.message||e)+
      ". Aucun réessai automatique ; les messages sont conservés.");
  }finally{
    state.busy=false;state.current=null;state.activeCard=null;state.controller=null;
    render();buttonStates();
  }
}
async function launchInfinity(mode="direct"){
  if(state.auto || state.busy)return;
  if(researchLoading || hordeLoading || pollinationsLoading || sparktiatesLoading){status("Un catalogue ou moteur est en cours de chargement.");return;}
  if(isResearchMode()){
    if(!researchEngine){status("Charge le modèle scientifique local avant de lancer un débat.");return;}
    if(!confirm("Lancer les tours scientifiques locaux ? Un unique modèle réel animera différents rôles méthodologiques : cela ne constitue pas une validation indépendante. Les calculs utilisent le GPU tant que l'onglet reste ouvert ; aucune facturation Puter."))return;
  }else if(isSparktiatesMode()){
    if(!state.sparktiatesModel || !sparktiatesModelsReady.some(x=>x.id===state.sparktiatesModel)){
      status("SPARKTIATES : vérifie le serveur et son modèle Ollama avant de lancer le débat.");return;
    }
    if(!$("sparktiatesPartagerContexte").checked){
      status("Pour un débat continu, coche d'abord le partage des extraits récents avec ton propre serveur.");return;
    }
    if(!confirm("Lancer les tours scientifiques SPARKTIATES sans plafond programmé ? Ton PC doit rester allumé, et chaque tour consommera du calcul et de l'énergie. Un seul modèle Ollama assurera plusieurs rôles, sans garantie de niveau doctorat. Arrêter interrompt la boucle."))return;
  }else if(isPollinationsMode()){
    if(!pollinationsToken)pollinationsToken=getPollinationsStoredToken();
    if(!pollinationsToken || !state.pollinationsModel || !pollinationsModels.some(m=>m.id===state.pollinationsModel)){
      status("Connecte Pollinations et sélectionne un modèle réel avant de lancer le débat.");return;
    }
    if(!$("pollinationsPartagerContexte").checked){
      status("Pour le débat Pollinations, autorise d'abord explicitement le partage des extraits du Salon.");return;
    }
    if(!confirm("Démarrer jusqu'à 3 tours Pollinations automatiques ? Chaque réponse peut consommer des crédits Pollen de ton compte. Le nombre de tours est limité pour protéger ton budget. Continuer ?"))return;
  }else if(isHordeMode()){
    if(!state.hordeModel || !hordeModels.some(m=>m.id===state.hordeModel)){
      status("Actualise les modèles AI Horde et sélectionne un modèle en ligne.");return;
    }
    if(!$("hordePartagerContexte").checked){
      status("Pour un débat AI Horde cohérent, autorise explicitement l'envoi des extraits récents du Salon. Sinon, utilise un tour manuel.");return;
    }
    if(!confirm("Activer le débat AI Horde ? Les extraits récents des échanges seront transmis au réseau de travailleurs bénévoles à chaque tour. Les rôles scientifiques utilisent le même modèle sélectionné, pas des IA indépendantes. La file et les délais sont variables. Continuer ?"))return;
  }else{
    if(!window.puter?.auth?.isSignedIn()){status("Connecte Puter avant de lancer ∞.");return;}
    const question=mode==="debate"
      ?"Lancer le DÉBAT IA ↔ IA ? Les modèles vont se répondre, proposer des objections et des questions, même sans message humain."
      :"Lancer la discussion automatique entre IA ?";
    if(!confirm(question+"\n\nChaque tour consomme des crédits Puter. Il n'y a pas de nombre maximal programmé et le Salon s'arrête avec Arrêter, la fermeture de la page, ou une erreur. Continuer ?"))return;
  }
  if(mode!=="direct" && mode!=="debate")throw Error("Mode de discussion inconnu");
  state.mode=mode;
  state.sujet=$("sujet").value.trim();
  save();
  state.auto=true;buttonStates();
  status(mode==="debate"?"Débat IA ↔ IA actif : vous pouvez écouter ou intervenir.":"Discussion IA automatique active.");
  let pollinationsAutomaticTurns=0;
  while(state.auto){
    if(isPollinationsMode()&&pollinationsAutomaticTurns>=3){
      state.auto=false;
      status("Pollinations : pause de sécurité après 3 tours. Relance manuellement pour contrôler la consommation de Pollen.");
      break;
    }
    await nextTour();
    if(isPollinationsMode())pollinationsAutomaticTurns++;
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
  if(isResearchMode())researchEngine?.interrupt();
  if("speechSynthesis" in window)speechSynthesis.cancel();
  status(isResearchMode()
    ?"Arrêt du débat local demandé. Le calcul GPU peut encore se terminer."
    :isHordeMode()?"AI Horde : arrêt demandé. Une requête acceptée peut se poursuivre chez le travailleur."
    :isPollinationsMode()?"Pollinations : arrêt demandé. Une requête déjà acceptée peut avoir utilisé du Pollen."
    :isSparktiatesMode()?"SPARKTIATES : arrêt demandé. Le modèle Ollama pourra achever le calcul en cours."
    :"Arrêt demandé. Une génération déjà envoyée au fournisseur peut rester comptabilisée.");
  buttonStates();
}
function exportConversation(){
  const data={export_date:new Date().toISOString(),participants:state.participants,
    messages:state.messages,continuity:{memory:state.memory,archives:state.archives,
      includeArchives:state.includeArchives}};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const href=URL.createObjectURL(blob);const a=document.createElement("a");
  a.href=href;a.download="radio-des-ia-conversation.json";a.click();
  setTimeout(()=>URL.revokeObjectURL(href),1000);
}
function init(){
  restore();
  const selection=$("modeleRecherche");
  for(const model of RESEARCH_MODELS){
    const option=document.createElement("option");
    option.value=model.id;
    option.textContent=model.name+" · environ "+(model.vramMB/1024).toFixed(1)+" Gio VRAM";
    selection.append(option);
  }
  selection.value=state.researchModelChoice;
  $("moteurDialogue").value=state.engineChoice;
  $("hordeControls").hidden=!isHordeMode();
  $("pollinationsControls").hidden=!isPollinationsMode();
  $("sparktiatesControls").hidden=!isSparktiatesMode();
  $("pollinationsPartagerContexte").checked=false; // Ne jamais conserver le consentement entre sessions.
  $("sparktiatesPartagerContexte").checked=false;
  $("sparktiatesActualiser").addEventListener("click",()=>void refreshSparktiatesModels());
  $("sparktiatesModele").addEventListener("change",()=>{
    const chosen=$("sparktiatesModele").value;
    state.sparktiatesModel=sparktiatesModelsReady.some(x=>x.id===chosen)?chosen:"";
    save();
    sparktiatesStatus(state.sparktiatesModel
      ?"Modèle local choisi : "+state.sparktiatesModel+". Les tours seront exécutés sur le serveur réellement connecté."
      :"Choisis un modèle installé.");
  });
  $("sparktiatesAdresse").addEventListener("input",()=>{
    sparktiatesModelsReady=[];state.sparktiatesModel="";
    $("sparktiatesModele").replaceChildren();
    sparktiatesStatus("Adresse modifiée : revérifie le serveur avant d'envoyer.");
  });
  $("sparktiatesToken").addEventListener("input",()=>{
    sparktiatesModelsReady=[];state.sparktiatesModel="";
    $("sparktiatesModele").replaceChildren();
    sparktiatesStatus("Jeton modifié : revérifie le serveur avant d'envoyer.");
  });
  try{
    $("pollinationsAppKey").value=sessionStorage.getItem(POLLINATIONS_APP)||"";
    pollinationsToken=getPollinationsStoredToken();
  }catch{}
  $("pollinationsConnecter").addEventListener("click",()=>void connectPollinations());
  $("pollinationsDeconnecter").addEventListener("click",disconnectPollinations);
  $("pollinationsActualiser").addEventListener("click",()=>void refreshPollinationsModels());
  $("pollinationsModele").addEventListener("change",()=>{
    const selected=$("pollinationsModele").value;
    state.pollinationsModel=pollinationsModels.some(m=>m.id===selected)?selected:"";
    pollinationsApproved=false;save();
    pollinationsStatus(state.pollinationsModel?"Modèle sélectionné : "+state.pollinationsModel+
      ". Les réponses peuvent consommer du Pollen.":"Choisis un modèle réel de la liste.");
  });
  $("pollinationsPartagerContexte").addEventListener("change",()=>{
    pollinationsStatus($("pollinationsPartagerContexte").checked
      ?"Partage des extraits anciens autorisé pour Pollinations."
      :"Seuls le message actuel et le sujet sont envoyés à Pollinations.");
  });
  // L'échange OAuth reste facultatif et n'affecte pas les autres moteurs.
  void finishPollinationsCallback();
  $("hordePartagerContexte").checked=false; // Consentement à renouveler pour chaque ouverture.
  $("hordeActualiser").addEventListener("click",()=>void refreshHordeModels());
  $("hordeModele").addEventListener("change",()=>{
    const selected=$("hordeModele").value;
    state.hordeModel=hordeModels.some(m=>m.id===selected)?selected:"";
    save();
    hordeStatus(state.hordeModel
      ?"Modèle choisi : "+state.hordeModel+". Les requêtes sont envoyées seulement quand tu demandes une réponse."
      :"Sélectionne un modèle annoncé par AI Horde.");
  });
  $("hordePartagerContexte").addEventListener("change",()=>{
    hordeStatus($("hordePartagerContexte").checked
      ?"Partage des extraits récents autorisé : ils pourront être traités par des travailleurs bénévoles."
      :"Partage des anciens messages désactivé ; seul le nouveau message et le sujet seront transmis.");
  });
  $("moteurDialogue").addEventListener("change",()=>{
    const requested=$("moteurDialogue").value;
    state.engineChoice=["puter","research-local","horde","pollinations","sparktiates"].includes(requested)?requested:"puter";
    $("sparktiatesControls").hidden=!isSparktiatesMode();
    $("pollinationsControls").hidden=!isPollinationsMode();
    $("hordeControls").hidden=!isHordeMode();
    save();buttonStates();
    status(isResearchMode()
      ?"Moteur scientifique local sélectionné : charge un modèle puis utilise les commandes habituelles."
      :isHordeMode()
        ?"AI Horde choisi : actualise les modèles disponibles et sélectionne un modèle réel. Les anciens échanges ne sont pas envoyés sans ton accord."
      :isPollinationsMode()
        ?"Pollinations choisi : connecte-toi via son autorisation sécurisée. Les requêtes peuvent consommer du Pollen."
      :isSparktiatesMode()
        ?"SPARKTIATES choisi : indique une vraie passerelle Ollama accessible et son jeton ; aucun abonnement par tour."
        :"Moteur Puter restauré ; aucun modèle distant n'a été supprimé.");
  });
  selection.addEventListener("change",()=>{
    if(researchEngine){selection.value=researchEngine.modelId;return;}
    state.researchModelChoice=selection.value;save();
  });
  $("chargerRecherche").addEventListener("click",()=>void loadResearch());
  $("dechargerRecherche").addEventListener("click",()=>void unloadResearch());
  $("sujet").value=state.sujet;restoreDraft();renderParts();render();buttonStates();
  if(isResearchMode())researchStatus("Mode de recherche sélectionné. Recharge le modèle sur cet appareil pour poursuivre sans Puter.");
  if(isHordeMode())hordeStatus("Mode AI Horde sélectionné. Actualise le catalogue avant de continuer. Anciens messages non partagés par défaut.");
  if(isSparktiatesMode())sparktiatesStatus("Mode SPARKTIATES sélectionné, serveur non encore vérifié : renseigne l'adresse et le jeton.");
  if(isPollinationsMode())pollinationsStatus(pollinationsToken
    ?"Session Pollinations disponible : actualise les modèles et choisis-en un."
    :"Crée une App Key pk_ puis autorise la connexion. Pollinations peut dépenser du Pollen.");
  $("quotaVoir")?.addEventListener("click",()=>void(async()=>{
    const button=$("quotaVoir"),node=$("quotaEtat");
    if(!node||!button)return;
    let puter;
    try{puter=await available();}
    catch(e){node.textContent="Chargement Puter impossible : "+String(e?.message||e);return;}
    if(!puter?.auth?.isSignedIn?.()||typeof puter.auth.getMonthlyUsage!=="function"){
      node.textContent="Connectez-vous à Puter pour consulter l’usage de cette application.";return;
    }
    button.disabled=true;node.textContent="Lecture du quota Puter, sans requête IA…";
    try{
      const data=await puter.auth.getMonthlyUsage();
      node.textContent="Données de l’application Radio des IA, selon Puter : "+
        formatUsageSummary(data)+
        " Pour l’usage global du compte, consultez le tableau de bord Puter.";
    }catch(e){node.textContent="Quota indisponible : "+String(e?.message||e);}
    finally{button.disabled=false;}
  })());
  $("memoireInterSalons")?.addEventListener("change",()=>{
    state.includeArchives=$("memoireInterSalons").checked;save();
    status(state.includeArchives?"Mémoire entre Salons activée.":"Mémoire entre Salons désactivée.");
  });
  $("memoireEffacer")?.addEventListener("click",()=>{
    if(!state.archives.length)return;
    if(!confirm("Effacer les archives généalogiques des anciens Salons sur cet appareil ? Le Salon actuel reste intact."))return;
    state.archives=[];save();status("Archives anciennes supprimées. Conversation actuelle conservée.");
  });
  // Module externe chargé à part : même si le CDN ou un format échoue, les cinq IA restent actives.
  void import("./tchat-documents.mjs?v=document-audit-1")
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
  void import("./tchat-reactions.mjs?v=reactions-2")
    .then(({createReactionBoard})=>{
      reactionBoard=createReactionBoard({
        onInsert:(value)=>{
          const field=$("moi");
          const start=field.selectionStart??field.value.length;
          const end=field.selectionEnd??start;
          field.setRangeText(String(value),start,end,"end");
          saveDraft();
          field.focus();
        },
        onSendGif:({id,name})=>{
          state.messages.push({
            origin:"human",nom:"Vous",gifId:String(id),
            texte:"🎞️ GIF animé partagé. Aperçu local uniquement : les images ne sont pas visibles des modèles IA.",
            heure:new Date().toLocaleTimeString("fr-FR")
          });
          render();
          $("fil").lastElementChild?.scrollIntoView({behavior:"smooth",block:"nearest"});
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
  $("moi").addEventListener("input",saveDraft);
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
    state.archives=archiveLineageSession(state.archives,state.memory,state.sujet);
    state.memory={root:"",events:[]};
    state.messages=[];state.next=0;state.tours=0;state.mode="direct";state.sujet="";$("sujet").value="";documentManager?.clear();render();
    status("Nouveau Salon prêt. Le fil précédent est archivé localement ; vous pouvez désactiver sa référence.");
  });
  $("exporter").addEventListener("click",exportConversation);
  // Aucun gestionnaire de touche Entrée : le navigateur insère naturellement une nouvelle ligne.
  // Seul le bouton Envoyer déclenche addHuman().
  $("sujet").addEventListener("change",()=>{state.sujet=$("sujet").value;save();});
  window.addEventListener("pagehide",()=>{
    saveDraft();
    state.auto=false;
    if(state.controller)state.controller.abort();
    researchEngine?.interrupt();
  });
  if(!window.puter){
    status(isResearchMode()
      ?"Mode local disponible : charge le modèle scientifique. Puter n'est pas requis."
      :isHordeMode()?"AI Horde est disponible sans Puter : actualise son catalogue."
      :isPollinationsMode()?"Pollinations est disponible indépendamment de Puter : autorise sa connexion."
      :isSparktiatesMode()?"SPARKTIATES : vérifie ton serveur Ollama, sans aucun crédit externe."
      :"Mode mobile allégé : Puter sera chargé uniquement si tu cliques sur « Se connecter à Puter ». AI Horde fonctionne sans lui.");
  }else if(puter.auth.isSignedIn()){
    $("connexion").textContent="Session Puter existante";
    void loadCatalog();
  }else status(isResearchMode()
    ?"Mode de recherche local sélectionné : charge un modèle scientifique pour parler sans Puter."
    :isHordeMode()?"AI Horde : actualise le catalogue et choisis un modèle pour commencer."
    :isPollinationsMode()?"Pollinations : connecte-toi et sélectionne un modèle pour commencer."
    :isSparktiatesMode()?"SPARKTIATES : saisis l'adresse de ton serveur personnel et sélectionne un modèle Ollama."
    :"Connecte Puter pour utiliser des modèles distants. Le Salon public ne dépend pas de WSL.");
}
init();
