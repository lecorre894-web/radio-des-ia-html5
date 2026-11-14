import {
  SALON_KEY, DRAFT_KEY, parseSalon, appendSalonMessage, lunarMessages, chooseLunarModel
} from "./lune-core.mjs";

const $ = id => document.getElementById(id);
let engine = null;
let modelName = "";
let busy = false;
let memorySalon = parseSalon(null);
let canSave = true;

function status(text) { $("etatLocal").textContent = text; }
function readSalon() {
  if (!canSave) return memorySalon;
  try { return parseSalon(localStorage.getItem(SALON_KEY)); }
  catch {
    canSave = false;
    status("Stockage du navigateur indisponible : échanges temporaires uniquement.");
    return memorySalon;
  }
}
function saveSalon(next) {
  memorySalon = next;
  if (!canSave) return;
  try { localStorage.setItem(SALON_KEY, JSON.stringify(next)); }
  catch {
    canSave = false;
    status("Stockage local saturé : conversation conservée en mémoire jusqu'à la fermeture.");
  }
}
function addMessage(origin, text) {
  const next = appendSalonMessage(readSalon(), {
    origin, nom:origin==="human"?"Vous":"IA lunaire locale",
    modele:origin==="ai"?modelName:undefined,
    texte:text, heure:new Date().toLocaleTimeString("fr-FR")
  });
  saveSalon(next);
  render();
}
function render() {
  const salon = readSalon();
  const host=$("filLocal");
  host.replaceChildren();
  const messages=salon.messages.slice(-30);
  for(const message of messages){
    const el=document.createElement("article");
    el.className="msg "+(message.origin==="human"?"human":"");
    const label=document.createElement("div");
    label.className="meta";
    label.textContent=String(message.nom||"Participant")+
      (message.modele?" · "+String(message.modele):"");
    const body=document.createElement("div");
    body.textContent=message.texte;
    el.append(label,body);
    host.append(el);
  }
  $("historique").textContent=messages.length?
    "Historique partagé avec le Salon principal sur cet appareil. Les 30 derniers messages sont affichés.":
    "Aucun message existant. Le Salon principal et cette page partageront les futurs échanges.";
}

function setBusy(value) {
  busy = value;
  $("charger").disabled=value || Boolean(engine);
  $("envoyerLocal").disabled=value || !engine;
  $("questionLocale").disabled=value;
}

async function loadModel() {
  if (busy || engine) return;
  setBusy(true);
  try {
    if (!navigator.gpu?.requestAdapter) throw Error(
      "WebGPU n'est pas disponible dans ce navigateur. Essaie Chrome récent sur un appareil compatible.");
    status("Vérification du GPU…");
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw Error("Aucun GPU WebGPU compatible détecté sur cet appareil.");
    status("Chargement de la bibliothèque libre WebLLM…");
    // Chargement à la demande seulement : le Salon distant reste complètement indépendant.
    const webllm = await import("https://esm.run/@mlc-ai/web-llm@0.2.88");
    const model = chooseLunarModel(
      webllm.prebuiltAppConfig?.model_list,
      [...adapter.features]
    );
    if (!model) throw Error(
      "Aucun petit modèle WebLLM 0,5 à 0,8 milliard de paramètres compatible n'est disponible.");
    modelName = model.model_id;
    $("modeleLocal").textContent=modelName;
    status("Téléchargement et initialisation de "+modelName+
      ". Cela peut prendre plusieurs minutes et consommer beaucoup de données.");
    const candidate = await webllm.CreateMLCEngine(modelName, {
      initProgressCallback: p => {
        const progress=Number(p.progress);
        status((p.text || "Initialisation du modèle…")+
          (Number.isFinite(progress) ? " ("+Math.round(progress*100)+" %)" : ""));
      }
    });
    engine = candidate;
    status("IA lunaire locale prête : aucun appel à Puter, aucun abonnement requis.");
  } catch(error) {
    modelName = "";
    $("modeleLocal").textContent="Aucun modèle chargé";
    status("Moteur local non démarré : "+String(error?.message || error)+
      " Les discussions Puter existantes ne sont pas modifiées.");
  } finally { setBusy(false); }
}

async function send() {
  if (busy || !engine) {
    status("Charge d'abord le moteur local pour parler sans abonnement.");
    return;
  }
  const text = $("questionLocale").value.trim();
  if (!text) return;
  setBusy(true);
  addMessage("human",text);
  $("questionLocale").value="";
  try { localStorage.removeItem(DRAFT_KEY); } catch {}
  status("L'IA lunaire calcule une réponse sur cet appareil…");
  try {
    const messages=lunarMessages(readSalon());
    const result=await engine.chat.completions.create({
      messages, max_tokens:300, temperature:0.45
    });
    const answer=String(result?.choices?.[0]?.message?.content || "").trim();
    if (!answer) throw Error("Réponse locale vide.");
    addMessage("ai", answer);
    status("Réponse locale enregistrée. Le prochain message poursuit le même historique.");
  } catch(error) {
    status("Génération locale interrompue : "+String(error?.message||error)+
      ". Ton message est conservé dans le Salon.");
  } finally { setBusy(false); }
}

$("charger").addEventListener("click",loadModel);
$("envoyerLocal").addEventListener("click",send);
$("questionLocale").addEventListener("input",()=>{
  try {localStorage.setItem(DRAFT_KEY,$("questionLocale").value);}catch{}
});
for(const btn of document.querySelectorAll("[data-question]")){
  btn.addEventListener("click",()=>{
    $("questionLocale").value=btn.getAttribute("data-question") || "";
    $("questionLocale").focus();
    try{localStorage.setItem(DRAFT_KEY,$("questionLocale").value);}catch{}
  });
}
memorySalon=readSalon();
try {$("questionLocale").value=localStorage.getItem(DRAFT_KEY)||"";} catch {}
render();
setBusy(false);
status("Mode sans abonnement : active le moteur pour commencer. Le premier chargement nécessite Internet.");
