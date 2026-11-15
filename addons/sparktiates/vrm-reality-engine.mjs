/**
 * SPARKTIATES VRM — Phase 3 "monde virtuel" non-génératif.
 * Représente les citations, intervenants et rapprochements lexicaux.
 * AUCUNE affirmation ne devient scientifiquement vraie par sa présence ici.
 */
const STOP=new Set([
  "dans","avec","pour","nous","cette","sont","ainsi","vous","votre","comme",
  "plus","tout","leurs","elles","c'est","mais","notre","avant","apres",
  "avoir","etre","sans","sous","entre","alors","juste","dont","meme",
  "that","with","from","this","then","will","have","than"
]);
function tokens(text){
  const s=String(text||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLocaleLowerCase("fr");
  return new Set((s.match(/[\p{L}\p{N}]{5,}/gu)||[]).filter(t=>!STOP.has(t)).slice(0,900));
}
function safeText(e){return String(e?.text||"");}
function confidenceStatus(e){
  // Event provenance indicates assertion, NOT measurement verification.
  if(e.origin==="human")return "DÉCLARATION_HUMAINE";
  return "CANDIDAT_NON_VÉRIFIÉ";
}
export function buildVrmVirtualWorld(all,{maxEvents=200,filterTopic=""}={}){
  const cap=Math.max(1,Math.min(300,Number.isInteger(maxEvents)?maxEvents:200));
  const source=(Array.isArray(all)?all:[]).filter(e=>
    e&&/^[a-f0-9]{16}$/i.test(String(e.id))&&["human","ai"].includes(e.origin)&&
    typeof e.text==="string"&&e.text.trim());
  const wanted=String(filterTopic||"").toLocaleLowerCase("fr").trim();
  const filtered=wanted?source.filter(e=>String(e.topic||"").toLocaleLowerCase("fr").includes(wanted)):source;
  const slice=filtered.slice(-cap);
  const enriched=slice.map((e,i)=>({
    id:e.id,i,event:e,
    terms:tokens(safeText(e)+" "+String(e.topic||""))
  }));
  const nodes=enriched.map(({event:e,id})=>({
    id,kind:"CITATION",origin:e.origin,
    label:String(e.nom||e.origin).slice(0,80),
    topic:String(e.topic||"").slice(0,150),
    time:String(e.time||"").slice(0,30),
    status:confidenceStatus(e),
    eventType:String(e.type||"CANDIDAT").slice(0,35),
    excerpt:safeText(e).slice(0,200)
  }));
  const edges=[];
  // Explicit topic link or at least 3 shared tokens; cap avoids quadratic export growth.
  for(let i=0;i<enriched.length;i++){
    for(let j=i+1;j<enriched.length;j++){
      const a=enriched[i],b=enriched[j];
      let count=0;const match=[];
      for(const term of a.terms){
        if(b.terms.has(term)){count++;if(match.length<5)match.push(term);}
      }
      const topicA=String(a.event.topic||"").trim().toLocaleLowerCase("fr");
      const topicB=String(b.event.topic||"").trim().toLocaleLowerCase("fr");
      const sameTopic=Boolean(topicA&&topicA===topicB);
      if(count<3&&!sameTopic)continue;
      edges.push({
        from:a.id,to:b.id,
        kind:"ASSOCIATION_CANDIDATE",
        basis:sameTopic?"MÊME_SUJET_EXPLICITE":"TERMES_PARTAGÉS",
        overlapTerms:count,terms:match,
        verified:false
      });
    }
  }
  const selected=edges.sort((a,b)=>b.overlapTerms-a.overlapTerms||
    a.from.localeCompare(b.from)||a.to.localeCompare(b.to)).slice(0,1000);
  const transcript=filtered.map(e=>safeText(e).toLocaleLowerCase("fr")).join("\n");
  const suggestedChecks=[];
  if(/mar[eé]e|acc[eé]l[eé]ration|potentiel/i.test(transcript)){
    suggestedChecks.push({
      id:"GRAVITATION_UNITES",status:"CANDIDAT",
      action:"Comparer les variables R_T et d, refaire la dérivée et vérifier m/s² avec une référence indépendante.",
      proof:"NON_EFFECTUÉE"
    });
  }
  if(/contradict|erreur|corrig|rectifi|r[eé]fut/i.test(transcript)){
    suggestedChecks.push({
      id:"AUDIT_CONTRADICTIONS",status:"CANDIDAT",
      action:"Citer les deux propositions exactes, vérifier leur contexte avant de conclure à une contradiction.",
      proof:"NON_EFFECTUÉE"
    });
  }
  if(/mesur|observ|instrument/i.test(transcript)){
    suggestedChecks.push({
      id:"VALIDATION_OBSERVATIONS",status:"CANDIDAT",
      action:"Identifier une source instrumentale indépendante, sa précision et son incertitude.",
      proof:"NON_EFFECTUÉE"
    });
  }
  return {
    engine:"SPARKTIATES-VRM-virtual-world-v1",
    phase:"REPRÉSENTATION_VIRTUELLE",
    execution:"CALCUL_DÉTERMINISTE_SUR_MACHINE_RÉELLE",
    semanticLimit:"Associations lexicales et sujet déclaré ; ni similarité sémantique garantie ni causalité.",
    provenance:"CITATIONS_NON_CERTIFIÉES",
    counts:{sourceEvents:source.length,topicEvents:filtered.length,nodes:nodes.length,edges:selected.length},
    nodes,edges:selected,extrapolationPlans:suggestedChecks
  };
}
