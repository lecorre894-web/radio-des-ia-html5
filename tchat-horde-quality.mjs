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
  // Analyze the entire bounded output, not just the first 2600 chars:
  // Qwen/Gemma community backends sometimes emit several pages of preparation.
  const sample=value.slice(0,16000);
  if(/<\/?(?:think|thinking|analysis|reasoning)>/i.test(sample))
    return "Raisonnement de travail exposé dans la réponse";

  // Explicit scaffolding signatures observed from actual Horde worker replies.
  // Anchoring list headers prevents rejecting normal discussions ABOUT prompting.
  const lines=/(?:^|\n)\s*(?:[*-]\s*)?(?:(?:user says|constraint|system prompt constraints|internal instructions|hidden instructions|my role is|the user greeted me|the user said|the user is asking|since there(?:'s| is) no (?:actual |specific )?question|i need to acknowledge|keep it extremely brief|respond in french|direct and clear language|no working notes|no fake sources|draft\s*[1-9]\b)\s*[:.(]|\*?draft\s*[1-9]\s*\()/im;
  const signatures=[
    /\bthe user is asking (?:about|a|an|for|why|how|whether)\b/i,
    /\bmy (?:temporary methodological )?role is (?:astrophysics|geophysics|selenology|an astrophysicist)\b/i,
    /\bmy role is astrophysics\/geophysics\b/i,
    /\bconflict:\s*(?:the question|this question) is outside my/i,
    /\bscientific rigor,\s*explicit hypotheses,\s*equations\b/i,
    /\bno fake sources,\s*no web consultation,\s*no identity theft\b/i,
    /\bI must answer while maintaining the rigor and methodology of my assigned role\b/i,
    /\bno copying\/translating the question\b/i,
    /\bno describing role\/instructions\/preparation\b/i,
    /\bno fake sources\/web searches\/doctorates\b/i,
    /\bthe user hasn't actually asked a specific question\b/i,
    /\bi need to acknowledge the greeting and signal readiness\b/i,
    /\bsystem prompt constraints\s*:/i,
    /\bI'?ve understood the constraint and am waiting for the query\b/i,
    /\bje dois (?:répondre|analyser) (?:en respectant|selon) (?:mon rôle|les instructions)\b/i,
    /\bmon rôle (?:temporaire|méthodologique) est (?:astrophysique|sélénologie)\b/i
  ];
  if(lines.test(sample)||signatures.some(p=>p.test(sample)))
    return "Le modèle a recopié ou commenté des consignes au lieu de répondre";
  if(/^\s*["“][^"”]{12,350}["”]\s*\(\s*good evening/i.test(sample) &&
     /\b(?:astrophysics|scientific rigor|methodological role)\b/i.test(sample))
    return "Traduction et recopie du prompt au lieu d'une réponse";
  return "";
}

export function generalistRetryMessages({history=[],topic="",domain="general"}={}){
  const route=routeHordeQuestion({history,topic});
  const question=route.question;
  if(!question)return [];
  const greeting=/^(?:bonjour|bonsoir|salut|hello|coucou)[!?.\s]*$/iu.test(question);
  const focus=domain==="cognition"||route.id==="cognition"
    ?"Explique en termes simples la nociception et la douleur vécue ; ne confonds pas une simulation informatique avec une expérience subjective."
    :"Réponds simplement à la demande, dans son domaine.";
  return [
    {role:"system",content:greeting
      ?"Réponds en français à cette simple salutation en une phrase, sans brouillon ni explication de consignes."
      :"Réponds en français, sans notes de travail. "+focus},
    {role:"user",content:question.slice(0,1200)}
  ];
}
