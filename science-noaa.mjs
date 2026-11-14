/**
 * SPARKTIATES — observational audit of NOAA CO-OPS tides, V1.
 * Only official NOAA API requests are performed. No generated pixels or fabricated measurements.
 * Distinct from lunar acceleration first-order physical calculation:
 * this checks a harmonic tide PREDICTION against instrumental OBSERVATIONS.
 *
 * Station and time window are pinned to verified historical data; the API
 * does not supply an uncertainty model or prove causality of the lunar tide.
 */
export const NOAA_DATA_API="https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";
export const NOAA_REFERENCE_URL="https://api.tidesandcurrents.noaa.gov/api/dev/";
export const NOAA_STATIONS=Object.freeze({
  "9414290":Object.freeze({id:"9414290",name:"San Francisco, Californie",region:"Pacifique"}),
  "8518750":Object.freeze({id:"8518750",name:"The Battery, New York",region:"Atlantique"})
});
export const NOAA_WINDOWS=Object.freeze({
  "20250915":Object.freeze({begin:"20250915",end:"20250921",label:"15–21 septembre 2025"}),
  "20250414":Object.freeze({begin:"20250414",end:"20250420",label:"14–20 avril 2025"})
});

function assertApproved(station,period){
  if(!Object.hasOwn(NOAA_STATIONS,station))throw Error("Station NOAA inconnue ou non autorisée.");
  if(!Object.hasOwn(NOAA_WINDOWS,period))throw Error("Période NOAA non approuvée.");
}
export function noaaDataUrl({station="9414290",period="20250915",product}={}){
  assertApproved(station,period);
  if(!["hourly_height","predictions"].includes(product))throw Error("Produit NOAA non autorisé.");
  const p=NOAA_WINDOWS[period];
  const url=new URL(NOAA_DATA_API);
  const args={
    begin_date:p.begin,end_date:p.end,station,product,datum:"MLLW",
    time_zone:"gmt",units:"metric",application:"RadioDesIAScience",
    format:"json"
  };
  if(product==="predictions")args.interval="h";
  for(const [key,value] of Object.entries(args))url.searchParams.set(key,value);
  return url.toString();
}
function assertTime(str){
  // NOAA API date string is UTC after selecting gmt, ex "2025-09-15 00:00".
  if(typeof str!=="string" || !/^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(str))
    return null;
  const iso=str.replace(" ","T")+":00Z";
  const stamp=Date.parse(iso);
  if(!Number.isFinite(stamp) || new Date(stamp).toISOString()!==iso) return null;
  return stamp;
}

export function parseNoaaSeries(payload,product){
  if(!payload || typeof payload!=="object" || Array.isArray(payload))
    throw Error("Réponse NOAA inattendue.");
  if(payload.error)throw Error("Erreur NOAA : "+String(payload.error?.message||"non disponible").slice(0,180));
  const rows=payload[product==="predictions"?"predictions":"data"];
  if(!Array.isArray(rows))throw Error("Le produit NOAA ne contient aucune série valide.");
  const seen=new Map();
  let rejected=0,duplicates=0;
  for(const row of rows){
    const time=assertTime(row?.t);
    const value=Number(row?.v);
    if(time===null || row?.v===undefined || row?.v===null ||
       String(row.v).trim()==="" || !Number.isFinite(value) ||
       !Number.isFinite(time) || Math.abs(value)>25){
      rejected++;continue;
    }
    if(seen.has(time)){duplicates++;continue;}
    seen.set(time,value);
  }
  const samples=[...seen].sort((a,b)=>a[0]-b[0]).map(([epochMs,heightM])=>({epochMs,heightM}));
  if(samples.length===0)throw Error("Aucune hauteur NOAA numérique validable.");
  return {
    samples,rejected,duplicates,
    stationId:String(payload?.metadata?.id||""),
    stationName:String(payload?.metadata?.name||"")
  };
}
export function compareObservedToPredicted(observed,predicted,{minPairs=24}={}){
  if(!Array.isArray(observed?.samples) || !Array.isArray(predicted?.samples))
    throw Error("Deux séries NOAA sont nécessaires.");
  const obs=new Map(observed.samples.map(o=>[o.epochMs,o.heightM]));
  const pred=new Map(predicted.samples.map(o=>[o.epochMs,o.heightM]));
  const matched=[...obs].filter(([t])=>pred.has(t))
    .map(([epochMs,o])=>({epochMs,observedM:o,predictedM:pred.get(epochMs),
      residualM:o-pred.get(epochMs)})).sort((a,b)=>a.epochMs-b.epochMs);
  if(matched.length<minPairs)
    throw Error("Couverture insuffisante : "+matched.length+" paires (< "+minPairs+").");
  const n=matched.length;
  const residuals=matched.map(x=>x.residualM);
  const mean=x=>x.reduce((a,b)=>a+b,0)/x.length;
  const obsY=matched.map(x=>x.observedM);
  const preY=matched.map(x=>x.predictedM);
  const avgObs=mean(obsY),avgPred=mean(preY);
  const biasM=mean(residuals);
  const maeM=mean(residuals.map(Math.abs));
  const rmseM=Math.sqrt(mean(residuals.map(x=>x*x)));
  const varianceObs=mean(obsY.map(x=>(x-avgObs)**2));
  const variancePred=mean(preY.map(x=>(x-avgPred)**2));
  const covariance=mean(matched.map(x=>(x.observedM-avgObs)*(x.predictedM-avgPred)));
  const correlation=(varianceObs>0 && variancePred>0)
    ?covariance/Math.sqrt(varianceObs*variancePred):null;
  const nse=varianceObs>0?1-rmseM**2/varianceObs:null;
  const predictedCount=pred.size;
  const observedCount=obs.size;
  const coverage=n/predictedCount;
  const statuses={
    observed:"MESURÉ — NOAA hourly_height (produit horaire vérifié)",
    predicted:"RECONSTRUIT — prédiction harmonique NOAA, non mesure",
    comparison:"COMPARAISON_OBSERVATION_PREDICTION",
    scientificProof:false
  };
  return {
    n,observedCount,predictedCount,coverage,
    startUtc:new Date(matched[0].epochMs).toISOString(),
    endUtc:new Date(matched.at(-1).epochMs).toISOString(),
    datum:"MLLW",timeZone:"GMT",units:"m",
    biasM,maeM,rmseM,correlation,nse,
    statuses,
    matched,
    disclaimer:"Ces séries évaluent des prédictions harmoniques par rapport à des hauteurs d'eau "+
      "instrumentales. Les écarts incluent la météorologie, l'hydrodynamique, des erreurs "+
      "instrumentales et des biais possibles. Cela ne valide pas directement "+
      "a = 2GMR/d³, ni une expertise de niveau doctorat."
  };
}
async function readNoaaProduct(url,{fetcher=fetch,signal}={}){
  let response;
  try{
    response=await fetcher(url,{method:"GET",mode:"cors",cache:"no-store",
      signal,headers:{"Accept":"application/json"}});
  }catch(e){
    if(e?.name==="AbortError")throw e;
    throw Error("Accès aux données NOAA indisponible (réseau, CORS ou service) : "+String(e?.message||e));
  }
  if(!response.ok)throw Error("NOAA HTTP "+response.status+" : données indisponibles.");
  const raw=await response.text();
  if(raw.length>2_000_000)throw Error("Réponse NOAA trop grande.");
  try{return JSON.parse(raw);}
  catch{throw Error("Réponse NOAA non JSON.");}
}

export async function validateNoaaTides({station="9414290",period="20250915",
    fetcher=fetch,signal}={}){
  assertApproved(station,period);
  const measurementUrl=noaaDataUrl({station,period,product:"hourly_height"});
  const predictionUrl=noaaDataUrl({station,period,product:"predictions"});
  const [rawObserved,rawPredicted]=await Promise.all([
    readNoaaProduct(measurementUrl,{fetcher,signal}),
    readNoaaProduct(predictionUrl,{fetcher,signal})
  ]);
  const observed=parseNoaaSeries(rawObserved,"hourly_height");
  const predicted=parseNoaaSeries(rawPredicted,"predictions");
  if(observed.stationId && observed.stationId!==station)
    throw Error("La station de mesures NOAA ne correspond pas à la requête.");
  if(predicted.stationId && predicted.stationId!==station)
    throw Error("La station de prédiction NOAA ne correspond pas à la requête.");
  const compared=compareObservedToPredicted(observed,predicted);
  const window=NOAA_WINDOWS[period];
  const lower=Date.UTC(Number(window.begin.slice(0,4)),Number(window.begin.slice(4,6))-1,
    Number(window.begin.slice(6,8)));
  const upper=Date.UTC(Number(window.end.slice(0,4)),Number(window.end.slice(4,6))-1,
    Number(window.end.slice(6,8))+1);
  if(compared.matched.some(x=>x.epochMs<lower || x.epochMs>=upper))
    throw Error("Une série NOAA contient une date hors période demandée.");
  return {
    status:"DONNEES_NOAA_RECUES",
    station:NOAA_STATIONS[station],period:window.label,
    productMeasured:"hourly_height",productModel:"predictions",
    retrievedAt:new Date().toISOString(),
    measurementUrl,predictionUrl,
    observedQuality:{rejected:observed.rejected,duplicates:observed.duplicates},
    predictedQuality:{rejected:predicted.rejected,duplicates:predicted.duplicates},
    ...compared
  };
}
