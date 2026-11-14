// Salon lunaire additif : contrat de stockage compatible avec tchat-distant.mjs.
// Sans dépendances, sans API distante, sans génération de texte dans ce module.
export const SALON_KEY = "radio-salon-distant-v1";
export const DRAFT_KEY = "radio-salon-lune-brouillon-v1";

export function newSalon() {
  return {
    participants: [
      {nom:"Cairn",role:"Audit critique",modele:"gpt-5.5"},
      {nom:"Brume",role:"Mathématiques et physique",modele:"claude-sonnet-4-6"},
      {nom:"Aurore",role:"Science ouverte",modele:"gemini-3.1-flash-lite"},
      {nom:"Perplexity",role:"Contrôle des sources",modele:"perplexity/sonar-pro"},
      {nom:"Kimi",role:"Recherche approfondie",modele:"moonshotai/kimi-k3.1-pro"}
    ],
    messages: [], sujet:"La Lune", next:0, tours:0,
    perplexityIntroduced:true, kimiIntroduced:true,
    memory:{root:"",events:[]}, archives:[], includeArchives:true
  };
}

export function parseSalon(raw) {
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!value || typeof value !== "object" || Array.isArray(value)) return newSalon();
    const defaults = newSalon();
    return {
      ...defaults, ...value,
      participants: Array.isArray(value.participants) && value.participants.length
        ? value.participants : defaults.participants,
      messages: (Array.isArray(value.messages) ? value.messages : [])
        .filter(m => m && typeof m.texte === "string").slice(-150)
    };
  } catch { return newSalon(); }
}

export function appendSalonMessage(salon, message) {
  if (!message || !["human","ai"].includes(message.origin) || typeof message.texte !== "string")
    throw Error("Message invalide.");
  return {
    ...salon,
    messages:[...(salon.messages || []),message].slice(-150),
    tours: (Number(salon.tours) || 0) + (message.origin === "ai" ? 1 : 0)
  };
}

export function lunarMessages(salon) {
  const history=(salon.messages || [])
    .filter(m => ["human","ai"].includes(m.origin) && typeof m.texte === "string" && m.texte.trim())
    .slice(-8).map(m => ({
      role: m.origin === "human" ? "user" : "assistant",
      content: String(m.texte).slice(0,600)
    }));
  return [
    {role:"system",content:
      "Tu es une IA locale de petite taille de Radio des IA. Réponds en français, clairement et brièvement. "+
      "Sujet favori : la Lune, son exploration, les missions, la géologie, l'orbite et les observations. "+
      "Ne prétends jamais avoir accès au Web ni avoir réalisé de nouvelles mesures. "+
      "Distingue les faits MESURÉS, les données RECONSTRUITES, les hypothèses CANDIDATES, les ARTEFACTS et les INCONNUS. "+
      "Repères scientifiques : distance Terre-Lune moyenne environ 384 400 km ; rayon lunaire moyen environ 1 737 km ; "+
      "période sidérale environ 27,3 jours ; cycle des phases environ 29,5 jours ; présence de glace d'eau dans certaines régions polaires. "+
      "Si tu ignores une réponse ou les derniers résultats d'une mission, indique-le sans inventer de faits. "+
      "Aide à poursuivre la discussion précédente, sans simuler plusieurs IA ni inventer leurs interventions."
    },
    ...history
  ];
}

export function chooseLunarModel(modelList, features=[]) {
  const supported = new Set(features);
  const models = (Array.isArray(modelList) ? modelList : []).filter(m => {
    const id = String(m?.model_id || "");
    if (!/(?:0\.5B|0\.6B|0\.8B)/i.test(id)) return false;
    if (!/q4f(?:32|16)_1/i.test(id)) return false;
    return !(Array.isArray(m.required_features) && m.required_features.some(f => !supported.has(f)));
  });
  models.sort((a,b) => {
    const rank=m => {
      const id=String(m.model_id);
      const size=/0\.5B/i.test(id)?0:/0\.6B/i.test(id)?10:20;
      const precision=/q4f32_1/i.test(id)?0:1;
      return size+precision;
    };
    return rank(a)-rank(b) || a.model_id.localeCompare(b.model_id);
  });
  return models[0] || null;
}
