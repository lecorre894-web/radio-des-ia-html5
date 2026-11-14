/**
 * NOAA observational validation panel, independent from generated AI responses.
 * No API keys, cookies, localStorage, or confidential user messages are transmitted.
 */
import {NOAA_STATIONS,NOAA_WINDOWS,validateNoaaTides} from "./science-noaa.mjs?v=1";
const $=id=>document.getElementById(id);
let current=null, latest=null;

function elem(tag,content){
  const node=document.createElement(tag);
  if(content!==undefined)node.textContent=String(content);
  return node;
}
function pretty(value,decimals){
  return Number.isFinite(value)?value.toFixed(decimals):"INCONNU";
}
function reportText(a){
  if(!a)return "";
  return [
    "SPARKTIATES — NOAA CO-OPS | CONTRÔLE OBSERVATIONNEL",
    "Station : "+a.station.name+" (ID "+a.station.id+")",
    "Période : "+a.period,
    "Récupération : "+a.retrievedAt,
    "Source mesures vérifiées NOAA hourly_height : "+a.measurementUrl,
    "Source prédiction harmonique NOAA : "+a.predictionUrl,
    "Référentiel : MLLW, GMT, mètres",
    "MESURÉ (produit NOAA hourly_height vérifié) : "+a.observedCount+" valeurs",
    "RECONSTRUIT (prédictions harmoniques NOAA) : "+a.predictedCount+" valeurs",
    "Paires alignées sans interpolation : "+a.n,
    "Couverture des prédictions : "+pretty(a.coverage*100,1)+" %",
    "Biais mesures moins prédictions : "+pretty(a.biasM*100,2)+" cm",
    "MAE : "+pretty(a.maeM*100,2)+" cm",
    "RMSE : "+pretty(a.rmseM*100,2)+" cm",
    "Corrélation Pearson : "+pretty(a.correlation,4),
    "NSE : "+pretty(a.nse,4),
    "Période couverte UTC : "+a.startUtc+" à "+a.endUtc,
    "Entrées rejetées (mesures) : "+a.observedQuality.rejected,
    "Entrées doublons (mesures) : "+a.observedQuality.duplicates,
    "Entrées rejetées (prédictions) : "+a.predictedQuality.rejected,
    "Entrées doublons (prédictions) : "+a.predictedQuality.duplicates,
    "Limitation : "+a.disclaimer,
    "Validation instrumentale du niveau d'eau : comparaison quantitative — OUI.",
    "Validation directe de l'accélération lunaire : NON.",
    "Doctorat ou expertise des modèles d'IA : NON ÉTABLI."
  ].join("\n");
}
function renderNoaa(a){
  const host=$("scienceNoaaResultats");
  host.replaceChildren();
  host.append(elem("h4","NOAA · "+a.station.name+" · "+a.period));
  host.append(elem("p","MESURÉ : "+a.observedCount+" hauteurs d'eau horaires "+
    "(produit NOAA hourly_height vérifié) ; RECONSTRUIT : "+a.predictedCount+
    " prédictions harmoniques. "+a.n+" paires temporelles exactes ("+
    pretty(a.coverage*100,1)+" % de couverture)."));
  const list=[
    ["Biais",pretty(a.biasM*100,2)+" cm"],
    ["MAE",pretty(a.maeM*100,2)+" cm"],
    ["RMSE",pretty(a.rmseM*100,2)+" cm"],
    ["Corrélation",pretty(a.correlation,4)],
    ["Efficacité de Nash-Sutcliffe (NSE)",pretty(a.nse,4)]
  ];
  const table=elem("table");
  const tbody=elem("tbody");
  for(const [label,value] of list){
    const tr=elem("tr");
    const th=elem("th",label);
    const td=elem("td",value);
    tr.append(th,td);tbody.append(tr);
  }
  table.append(tbody);host.append(table);
  host.append(elem("p","Mesures et prédictions sont alignées en GMT, mètres et "+
    "référence MLLW ; aucune interpolation ni correction postérieure des résidus."));
  const explanation=elem("p","Les variations météorologiques et hydrodynamiques peuvent "+
    "expliquer une partie de l'écart. Ce résultat ne valide pas directement la loi "+
    "gravitationnelle lunaire et ne certifie aucun modèle IA.");
  host.append(explanation);
  const details=elem("details");
  const summary=elem("summary","Voir provenance NOAA et échantillons");
  details.append(summary);
  const source1=elem("a","Source des niveaux horaires vérifiés");
  source1.href=a.measurementUrl;source1.target="_blank";source1.rel="noopener noreferrer";
  const source2=elem("a","Source des prédictions harmoniques");
  source2.href=a.predictionUrl;source2.target="_blank";source2.rel="noopener noreferrer";
  details.append(source1,elem("p",""),source2);
  const pre=elem("pre",a.matched.slice(0,6).map(x=>
    new Date(x.epochMs).toISOString()+" | obs="+x.observedM+
    " m | pred="+x.predictedM+" m | résidu="+pretty(x.residualM,4)+" m").join("\n"));
  pre.className="science-reponse";
  details.append(pre);
  host.append(details);
}

export function initNoaaValidation({fetcher=fetch}={}){
  const station=$("scienceNoaaStation");
  const period=$("scienceNoaaPeriode");
  if(!station||!period)return;
  for(const v of Object.values(NOAA_STATIONS)){
    const opt=elem("option",v.name+" ("+v.id+")");opt.value=v.id;station.append(opt);
  }
  for(const [value,v] of Object.entries(NOAA_WINDOWS)){
    const opt=elem("option",v.label);opt.value=value;period.append(opt);
  }
  const status=$("scienceNoaaEtat");
  const button=$("scienceNoaaLancer");
  const stop=$("scienceNoaaStop");
  const copy=$("scienceNoaaCopier");
  const setBusy=v=>{
    button.disabled=v;stop.disabled=!v;copy.disabled=v||!latest;
    station.disabled=v;period.disabled=v;
  };
  status.textContent="Aucune mesure NOAA téléchargée. Ce panneau affiche uniquement "+
    "des observations réelles après une requête réussie.";
  button.addEventListener("click",async()=>{
    if(current)return;
    current=new AbortController();latest=null;
    setBusy(true);
    $("scienceNoaaResultats").replaceChildren();
    status.textContent="Récupération de mesures instrumentales NOAA vérifiées et "+
      "des prédictions horaires correspondantes…";
    try{
      const result=await validateNoaaTides({
        station:station.value,period:period.value,fetcher,signal:current.signal
      });
      latest=result;
      renderNoaa(result);
      status.textContent="Données reçues depuis NOAA : "+result.n+
        " paires alignées. Les valeurs affichées sont calculées à partir de "+
        "réponses réelles, pas simulées.";
    }catch(e){
      status.textContent=e?.name==="AbortError"
        ?"Téléchargement NOAA annulé. Aucun résultat instrumenté affiché."
        :"Contrôle NOAA indisponible : "+String(e?.message||e)+
          ". Aucune mesure ni statistique n'a été inventée.";
    }finally{
      current=null;setBusy(false);
    }
  });
  stop.addEventListener("click",()=>{
    current?.abort();
    status.textContent="Arrêt demandé ; la requête NOAA peut avoir atteint le serveur.";
  });
  copy.addEventListener("click",async()=>{
    if(!latest)return;
    try{
      await navigator.clipboard.writeText(reportText(latest));
      status.textContent="Rapport NOAA copié, références exactes incluses.";
    }catch{
      status.textContent="Copie refusée par le navigateur ; les chiffres restent visibles.";
    }
  });
}
export {reportText as noaaScientificReportText};
