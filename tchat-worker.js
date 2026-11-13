import { pipeline, TextStreamer } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0";

// Un seul moteur physique dans chaque navigateur : les noms IA sont des rôles, pas des fournisseurs distincts.
const MODELS = {
  leger: "onnx-community/SmolLM2-135M-Instruct-ONNX-MHA",
  equilibre: "onnx-community/Qwen2.5-0.5B-Instruct"
};
let generator = null, current = "", busy = false;
function signal(type, extra = {}) { self.postMessage({type, ...extra}); }

async function charger(niveau) {
  if (!MODELS[niveau]) throw Error("Modèle inconnu");
  if (generator && current === niveau) return;
  if (generator) {
    await generator.dispose();
    generator = null;
  }
  current = "";
  signal("status", {text:"Chargement du modèle local…"});
  const options = {
    dtype:"q4",
    progress_callback:p => {
      if (p?.status === "progress" && Number.isFinite(p.progress))
        signal("status",{text:"Téléchargement du modèle : "+Math.round(p.progress)+" %"});
    }
  };
  const mobile = /Android|iPhone|iPad|iPod/i.test(self.navigator?.userAgent || "");
  if (mobile) signal("status",{text:"Mode mobile : calcul CPU plus prudent pour la mémoire du navigateur."});
  if (!mobile && self.navigator?.gpu) {
    try {
      generator = await pipeline("text-generation",MODELS[niveau],{...options,device:"webgpu"});
    } catch {
      signal("status",{text:"WebGPU indisponible : passage au processeur…"});
    }
  }
  if (!generator)
    generator = await pipeline("text-generation",MODELS[niveau],{...options,device:"wasm"});
  current = niveau;
  signal("status",{text:"Modèle local prêt"});
}

function construireDialogue(data) {
  const persona = String(data.persona || "Cairn").slice(0,60);
  const specialite = String(data.specialite || "Analyse critique").slice(0,160);
  const historique = Array.isArray(data.histoire) ? data.histoire.filter(m=>m && typeof m.texte==="string").slice(-14) : [];
  const dernierHumain = [...historique].reverse().find(m=>m.origin==="human" && m.texte.trim());
  const question = String(data.question || dernierHumain?.texte || "").trim().slice(0,4000);
  const sujet = String(data.sujet || "").trim().slice(0,400);
  const dernierIndiceHumain = historique.findLastIndex(m=>m.origin==="human" && m.texte.trim());
  const contributionsDepuisQuestion = dernierIndiceHumain >= 0
    ? historique.slice(dernierIndiceHumain + 1)
    : (question ? [] : historique);
  const derniereContribution = [...contributionsDepuisQuestion].reverse().find(m=>m.origin==="ai" && m.texte.trim());
  const precedent = derniereContribution
    ? String(derniereContribution.texte).slice(0,700) : "";
  const systeme = [
    "Tu interviens sous le nom " + persona + ". Spécialité : " + specialite + ".",
    "Tu es un modèle local expérimental. Les noms des intervenants sont des rôles, pas d'autres modèles.",
    "Réponds en français, directement à la demande humaine, sans changer les négations, nombres ou contraintes.",
    "Ne reproduis ni une réponse précédente ni une suite de salutations. N'écris pas de préfixe [Nom IA].",
    "Fais une contribution nouvelle, précise et courte, en distinguant preuves, hypothèses et inconnus.",
    "Aucun plafond académique : les sujets avancés sont permis, mais n'invente pas de résultat scientifique."
  ].join(" ");
  const etapes = [];
  if (sujet) etapes.push("Sujet général : " + sujet);
  if (question) etapes.push("DERNIÈRE DEMANDE HUMAINE (texte exact) :\n" + question);
  else etapes.push("Il n'y a pas de demande humaine. Propose un sujet concret et justifie son intérêt.");
  if (precedent) {
    etapes.push("Dernière contribution à examiner (ne pas recopier) :\n" + precedent);
    etapes.push("Ta mission : apporter un argument nouveau, répondre à la question et, si pertinent, contredire le point précédent avec raison.");
  } else {
    etapes.push("Ta mission : répondre d'abord à la demande humaine, sans préambule.");
  }
  return [
    {role:"system",content:systeme},
    {role:"user",content:etapes.join("\n\n")}
  ];
}

self.onmessage = async event => {
  const data = event.data || {};
  if (!["generate","load"].includes(data.type) || busy) return;
  busy = true;
  const id = data.id;
  try {
    await charger(data.niveau || "leger");
    if (data.type === "load") {
      signal("ready",{id,texte:"Modèle téléchargé et initialisé. Vous pouvez poser une question."});
      return;
    }
    const prompt = construireDialogue(data);
    let streamed = "";
    const streamer = new TextStreamer(generator.tokenizer,{
      skip_prompt:true,skip_special_tokens:true,
      callback_function(t) {
        streamed += t;
        signal("token",{id,texte:t});
      }
    });
    const result = await generator(prompt,{
      max_new_tokens: Math.max(64, Math.min(320, Number(data.max_tokens) || 320)),
      do_sample:true,
      temperature:0.72,
      top_p:0.9,
      repetition_penalty:1.15,
      no_repeat_ngram_size:4,
      streamer
    });
    let answer=streamed.trim();
    if (!answer) {
      const v=result?.[0]?.generated_text;
      answer=Array.isArray(v) ? String(v.at(-1)?.content || "") : String(v || "");
    }
    signal("done",{id,texte:answer.trim()});
  } catch(error) {
    signal("error",{id,texte:String(error?.message || error)});
  } finally {
    busy=false;
  }
};
