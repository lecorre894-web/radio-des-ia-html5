// Banc d'essai autonome AI Horde pour Radio des IA.
// Ce module ne lit ni ne modifie le stockage du Salon, les clés Puter ou les conversations.
const API = "https://oai.aihorde.net/v1";
const ANONYMOUS_KEY = "0000000000"; // Clé publique officielle de l'usage anonyme AI Horde.
const $ = id => document.getElementById(id);
let pending = null;
let models = [];

function show(message) { $("etatHorde").textContent = message; }
function setBusy(value) {
  $("voirModeles").disabled = value;
  $("lancerTest").disabled = value || !$("modeleHorde").value;
  $("annulerTest").disabled = !value;
}
function scoreModel(id) {
  // Heuristique purement indicative de taille, jamais un certificat de compétence.
  const matches = [...String(id).matchAll(/(?:^|[-_/ ])(\d{1,3}(?:\.\d+)?)\s*[bB](?:\b|[-_/])/g)];
  return matches.length ? Math.max(...matches.map(x=>Number(x[1]))) : 0;
}
export function normalizeModels(value) {
  const items = Array.isArray(value?.data) ? value.data : Array.isArray(value) ? value : [];
  return [...new Set(items.map(x => String(typeof x==="string"?x:x?.id||"").trim()).filter(Boolean))]
    .sort((a,b)=>scoreModel(b)-scoreModel(a)||a.localeCompare(b));
}
async function jsonResponse(url, options) {
  const response = await fetch(url, {mode:"cors", cache:"no-store",...options});
  const body = await response.text();
  let parsed;
  try { parsed = JSON.parse(body); } catch {
    throw Error("Réponse du service non JSON (HTTP "+response.status+").");
  }
  if (!response.ok) {
    const reason = parsed?.error?.message || parsed?.detail || parsed?.message;
    throw Error("HTTP "+response.status+" : "+(typeof reason==="string"?reason:JSON.stringify(reason||parsed).slice(0,320)));
  }
  return parsed;
}
function errorMessage(e) {
  if (e?.name==="AbortError") return "Test arrêté côté navigateur. Une demande déjà acceptée peut continuer sur le réseau.";
  if (e instanceof TypeError) return "Accès réseau impossible ou bloqué par CORS. Vérifier la connexion et les autorisations de l'API dans ce navigateur.";
  return String(e?.message||e);
}
async function listModels() {
  setBusy(true);
  show("Interrogation du catalogue réel d'AI Horde…");
  try {
    // Contrôle initial : aucun prompt, aucune information personnelle transmise.
    const result=await jsonResponse(API+"/models",{method:"GET"});
    models=normalizeModels(result);
    $("modeleHorde").replaceChildren();
    const first=document.createElement("option");
    first.value="";first.textContent="Sélectionner un modèle réellement disponible";first.selected=true;
    $("modeleHorde").append(first);
    for (const id of models) {
      const option=document.createElement("option");
      option.value=id;
      option.textContent=id;
      $("modeleHorde").append(option);
    }
    show(models.length+" modèle(s) retourné(s) par l'API. Sélectionne un modèle, puis lance un unique test scientifique. La taille estimée d'un modèle ne démontre pas un niveau doctoral.");
  } catch(e) {
    show("Impossible de récupérer le catalogue : "+errorMessage(e));
  } finally {setBusy(false);}
}
async function oneTest() {
  const id=$("modeleHorde").value;
  if (!models.includes(id)) {
    show("Sélectionne un modèle du catalogue réel avant le test.");
    return;
  }
  const question=$("questionHorde").value.trim();
  if (!question || question.length>1500) {
    show("Question manquante ou trop longue (maximum 1 500 caractères).");
    return;
  }
  $("reponseHorde").textContent="";
  pending=new AbortController();
  setBusy(true);
  show("Question envoyée au modèle "+id+". La file des bénévoles peut entraîner plusieurs minutes d'attente.");
  const started=performance.now();
  try {
    const payload={
      model:id,
      messages:[
        {role:"system",content:"Réponds en français avec rigueur scientifique. Distingue résultats MESURÉS, RECONSTRUITS, hypothèses CANDIDATES, ARTEFACTS et INCONNUS. N'invente pas de références ou de données mesurées. Donne un raisonnement clair avec limites et moyens de vérification."},
        {role:"user",content:question}
      ],
      temperature:0.2,max_tokens:350,stream:false
    };
    const result=await jsonResponse(API+"/chat/completions",{
      method:"POST",signal:pending.signal,
      headers:{
        "Content-Type":"application/json",
        "Authorization":"Bearer "+ANONYMOUS_KEY
      },
      body:JSON.stringify(payload)
    });
    const output=result?.choices?.[0]?.message?.content;
    if(typeof output!=="string" || !output.trim())throw Error("Aucune réponse textuelle dans la réponse de l'API.");
    $("reponseHorde").textContent=output;
    $("nomReel").textContent=String(result?.model||id);
    const elapsed=Math.round((performance.now()-started)/1000);
    show("Génération renvoyée par AI Horde en "+elapsed+" s. Modèle : "+String(result?.model||id)+". Niveau doctoral non certifié.");
  } catch(e) {
    show("Essai non conclu : "+errorMessage(e));
  } finally {
    pending=null;
    setBusy(false);
  }
}
$("voirModeles").addEventListener("click",()=>void listModels());
$("lancerTest").addEventListener("click",()=>void oneTest());
$("annulerTest").addEventListener("click",()=>{
  pending?.abort();
  show("Annulation demandée depuis le navigateur. Le serveur peut poursuivre une génération déjà acceptée.");
});
$("modeleHorde").addEventListener("change",()=>setBusy(false));
setBusy(false);
show("Prêt pour un contrôle non destructif. Aucun appel n'est effectué avant une action explicite.");
