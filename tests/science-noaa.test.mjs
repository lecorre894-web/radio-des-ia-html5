import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 NOAA_DATA_API,NOAA_STATIONS,NOAA_WINDOWS,noaaDataUrl,
 parseNoaaSeries,compareObservedToPredicted,validateNoaaTides
} from "../science-noaa.mjs";
import {noaaScientificReportText} from "../science-noaa-panel.mjs";

const anchor=Date.UTC(2025,8,15,0,0,0);
function hour(i){return new Date(anchor+i*3600000).toISOString().slice(0,16).replace("T"," ");}
function fixture(n=168,station="9414290"){
  const rows=Array.from({length:n},(_,i)=>{
    const p=1.5+0.85*Math.sin(2*Math.PI*i/12.42)+0.2*Math.cos(2*Math.PI*i/24);
    const o=p+0.045+0.12*Math.sin(2*Math.PI*i/61);
    return {t:hour(i),pred:p,obs:o};
  });
  return {
    observed:{metadata:{id:station,name:"San Francisco"},data:rows.map(r=>({t:r.t,v:r.obs.toFixed(3),s:"0.01",f:"0,0"}))},
    predicted:{metadata:{id:station,name:"San Francisco"},predictions:rows.map(r=>({t:r.t,v:r.pred.toFixed(3)}))}
  };
}
test("URLs NOAA : deux produits différents, mais même station, dates, MLLW, GMT et mètres",()=>{
  const o=new URL(noaaDataUrl({station:"9414290",period:"20250915",product:"hourly_height"}));
  const p=new URL(noaaDataUrl({station:"9414290",period:"20250915",product:"predictions"}));
  assert.equal(o.origin,"https://api.tidesandcurrents.noaa.gov");
  assert.equal(o.origin+p.pathname,NOAA_DATA_API);
  for(const key of ["station","begin_date","end_date","datum","time_zone","units","format"])
    assert.equal(o.searchParams.get(key),p.searchParams.get(key),key);
  assert.equal(o.searchParams.get("datum"),"MLLW");
  assert.equal(o.searchParams.get("time_zone"),"gmt");
  assert.equal(o.searchParams.get("units"),"metric");
  assert.equal(o.searchParams.get("product"),"hourly_height");
  assert.equal(p.searchParams.get("product"),"predictions");
  assert.equal(p.searchParams.get("interval"),"h");
  assert.equal(Object.keys(NOAA_STATIONS).length,2);
  assert.equal(Object.keys(NOAA_WINDOWS).length,2);
  assert.throws(()=>noaaDataUrl({station:"9999999",product:"predictions"}),/Station NOAA/);
  assert.throws(()=>noaaDataUrl({period:"20990101",product:"predictions"}),/Période NOAA/);
  assert.throws(()=>noaaDataUrl({product:"scripts"}),/Produit NOAA/);
});
test("Aucune observation inventée : rejeter valeurs, dates invalides et doublons",()=>{
  const source={metadata:{id:"9414290"},data:[
    {t:"2025-09-15 00:00",v:"1.3"},
    {t:"2025-09-15 00:00",v:"9.99"},
    {t:"2025-09-15 01:00",v:"NaN"},
    {t:"2025-09-15 02:00",v:""},
    {t:"2025-02-30 00:00",v:"1"},
    {t:"2025-09-15 03:00",v:"-0.3"}
  ]};
  const parsed=parseNoaaSeries(source,"hourly_height");
  assert.equal(parsed.samples.length,2);
  assert.equal(parsed.samples[0].heightM,1.3);
  assert.equal(parsed.samples[1].heightM,-0.3);
  assert.equal(parsed.duplicates,1);
  assert.equal(parsed.rejected,3);
  assert.throws(()=>parseNoaaSeries({error:{message:"No data"}},"hourly_height"),/No data/);
});
test("MAE, RMSE, biais, corrélation et NSE : calculs fermés",()=>{
  const t=i=>anchor+i*3600000;
  const o={samples:[1,2,3,4].map((x,i)=>({epochMs:t(i),heightM:x}))};
  const p={samples:[1.2,1.8,2.8,4.2].map((x,i)=>({epochMs:t(i),heightM:x}))};
  const m=compareObservedToPredicted(o,p,{minPairs:4});
  assert.equal(m.n,4);
  assert.ok(Math.abs(m.biasM)<1e-14);
  assert.ok(Math.abs(m.maeM-0.2)<1e-14);
  assert.ok(Math.abs(m.rmseM-0.2)<1e-14);
  assert.ok(m.correlation>0.98);
  assert.ok(m.nse>0.9);
  assert.equal(m.statuses.scientificProof,false);
});
test("Alignement strict des timestamps : aucune interpolation ni fusion arbitraire",()=>{
  const t=i=>anchor+i*3600000;
  const o={samples:Array.from({length:40},(_,i)=>({epochMs:t(i),heightM:i/100}))};
  const p={samples:Array.from({length:40},(_,i)=>({epochMs:t(i)+300000,heightM:i/100}))};
  assert.throws(()=>compareObservedToPredicted(o,p),/Couverture insuffisante/);
});
test("Deux téléchargements officiels simulés, résultats calculés avec données qui sont clairement des fixtures",async()=>{
  const f=fixture();
  let calls=0;
  const result=await validateNoaaTides({
    station:"9414290",period:"20250915",
    fetcher:async(url,options)=>{
      calls++;
      assert.equal(options.method,"GET");
      assert.equal(options.headers.Accept,"application/json");
      const product=new URL(url).searchParams.get("product");
      return new Response(JSON.stringify(product==="hourly_height"?f.observed:f.predicted),{status:200});
    }
  });
  assert.equal(calls,2);
  assert.equal(result.n,168);
  assert.equal(result.expectedHours,168);
  assert.equal(result.periodCoverage,1);
  assert.ok(result.rmseM>0.07 && result.rmseM<0.15);
  assert.ok(result.correlation>0.97);
  assert.equal(result.datum,"MLLW");
  assert.equal(result.status,"DONNEES_NOAA_RECUES");
  assert.match(result.disclaimer,/ne valide pas directement/);
  const output=noaaScientificReportText(result);
  assert.match(output,/MESURÉ/);
  assert.match(output,/RECONSTRUIT/);
  assert.match(output,/NOAA CO-OPS/);
  assert.match(output,/Doctorat ou expertise des modèles d'IA : NON ÉTABLI/);
});
test("Rejeter réponse NOAA tronquée, mauvaise station ou hors période",async()=>{
  const short=fixture(48);
  const wrong=fixture(168,"9414291");
  async function callFixture(f){
    return validateNoaaTides({fetcher:async(url)=>{
      const item=new URL(url).searchParams.get("product")==="predictions"?f.predicted:f.observed;
      return new Response(JSON.stringify(item));
    }});
  }
  await assert.rejects(callFixture(short),/Données temporelles insuffisantes/);
  await assert.rejects(callFixture(wrong),/station de mesures NOAA/);
  const outside=fixture(168);
  outside.observed.data[0].t="2026-09-15 00:00";
  outside.predicted.predictions[0].t="2026-09-15 00:00";
  await assert.rejects(callFixture(outside),/hors période demandée/);
});
test("Le réseau NOAA peut échouer sans rapport inventé ni téléchargement alternatif",async()=>{
  let requests=0;
  await assert.rejects(validateNoaaTides({
    fetcher:async()=>{requests++;throw Error("Network offline");}
  }),/NOAA indisponible|NOAA|Accès aux données/);
  assert.equal(requests,2);
});
test("La Radio conserve les cinq moteurs et ne télécharge pas NOAA au démarrage",()=>{
  const html=readFileSync(new URL("../tchat.html",import.meta.url),"utf8");
  const js=readFileSync(new URL("../tchat-distant.mjs",import.meta.url),"utf8");
  const panel=readFileSync(new URL("../science-noaa-panel.mjs",import.meta.url),"utf8");
  for(const engine of ["puter","research-local","horde","pollinations","sparktiates"])
    assert.ok(html.includes('value="'+engine+'"'));
  for(const id of ["scienceNoaaStation","scienceNoaaPeriode","scienceNoaaLancer",
    "scienceNoaaEtat","scienceNoaaResultats","scienceNoaaCopier","scienceNoaaStop"])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(js,/initNoaaValidation\(\)/);
  assert.match(panel,/button\.addEventListener\("click",async\(\)=>\{/);
  assert.match(panel,/validateNoaaTides\(/);
  assert.match(panel,/Aucune mesure NOAA téléchargée/);
  assert.doesNotMatch(panel,/localStorage|sessionStorage|chatWithHorde|chatWithPollinations/);
  assert.match(html,/ChatGPT et René Le Corre®/);
});
