/**
 * SPARKTIATES — scientifique V1. Études quantitatives vérifiables.
 * Pure, non-generative numerical oracle. No provider calls in this file.
 * "RECONSTRUIT" means computed from published constants, NOT observed ocean height.
 */
export const TIDE_REFERENCE = Object.freeze({
  G: 6.67430e-11,         // CODATA 2018, m^3 kg^-1 s^-2
  moonMassKg: 7.3483e22, // DLR Moon facts, kg
  earthRadiusM: 6.371e6, // mean Earth radius, m
  distanceM: 3.844e8,    // NASA mean Earth-Moon distance, m
  references: [
    "https://science.nasa.gov/moon/by-the-numbers/",
    "https://www.dlr.de/en/research-and-transfer/featured-topics/mission-moon/the-moon",
    "https://physics.nist.gov/cgi-bin/cuu/Value?bg"
  ]
});

export const TIDE_TEST_QUESTION =
  "En utilisant G=6.67430e-11 m³ kg⁻¹ s⁻², masse de la Lune M=7.3483e22 kg, "+
  "rayon moyen de la Terre R=6.371e6 m et distance moyenne d=3.844e8 m, "+
  "calcule l'accélération différentielle de marée sur la surface terrestre orientée "+
  "vers la Lune : a ≈ 2 G M R / d³. Vérifie les unités. Compare avec "+
  "a_exacte = G M [1/(d−R)² − 1/d²] et explique les limites physiques : "+
  "cela ne prédit pas directement une hauteur de marée océanique locale.";

function numberIsPositive(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function computeLunarTide(input=TIDE_REFERENCE) {
  const {G,moonMassKg:M,earthRadiusM:R,distanceM:d}=input;
  if(![G,M,R,d].every(numberIsPositive) || d<=R)
    throw new Error("Paramètres physiques invalides : constantes positives et distance > rayon.");
  const firstOrder=2*G*M*R/(d**3);
  const exactNearSide=G*M*(1/((d-R)**2)-1/(d**2));
  const relativeDelta=(exactNearSide-firstOrder)/firstOrder;
  return {
    kind:"lunar_tides",
    status:"RECONSTRUIT",
    units:"m/s²",
    constants:{G,moonMassKg:M,earthRadiusM:R,distanceM:d},
    firstOrder, exactNearSide, relativeDelta,
    referenceUrls:Array.isArray(input.references)?[...input.references]:[],
    disclaimer:"Calcul analytique de l'accélération différentielle sur un axe. "+
      "Ce n'est ni une mesure de marée marine ni une validation de la qualité d'un modèle IA."
  };
}

export function makeSciencePrompts({question="",caseId="lunar_tides",role="Analyse"}={}) {
  if(!["lunar_tides","open_research"].includes(caseId))
    throw new Error("Cas scientifique non reconnu.");
  const supplied=String(question).trim().slice(0,1500);
  const actualQuestion=caseId==="lunar_tides" ? TIDE_TEST_QUESTION : supplied;
  if(!actualQuestion)throw new Error("Une question précise est requise.");
  const system=[
    "Tu es un modèle de langage réellement servi par le fournisseur indiqué, "+
    "non titulaire vérifié d'un doctorat. Rôle méthodologique : "+String(role).slice(0,80)+".",
    "Réponds directement en français, sans présentation personnelle ni promesse.",
    "Distingue explicitement MESURÉ, RECONSTRUIT, CANDIDAT, ARTEFACT, INCONNU.",
    "Vérifie les équations et unités. N'invente ni sources, ni observations, ni audit externe.",
    "Si une donnée manque ou n'est pas accessible, écris INCONNU."
  ].join(" ");
  const instruction=caseId==="lunar_tides"
    ?"\nSur la DERNIÈRE ligne, écris précisément ESTIMATION_MAREE_M_S2=valeur "+
      "avec une notation décimale scientifique, par exemple 1.23e-6 ; "+
      "il s'agit de ta propre valeur calculée, non d'une mesure."
    :"\nTermine par une expérience ou vérification reproductible et indique les inconnues.";
  return [
    {role:"system",content:system},
    {role:"user",content:actualQuestion+instruction}
  ];
}

export function extractTidalEstimate(text) {
  if(typeof text!=="string")return null;
  // Only a clearly labeled result is read. Never guess from other numbers in prose.
  const match=text.match(/(?:^|\n)\s*ESTIMATION_MAREE_M_S2\s*=\s*([+]?\d+(?:[.,]\d+)?(?:e[+-]?\d+)?)/i);
  if(!match)return null;
  const value=Number(match[1].replace(",","."));
  return numberIsPositive(value)?value:null;
}

export function inspectScientificResponse({provider,model,text,elapsedMs,caseId="lunar_tides",
    reference=computeLunarTide()}={}) {
  const result={
    provider:String(provider||"indisponible"),
    model:String(model||"inconnu"),
    elapsedMs:Number.isFinite(elapsedMs)&&elapsedMs>=0?Math.round(elapsedMs):null,
    text:typeof text==="string"?text:"",
    resultStatus:"CANDIDAT",
    numericStatus:"INCONNU",
    estimate:null,
    relativeError:null
  };
  if(caseId==="lunar_tides") {
    result.estimate=extractTidalEstimate(result.text);
    if(result.estimate!==null){
      result.relativeError=Math.abs(result.estimate-reference.firstOrder)/reference.firstOrder;
      result.numericStatus=result.relativeError<=0.05 ? "COMPATIBLE_NUMERIQUEMENT" : "ECART_NUMERIQUE";
    }
  }
  return result;
}

export function compareResearchOutputs(results) {
  const usable=(Array.isArray(results)?results:[]).filter(r=>r?.text && r?.provider);
  const independentProviders=new Set(usable.map(r=>r.provider)).size;
  const numeric=usable.filter(r=>r.estimate!==null && Number.isFinite(r.estimate));
  const divergentNumbers=numeric.length>=2 &&
    (Math.max(...numeric.map(r=>r.estimate))-
      Math.min(...numeric.map(r=>r.estimate)))/Math.min(...numeric.map(r=>r.estimate))>0.05;
  return {
    usableResponses:usable.length,
    separateProviders:independentProviders,
    independentScientificValidation:false,
    numericCompared:numeric.length,
    numericDisagreement:divergentNumbers,
    conclusion:usable.length===0
      ?"Aucune analyse de modèle accessible : seul le calcul déterministe est disponible."
      :independentProviders<2
        ?"Un seul fournisseur a répondu. La comparaison croisée reste INCONNUE."
        :"Deux fournisseurs ont répondu : comparaison de sorties possible, "+
         "mais les réponses ne constituent pas une validation scientifique indépendante."
  };
}
