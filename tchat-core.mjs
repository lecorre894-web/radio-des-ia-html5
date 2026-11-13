export function lastHuman(messages) {
  return [...messages].reverse().find(m => m && m.origin === "human" && String(m.texte || "").trim()) || null;
}
export function buildPrompt({participants, index, messages, sujet}) {
  const p = participants[index];
  if (!p) throw new Error("Intervenant introuvable");
  const human = lastHuman(messages);
  const question = human ? human.texte : String(sujet || "").trim();
  const idx = human ? messages.lastIndexOf(human) : -1;
  const replies = messages.slice(idx + 1).filter(m => m && m.origin === "ai" && String(m.texte || "").trim());
  const previous = replies.at(-1);
  const context = previous ? String(previous.texte).slice(0, 1400) : "";
  const guidance = [
    "Tu réponds dans le Salon des IA sous le nom " + String(p.nom || "IA") + ".",
    "Spécialité : " + String(p.role || "Analyse").slice(0,300) + ".",
    "Respecte exactement la question humaine et son sens, les chiffres, les négations et les unités.",
    "Pour un médicament ou une notion technique, précise son domaine, indique les faits vérifiables et évite toute invention.",
    "Aucun plafond académique : traite les problèmes scientifiques, mathématiques ou philosophiques à leur niveau réel.",
    "La rigueur prime sur la flatterie. Signale les incertitudes et les hypothèses.",
    "Ne répète pas une réponse précédente. Apporte une contribution nouvelle et pertinente.",
    "Utilise la langue de la question humaine, par défaut le français.",
    "Ne prétends pas avoir effectué des tests ou consulté des sources si ce n'est pas le cas."
  ].join(" ");
  let task = question
    ? "QUESTION HUMAINE ORIGINALE (NE PAS REFORMULER) :\n" + question
    : "Aucune question humaine précise. Lance une réflexion scientifique ou philosophique concrète.";
  if (context) task += "\n\nDERNIÈRE CONTRIBUTION D'UNE AUTRE IA (à critiquer ou compléter sans la recopier) :\n" + context;
  task += "\n\nRéponds directement et utilement. Si l'information manque, reconnais-le.";
  return [{role:"system",content:guidance},{role:"user",content:task}];
}
export function responseText(resp) {
  const val = resp?.message?.content ?? resp?.text ?? resp?.content ?? resp;
  if (typeof val === "string") return val;
  if (Array.isArray(val)) return val.filter(x => x && (x.type === "text" || typeof x.text === "string")).map(x => x.text || "").join("");
  if (val && typeof val === "object" && typeof val.text === "string") return val.text;
  return "";
}
export function cleanAnswer(answer, participants = []) {
  let text = String(answer || "").trim();
  for (let i=0; i<4; i++) {
    const match = text.match(/^\[([^\]]{1,60})\]\s*/);
    if (!match || !participants.some(p => p.nom?.toLowerCase() === match[1].toLowerCase())) break;
    text=text.slice(match[0].length).trim();
  }
  return text;
}
export function qualityIssue(answer, messages) {
  const norm = v => String(v || "").toLocaleLowerCase("fr").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^\p{L}\p{N}]+/gu," ").trim();
  const txt=norm(answer);
  if (!txt) return "Réponse vide";
  const recent=messages.filter(m => m && m.origin === "ai").slice(-6);
  if (recent.some(m => norm(m.texte) === txt)) return "Répétition identique détectée";
  const human=lastHuman(messages);
  if (/^(bonjour|salut|bonsoir)( bonjour| salut| bonsoir)*$/.test(txt) && !/^(bonjour|salut|bonsoir)$/.test(norm(human?.texte))) return "Salutation sans rapport avec la question";
  return "";
}
