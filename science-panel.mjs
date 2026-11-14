/**
 * SPARKTIATES — scientific coordination user interface.
 * Independent opt-in panel in the existing Radio, without altering the Salon.
 * No arbitrary script execution, payment, hidden transmission or secret storage.
 */
import {
  TIDE_TEST_QUESTION, computeLunarTide, makeSciencePrompts,
  inspectScientificResponse, compareResearchOutputs
} from "./science-coordinator.mjs?v=1";
import {chatWithHorde} from "./tchat-horde.mjs?v=3";
import {sparktiatesChat} from "./tchat-sparktiates.mjs?v=1";

const $=id=>document.getElementById(id);
const LABELS=Object.freeze({lunar_tides:"Étude quantitative des marées",
  open_research:"Question scientifique libre"});
let currentController=null;
let latestReport=null;

function line(host,text,classname="") {
  const p=document.createElement("p");
  if(classname)p.className=classname;
  p.textContent=text;
  host.append(p);
  return p;
}
function renderNumber(value) {
  return Number.isFinite(value)?value.toExponential(6):"INCONNU";
}
function status(message){$("scienceEtat").textContent=String(message);}
function busy(flag){
  $("scienceLancer").disabled=flag;
  $("scienceStop").disabled=!flag;
  $("scienceCas").disabled=flag;
  $("scienceQuestion").disabled=flag;
  $("scienceHorde").disabled=flag;
  $("scienceSparktiates").disabled=flag;
  $("scienceCopier").disabled=flag || !latestReport;
}

export function scienceReportText(report) {
  if(!report || typeof report!=="object")return "";
  const r=report;
  const lines=[
    "SPARKTIATES — Rapport scientifique expérimental",
    "Date : "+r.createdAt,
    "Cas : "+(LABELS[r.caseId]||r.caseId),
    "Question : "+r.question,
    "Audit : calcul déterministe indépendant des textes générés"
  ];
  if(r.reference){
    lines.push("Statut du résultat numérique : RECONSTRUIT (non MESURÉ).");
    lines.push("a premier ordre : "+renderNumber(r.reference.firstOrder)+" m/s²");
    lines.push("a exacte (sur l'axe, approximation sphérique) : "+
      renderNumber(r.reference.exactNearSide)+" m/s²");
    lines.push("Écart modèle analytique (%) : "+(r.reference.relativeDelta*100).toFixed(3));
    lines.push("Sources des constantes : "+r.reference.referenceUrls.join(" ; "));
  } else lines.push("Calcul indépendant : INCONNU pour ce domaine.");
  for(const result of r.results){
    lines.push("---- "+result.provider+" / "+result.model+
      " ("+String(result.elapsedMs)+" ms) ----");
    lines.push("Classement : CANDIDAT. Test numérique : "+result.numericStatus);
    if(result.estimate!==null){
      lines.push("Estimation déclarée : "+renderNumber(result.estimate)+" m/s²");
      lines.push("Écart relatif à l'approximation : "+(result.relativeError*100).toFixed(3)+" %");
    }
    lines.push(result.text);
  }
  for(const failure of r.failures)
    lines.push("Échec fournisseur "+failure.provider+" : "+failure.message);
  lines.push("Synthèse : "+r.comparison.conclusion);
  lines.push("Validation indépendante des affirmations scientifiques : NON.");
  return lines.join("\n");
}

function renderReport(report){
  const host=$("scienceResultats");
  host.replaceChildren();
  const h=document.createElement("h3");h.textContent="Rapport SPARKTIATES · "+(LABELS[report.caseId]||"");host.append(h);
  line(host,"Rendu : "+report.createdAt+" · calculs et réponses clairement séparés.");
  if(report.reference){
    const ref=report.reference;
    line(host,"RECONSTRUIT — a premier ordre = "+renderNumber(ref.firstOrder)+
      " m/s² ; a exacte (axe proche) = "+renderNumber(ref.exactNearSide)+" m/s².");
    line(host,"Écart des deux approximations analytiques : "+
      (100*ref.relativeDelta).toFixed(3)+" %. Ce n'est pas une hauteur de marée mesurée.");
    const sources=document.createElement("small");
    sources.textContent="Références de constantes : NASA, DLR, NIST. Voir documentation du projet.";
    host.append(sources);
  }else{
    line(host,"INCONNU — Aucun oracle numérique validé pour ce domaine. "+
      "La présence de plusieurs réponses IA ne remplace pas un protocole scientifique.");
  }
  for(const item of report.results){
    const title=document.createElement("h4");
    title.textContent=item.provider+" · "+item.model+" · "+
      (item.elapsedMs===null?"durée inconnue":Math.round(item.elapsedMs/1000)+" s");
    host.append(title);
    line(host,"CANDIDAT — contrôle numérique : "+item.numericStatus+
      (item.estimate===null?"":", a="+renderNumber(item.estimate)+
        " m/s² (écart "+(100*item.relativeError).toFixed(2)+" %)"));
    const pre=document.createElement("pre");
    pre.className="science-reponse";
    pre.textContent=item.text;
    host.append(pre);
  }
  for(const failure of report.failures)
    line(host,failure.provider+" : "+failure.message,"science-erreur");
  line(host,"BILAN — "+report.comparison.conclusion);
  if(report.comparison.numericDisagreement)
    line(host,"DÉSACCORD NUMÉRIQUE : les valeurs déclarées par les modèles diffèrent de plus de 5 %.");
  line(host,"Statut de validation des conclusions scientifiques : INCONNU. "+
    "Un accord entre IA ne prouve pas une mesure, une expérience ni un doctorat.");
}

function selectionError(caseId,question){
  if(caseId==="open_research" && !question.trim())
    return "Saisis ta question scientifique ; aucun texte n'est envoyé sans question.";
  if(question.length>1500)
    return "Question trop longue : limite 1 500 caractères.";
  return "";
}

export function initScientificCoordinator({getConfig}={}){
  if(typeof getConfig!=="function")throw Error("Configuration des moteurs manquante.");
  const host=$("scienceResultats");
  if(!host)throw Error("Panneau de résultats scientifiques manquant.");
  status("Prêt. Lance une étude volontairement ; aucun moteur IA n'est contacté au chargement.");
  $("scienceCas").addEventListener("change",()=>{
    const custom=$("scienceCas").value==="open_research";
    $("scienceQuestionWrap").hidden=!custom;
    status(custom
      ?"Question libre : seuls les modèles produisent des candidats ; aucun contrôle numérique générique n'est revendiqué."
      :"Test des marées : calcul déterministe et éventuelles réponses de modèles, sans facturation Puter/Pollen.");
  });
  $("scienceDerniere").addEventListener("click",()=>{
    const config=getConfig();
    const last=(config?.history||[]).filter(m=>m?.origin==="human"&&typeof m.texte==="string").at(-1);
    $("scienceCas").value="open_research";
    $("scienceQuestionWrap").hidden=false;
    $("scienceQuestion").value=String(last?.texte||"").slice(0,1500);
    status(last?"Dernière question copiée dans ce panneau, pas envoyée. Relis-la avant le test."
      :"Aucune question humaine conservée dans le Salon.");
  });
  $("scienceStop").addEventListener("click",()=>{
    currentController?.abort();
    status("Annulation demandée. Les moteurs peuvent terminer une tâche déjà reçue ; aucun réessai automatique.");
  });
  $("scienceCopier").addEventListener("click",async()=>{
    if(!latestReport)return;
    try{
      await navigator.clipboard.writeText(scienceReportText(latestReport));
      status("Rapport copié. Les éventuelles données de ta question ne sont pas publiées.");
    }catch{
      status("Copie refusée par le navigateur. Le rapport demeure visible ci-dessous.");
    }
  });
  $("scienceLancer").addEventListener("click",()=>void runStudy(getConfig));
}

async function runStudy(getConfig){
  if(currentController)return;
  const caseId=$("scienceCas").value;
  const supplied=$("scienceQuestion").value;
  const error=selectionError(caseId,supplied);
  if(error){status(error);return;}
  const question=caseId==="lunar_tides"?TIDE_TEST_QUESTION:supplied.trim();
  const config=getConfig()||{};
  const useHorde=$("scienceHorde").checked;
  const useSparktiates=$("scienceSparktiates").checked;
  const providers=[];
  const failures=[];
  // Fail closed: no model inferred, no trial call charged by another provider.
  if(useHorde){
    if(config.hordeModel && config.hordeVerified){
      providers.push({provider:"AI Horde",model:config.hordeModel,
        execute:({signal,messages})=>chatWithHorde({
          model:config.hordeModel,messages,maxTokens:400,signal
        })});
    }else failures.push({provider:"AI Horde",
      message:"Aucun modèle communautaire vérifié. Actualise la liste AI Horde dans le Salon."});
  }
  if(useSparktiates){
    if(config.sparktiates?.verified && config.sparktiates.endpoint &&
      config.sparktiates.token && config.sparktiates.model){
      const {endpoint,token,model}=config.sparktiates;
      providers.push({provider:"SPARKTIATES / Ollama",model,
        execute:({signal,messages})=>sparktiatesChat({
          endpoint,token,model,messages,maxTokens:500,signal
        })});
    }else failures.push({provider:"SPARKTIATES / Ollama",
      message:"Serveur personnel non connecté ou modèle non vérifié. Aucun calcul distant simulé."});
  }
  currentController=new AbortController();
  latestReport=null;
  busy(true);
  $("scienceResultats").replaceChildren();
  const begin=Date.now();
  status("Calcul des constantes et demandes explicites : "+
    providers.map(p=>p.provider).join(" + ")+
    (providers.length?" ; requêtes concurrentes.":" ; calcul numérique seulement."));
  try{
    const reference=caseId==="lunar_tides"?computeLunarTide():null;
    const task=providers.map(async entry=>{
      const started=Date.now();
      const prompt=makeSciencePrompts({question,caseId,role:"analyse critique et mathématique"});
      const result=await entry.execute({messages:prompt,signal:currentController.signal});
      return inspectScientificResponse({
        provider:entry.provider,model:result.model||entry.model,
        text:result.text,elapsedMs:Date.now()-started,caseId,
        reference:reference||undefined
      });
    });
    const settled=await Promise.allSettled(task);
    const results=[];
    settled.forEach((out,i)=>{
      if(out.status==="fulfilled")results.push(out.value);
      else failures.push({
        provider:providers[i].provider,
        message:out.reason?.name==="AbortError"
          ?"Annulé à la demande de l'utilisateur.":
          String(out.reason?.message||out.reason).slice(0,400)
      });
    });
    // Never retain the private SPARKTIATES bearer token in the report.
    latestReport={
      createdAt:new Date().toLocaleString("fr-FR"),
      caseId, question, reference, results, failures,
      comparison:compareResearchOutputs(results),
      totalElapsedMs:Date.now()-begin
    };
    renderReport(latestReport);
    status("Audit terminé : "+results.length+" réponse(s) de modèles, "+
      failures.length+" indisponibilité(s), calcul déterministe "+
      (reference?"PASS":"non applicable")+". Aucune conclusion doctorale automatique.");
  }catch(e){
    status("Coordination interrompue : "+String(e?.message||e));
  }finally{
    currentController=null;
    busy(false);
  }
}
