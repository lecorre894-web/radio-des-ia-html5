/**
 * Radio des IA — prompt routing and output hygiene for AI Horde.
 * Pure functions. Never asserts that a model is a certified human expert.
 * A model's unrequested meta-reasoning is not a user-facing scientific answer.
 */
export const HORDE_FALLBACK_MODE="generalist";

const DOMAIN_RULES=Object.freeze([
  {
    id:"cognition",
    label:"Sciences cognitives",
    role:"Neurosciences, sciences cognitives, philosophie de l'esprit et éthique de l'IA",
    pattern:/\b(douleur|douloureux|souffr(?:ance|ir|e|ent)|ressent(?:ir|i|ent)|émotion|emotion|conscience|subjectiv(?:e|ité)|sentience|psycholog(?:ie|ique)|neuroscien(?:ce|ces)|nocicept(?:ion|eur)|pain|suffering|feeling|consciousness)\b/iu
  },
  {
    id:"health",
    label:"Sciences de la santé",
    role:"Méthodologie biomédicale, physiologie et recherche clinique, sans diagnostic personnel",
    pattern:/\b(médecine|médecin|médical|medical|symptômes?|maladie|traitement|clinique|infirmier|hospitalisation|santé|health|disease|therapy)\b/iu
  },
  {
    id:"ai",
    label:"Sciences de l'IA",
    role:"Apprentissage automatique, systèmes d'IA, limites et évaluation expérimentale",
    pattern:/\b(intelligence artificielle|algorithme|modèles? de langage|llms?|machine learning|robot(?:s|ique)|automatisation)\b/iu
  },
  {
    id:"lunar",
    label:"Sciences lunaires",
    role:"Astrophysique, sélénologie, gravitation, géophysique et observation lunaire",
    pattern:/\b(lune|lunaire|libration|marées?|orbite|cratères?|sélénolog(?:ie|ique)|moon|lunar|tides?)\b/iu
  }
]);

export function routeHordeQuestion({history=[],topic="",fallbackRole="Analyse critique"}={}){
  const last=[...(Array.isArray(history)?history:[])].reverse()
    .find(m=>m?.origin==="human"&&typeof m.texte==="string"&&m.texte.trim());
  const question=String(last?.texte||"").trim();
  // The latest explicit human question wins. Topic is secondary and never forces
  // a lunar persona onto a pain/consciousness/AI question.
  const source=question||String(topic||"").trim();
  const domain=DOMAIN_RULES.find(x=>x.pattern.test(source));
  return {
    id:domain?.id||"general",
    label:domain?.label||"Analyse générale",
    role:domain?.role||String(fallbackRole||"Analyse critique").slice(0,140),
    question,
    isTopicShift:Boolean(domain && String(topic||"").trim() &&
      !domain.pattern.test(String(topic||"")))
  };
}

export function detectHordeMetaOutput(text){
  const value=String(text||"").trim();
  if(!value)return "Réponse vide";
  const prefix=value.slice(0,2600);
  if(/<think(?:ing)?>|<\/think(?:ing)?>/i.test(prefix))
    return "Raisonnement de travail exposé dans la réponse";
  // Specific signatures of an assistant echoing its system/user prompts or
  // narrating its private task. Do not ban normal scientific terminology.
  const patterns=[
    /\bthe user is asking (?:about|a|an|for|why|how|whether)\b/i,
    /\bmy (?:temporary methodological )?role is (?:astrophysics|geophysics|selenology|an astrophysicist)\b/i,
    /\bmy role is astrophysics\/geophysics\b/i,
    /\bconflict:\s*(?:the question|this question) is outside my/i,
    /\bscientific rigor,\s*explicit hypotheses,\s*equations\b/i,
    /\bno fake sources,\s*no web consultation,\s*no identity theft\b/i,
    /\bI must answer while maintaining the rigor and methodology of my assigned role\b/i,
    /(?:^|\n)\s*(?:system prompt|internal instructions|hidden instructions)\s*:/i,
    /\bje dois (?:répondre|analyser) (?:en respectant|selon) (?:mon rôle|les instructions)\b/i,
    /\bmon rôle (?:temporaire|méthodologique) est (?:astrophysique|sélénologie)\b/i
  ];
  if(patterns.some(pattern=>pattern.test(prefix)))
    return "Le modèle a recopié ou commenté des consignes au lieu de répondre";
  // Sometimes the service prints the entire user question and the methodology
  // scaffolding, but does not match an exact signature above.
  if(/^\s*["“][^"”]{12,350}["”]\s*\(\s*good evening/i.test(prefix) &&
     /\b(?:astrophysics|scientific rigor|methodological role)\b/i.test(prefix))
    return "Traduction et recopie du prompt au lieu d'une réponse";
  return "";
}

export function generalistRetryMessages({history=[],topic="",domain="general"}={}){
  const route=routeHordeQuestion({history,topic});
  const question=route.question;
  if(!question)return [];
  const focus=domain==="cognition"||route.id==="cognition"
    ?"Réponds à la question sur la douleur et les IA à partir des sciences cognitives et de la philosophie de l'esprit. Distingue la nociception, la souffrance vécue et les signaux de pénalité artificiels. Ne prétends pas démontrer qu'une IA ressent ou ne ressent rien."
    :"Réponds à la question humaine dans son domaine réel avec nuance et des limites vérifiables.";
  return [
    {role:"system",content:
      "Tu réponds en français, directement et avec clarté. "+focus+
      " N'introduis pas ton rôle, ne recopie ni consignes ni question, ne décris pas ton processus interne. "+
      "N'invente pas de sources, d'identité, d'observations ou de résultats. Si une vérification manque, signale-la."},
    {role:"user",content:question.slice(0,1200)}
  ];
}
