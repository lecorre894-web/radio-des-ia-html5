/**
 * NOAA CO-OPS live verification runner.
 * Real network calls only. Fails closed on network/API/data problems.
 * Run "node scripts/noaa-live-check.mjs" from a network-connected host.
 */
import {validateNoaaTides,NOAA_REFERENCE_URL} from "../science-noaa.mjs";
const cases=[
  {station:"9414290",period:"20250915"},
  {station:"8518750",period:"20250915"},
  {station:"9414290",period:"20250414"},
  {station:"8518750",period:"20250414"}
];
console.log("SPARKTIATES — observational verification (NOAA instrument data)");
console.log("Official documentation:",NOAA_REFERENCE_URL);
let succeeded=0;
for(const c of cases){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),45000);
  try{
    const d=await validateNoaaTides({...c,signal:controller.signal,
      fetcher:async(url,options)=>{
        const result=await fetch(url,{
          ...options,
          headers:{...options.headers,Origin:"https://lecorre894-web.github.io"}
        });
        const cors=result.headers.get("access-control-allow-origin");
        console.log("NOAA_BROWSER_CORS",JSON.stringify({product:new URL(url).searchParams.get("product"),
          station:c.station,allowedOrigin:cors||null}));
        return result;
      }
    });
    succeeded++;
    console.log(JSON.stringify({
      status:d.status,station:d.station,period:d.period,retrievedAt:d.retrievedAt,
      observed:d.observedCount,predicted:d.predictedCount,matched:d.n,
      coveragePercent:Number((d.periodCoverage*100).toFixed(1)),
      biasCm:Number((d.biasM*100).toFixed(3)),
      maeCm:Number((d.maeM*100).toFixed(3)),
      rmseCm:Number((d.rmseM*100).toFixed(3)),
      correlation:d.correlation,nse:d.nse,
      sourceMeasurements:d.measurementUrl,sourcePredictions:d.predictionUrl,
      observedStatus:d.statuses.observed,predictedStatus:d.statuses.predicted,
      independentScientificValidation:d.statuses.scientificProof
    }));
  }catch(e){
    console.error("LIVE_NOAA_ERROR",JSON.stringify({
      station:c.station,reason:String(e?.message||e)
    }));
    process.exitCode=1;
  }finally{clearTimeout(timeout);}
}
console.log("LIVE_NOAA_STATIONS_VALIDATED="+succeeded+"/"+cases.length);
if(succeeded!==cases.length)process.exitCode=1;
