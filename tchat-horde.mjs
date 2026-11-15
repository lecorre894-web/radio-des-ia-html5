/**
 * AI Horde adapter for Radio des IA. Additive; no Puter access, no local storage.
 * Explicit selection of a real online model and an explicit browser network request.
 */
export const HORDE_BASE = "https://oai.aihorde.net/v1";
export const HORDE_ANONYMOUS_KEY = "0000000000"; // Official public anonymous key, NOT a secret.
const MAX_HISTORY_CHARS = 3000;
const MAX_REPLY_TOKENS = 400;

export function normalizeHordeModels(payload) {
  const list = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  const seen = new Set();
  return list.flatMap(model => {
    const id = String(typeof model === "string" ? model : model?.id ?? "").trim();
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [{
      id,
      context: Number.isFinite(Number(model?.context_length)) ? Number(model.context_length) : null,
      workers: model?.x_horde?.worker_count != null && Number.isFinite(Number(model.x_horde.worker_count)) ? Number(model.x_horde.worker_count) : null
    }];
  }).sort((a,b) =>
    (b.workers ?? 0) - (a.workers ?? 0) || a.id.localeCompare(b.id, "fr")
  );
}

export function buildHordeMessages({history = [], topic = "", role = "Analyse scientifique", includeHistory = false} = {}) {
  const valid=(Array.isArray(history)?history:[])
    .filter(m=>m && (m.origin==="human" || m.origin==="ai") &&
      typeof m.texte==="string" && m.texte.trim());
  const lastHuman=[...valid].reverse().find(m=>m.origin==="human");
  // Une seule consigne brève. Aucune charte de rôle ou méthode à recopier.
  const system="Tu es un modèle communautaire d'AI Horde (non ChatGPT, Claude, Kimi ou Perplexity). "+
    "Réponds directement en français à la dernière intervention. "+
    "Si c'est seulement Bonjour ou Bonsoir, réponds simplement à la salutation. "+
    "N'invente pas de sources ou de mesures ; distingue MESURÉ et hypothèse si pertinent.";
  const lines=[];
  if(includeHistory && valid.length){
    // Consentement explicite, extraits cités, jamais des identités de modèles usurpées.
    let used=0;
    const excerpts=[];
    for(const m of valid.slice(-8).reverse()){
      if(m===lastHuman)continue;
      const line=(m.origin==="human"?"Humain":"Intervenant IA")+
        " ["+String(m.nom||"sans nom").slice(0,50)+"] : "+m.texte.slice(0,650);
      if(used+line.length>MAX_HISTORY_CHARS)break;
      excerpts.unshift(line);used+=line.length;
    }
    if(excerpts.length)lines.push("Contexte précédent cité, non prioritaire :\n"+excerpts.join("\n"));
  }
  if(lastHuman)lines.push(lastHuman.texte.slice(0,1200));
  else lines.push("Bonjour.");
  return [{role:"system",content:system},{role:"user",content:lines.join("\n\n")}];
}

async function readJSON(response) {
  const raw = await response.text();
  try { return JSON.parse(raw); } catch {
    throw Error("AI Horde a renvoyé une réponse non JSON (HTTP "+response.status+").");
  }
}

function remoteError(data, response) {
  const object = data?.error;
  const reason = typeof object === "string" ? object :
    object?.message || data?.detail || data?.message ||
    "Réponse indisponible";
  const retry = response.headers.get("retry-after");
  return Error("AI Horde HTTP "+response.status+" : "+String(reason).slice(0,330) +
    (retry ? " · nouvelle tentative possible après "+retry+" s" : "") +
    ". Aucun nouvel appel automatique.");
}

export async function listHordeModels({fetcher = fetch, signal} = {}) {
  const response = await fetcher(HORDE_BASE + "/models", {
    method:"GET",mode:"cors",cache:"no-store",signal
  });
  const data = await readJSON(response);
  if (!response.ok) throw remoteError(data,response);
  return normalizeHordeModels(data);
}

export async function chatWithHorde({model, messages, maxTokens = MAX_REPLY_TOKENS, signal, fetcher = fetch} = {}) {
  if (typeof model !== "string" || !model.trim() || !Array.isArray(messages) || !messages.length)
    throw Error("Modèle et messages valides requis.");
  const response = await fetcher(HORDE_BASE + "/chat/completions", {
    method:"POST", mode:"cors",cache:"no-store",signal,
    headers:{
      "Authorization":"Bearer "+HORDE_ANONYMOUS_KEY,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      model, messages, stream:false,
      max_tokens:Math.min(MAX_REPLY_TOKENS,Math.max(16,Number(maxTokens)||400)),
      temperature:0.2,
      horde:{include_reasoning:false}
    })
  });
  const result = await readJSON(response);
  if (!response.ok) throw remoteError(result,response);
  const content = result?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw Error("AI Horde n'a renvoyé aucune réponse textuelle.");
  return {text:content.trim(),model:String(result?.model || model)};
}
