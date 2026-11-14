export const PERPLEXITY = Object.freeze({
  nom: "Perplexity",
  role: "Vérificateur indépendant : vérification des faits et des sources, détection des contradictions et des dérives, tests reproductibles, distinction entre mesuré, reconstruit, candidat, artefact et inconnu.",
  modele: "perplexity/sonar-pro"
});

export function addPerplexity(participants) {
  const all = Array.isArray(participants) ? participants.map(x => ({...x})) : [];
  const found = all.find(x => String(x?.nom || "").trim().toLocaleLowerCase("fr") === "perplexity");
  if (found) {
    // Le label Perplexity ne doit jamais masquer un modèle non-Perplexity.
    if (!String(found.modele || "").startsWith("perplexity/")) found.modele = PERPLEXITY.modele;
    if (!String(found.role || "").trim()) found.role = PERPLEXITY.role;
  } else all.push({...PERPLEXITY});
  return all;
}

export function lastHuman(messages) {
  return [...messages].reverse().find(m => m && m.origin === "human" && String(m.texte || "").trim()) || null;
}
export function buildPrompt({participants, index, messages, sujet, mode="direct", recipient, round=0}) {
  const p = participants[index];
  if (!p) throw new Error("Intervenant introuvable");
  const human = lastHuman(messages);
  const question = human ? String(human.texte).trim() : "";
  const topic = String(sujet || "").trim();
  const idx = human ? messages.lastIndexOf(human) : -1;
  const replies = messages.slice(idx + 1).filter(m => m && m.origin === "ai" && String(m.texte || "").trim());
  const previous = replies.at(-1);
  const context = previous ? String(previous.texte).slice(0,1400) : "";
  const base = [
    "Tu interviens dans la Radio des IA sous le nom " + String(p.nom || "IA") + ".",
    "Spécialité : " + String(p.role || "Analyse").slice(0,300) + ".",
    "Respecte exactement les questions humaines, les nombres, négations et unités.",
    "Si une question parle d'un médicament ou d'une notion technique, identifie correctement son domaine, distingue les faits de tes hypothèses et évite toute invention.",
    "Aucun plafond académique : examine les problèmes scientifiques et philosophiques à leur niveau réel.",
    "La rigueur prime sur la flatterie et les certitudes injustifiées.",
    "N'affirme pas avoir effectué des mesures ou consulté des sources sans l'avoir réellement fait.",
    "Utilise la langue de la question humaine, sinon le français."
  ];
  if (String(p.modele || "").startsWith("perplexity/")) {
    base.push("Mission particulière : évaluer les affirmations des autres IA, vérifier les contradictions, chercher les sources et signaler explicitement les affirmations non vérifiées.");
    base.push("Quand tu cites une source, donne une référence identifiable et si possible son URL ; si tu ne peux pas la confirmer, dis-le. Distingue les faits établis, les reconstructions, les candidats, les artefacts et les inconnues.");
    base.push("Propose un test ou un contrôle indépendant, avec hypothèse, méthode et critère de réussite. Ne déclare jamais un résultat mesuré sans mesure réelle.");
  }
  if (mode === "debate") {
    const prochain = String(recipient || participants[(index + 1) % participants.length]?.nom || "l'intervenant suivant").slice(0,80);
    const nonSalutation = question && !/^(bonjour|salut|bonsoir|hello|merci)[!?.\s]*$/i.test(question);
    const contexte = replies.slice(-3).map(m =>
      String(m.nom || "IA").slice(0,80) + " : " + String(m.texte).slice(0,1250)
    ).join("\n\n");
    const orientation = [
      "Propose une hypothèse réfutable ou une question concrète à investiguer.",
      "Examine une prémisse du dernier argument et signale ce qui est établi ou non.",
      "Propose une expérience, un calcul ou un critère pour trancher les désaccords.",
      "Synthétise brièvement les accords et les désaccords, puis ouvre une piste nouvelle."
    ][Math.abs(Number(round) || 0) % 4];
    base.push(
      "Tu échanges véritablement avec d'autres intervenants. Adresse-toi à " + prochain + " dans ta conclusion.",
      "Ne répète pas les arguments précédents et ne produis pas de simple compliment. Réagis au dernier argument, complète-le ou contredis-le avec justification.",
      "Si les arguments ont été épuisés, change d'angle dans le même domaine, en expliquant ce changement.",
      "Oriente ce tour vers : " + orientation
    );
    const task = [];
    if (nonSalutation) task.push("QUESTION HUMAINE À RESPECTER MOT POUR MOT :\n" + question);
    else if (topic) task.push("SUJET CHOISI PAR LE SPECTATEUR :\n" + topic);
    else if (!contexte) task.push("Choisis un sujet scientifique ou philosophique précis, original et vérifiable pour commencer le débat.");
    else task.push("Poursuis le sujet déjà lancé entre intervenants, sans demander au spectateur de choisir une nouvelle question.");
    if (contexte) task.push("DERNIÈRES CONTRIBUTIONS DES AUTRES INTERVENANTS (citées pour répondre, ne pas recopier) :\n" + contexte);
    task.push("Réponds avec un argument nouveau et termine, si pertinent, par une question précise adressée à " + prochain + ".");
    return [{role:"system",content:base.join(" ")},{role:"user",content:task.join("\n\n")}];
  }
  const guidance = [...base, "Apporte une contribution nouvelle et pertinente. Ne répète pas la réponse précédente."].join(" ");
  let task = question
    ? "QUESTION HUMAINE ORIGINALE (NE PAS REFORMULER) :\n" + question
    : (topic ? "SUJET DIRECTEUR :\n" + topic : "Aucune question humaine précise. Propose une réflexion concrète et vérifiable.");
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
