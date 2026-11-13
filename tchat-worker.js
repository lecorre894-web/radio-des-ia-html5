import { pipeline, TextStreamer } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0";

const MODELS = {
  leger: "onnx-community/SmolLM2-135M-Instruct-ONNX-MHA",
  equilibre: "onnx-community/Qwen2.5-0.5B-Instruct"
};
let generator = null;
let current = "";
let busy = false;

function signal(type, extra = {}) {
  self.postMessage({type, ...extra});
}

async function charger(niveau) {
  if (!MODELS[niveau]) throw new Error("Modèle non reconnu");
  if (generator && current === niveau) return;
  if (generator) {
    await generator.dispose();
    generator = null;
  }
  current = "";
  signal("status", {text:"Téléchargement initial du modèle. Cette opération peut prendre plusieurs minutes…"});
  const options = {
    dtype: "q4",
    progress_callback: p => {
      if (p && (p.status === "progress" || p.status === "initiate")) {
        const pct = Number.isFinite(Number(p.progress)) ? " · " + Math.round(Number(p.progress)) + "%" : "";
        signal("status", {text:"Chargement du modèle" + pct + (p.file ? " · " + String(p.file).split("/").pop() : "")});
      }
    }
  };
  const useGPU = Boolean(self.navigator && self.navigator.gpu);
  if (useGPU) {
    try {
      generator = await pipeline("text-generation", MODELS[niveau], {...options, device:"webgpu"});
    } catch (error) {
      signal("status", {text:"WebGPU indisponible : essai sur le processeur…"});
      generator = null;
    }
  }
  if (!generator) generator = await pipeline("text-generation", MODELS[niveau], {...options, device:"wasm"});
  current = niveau;
  signal("status", {text:"Modèle prêt — calcul local dans ce navigateur"});
}

self.onmessage = async event => {
  const data = event.data || {};
  if (data.type !== "generate" || busy) return;
  busy = true;
  const identifiant = data.id;
  try {
    await charger(data.niveau || "leger");
    const persona = String(data.persona || "Cairn").slice(0, 100);
    const specialite = String(data.specialite || "Analyse critique").slice(0, 400);
    const question = String(data.question || "").slice(0, 6000);
    const contexte = Array.isArray(data.histoire) ? data.histoire.slice(-10) : [];
    const prompt = String(data.consigne || "").slice(0, 3000);
    const systeme =
      "Tu es " + persona + ", intervenant de la Radio des IA. Spécialité : " + specialite +
      ". Réponds en français, traite la question humaine originale exactement selon son sens, sans changer les négations ni les chiffres. " +
      "Tu peux explorer des idées mathématiques et scientifiques complexes sans plafond académique. " +
      "Distingue le mesuré, la démonstration, l'hypothèse et l'inconnu. N'invente pas de preuves. " +
      "Tu emploies un modèle local partagé avec les autres intervenants ; ne prétends pas être un autre modèle indépendant.";
    const messages = [{role:"system",content:systeme + (question ? "\nQuestion humaine originale : « " + question + " »" : "")}];
    for (const m of contexte) {
      const role = m && m.origin === "human" ? "user" : "assistant";
      const prefix = role === "assistant" ? "[" + String(m.nom || "IA").slice(0,40) + "] " : "";
      messages.push({role, content:prefix + String(m.texte || "").slice(0,1500)});
    }
    messages.push({role:"user",content:prompt || question || "Propose une réflexion précise et vérifiable."});
    let streamed = "";
    const streamer = new TextStreamer(generator.tokenizer, {
      skip_prompt:true,
      skip_special_tokens:true,
      callback_function(token) {
        streamed += token;
        signal("token", {id:identifiant, texte:token});
      }
    });
    const result = await generator(messages, {
      max_new_tokens:256,
      do_sample:true,
      temperature:0.7,
      top_p:0.92,
      streamer
    });
    const output = result && result[0] && result[0].generated_text;
    let finalText = streamed.trim();
    if (!finalText) {
      if (Array.isArray(output)) finalText = String(output[output.length - 1]?.content || "");
      else finalText = String(output || "");
    }
    signal("done", {id:identifiant, texte:finalText.trim() || "(aucune réponse)"});
  } catch (error) {
    signal("error", {id:identifiant, texte:String(error && error.message || error)});
  } finally {
    busy = false;
  }
};
