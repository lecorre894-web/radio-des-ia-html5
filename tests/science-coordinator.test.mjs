import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  TIDE_REFERENCE,TIDE_TEST_QUESTION,computeLunarTide,makeSciencePrompts,
  extractTidalEstimate,inspectScientificResponse,compareResearchOutputs
} from "../science-coordinator.mjs";
import {scienceReportText} from "../science-panel.mjs";

test("Calcul gravitationnel déterministe : résultat indépendant des réponses IA",()=>{
  const d=computeLunarTide();
  assert.equal(d.kind,"lunar_tides");
  assert.equal(d.status,"RECONSTRUIT");
  assert.equal(d.units,"m/s²");
  assert.ok(Math.abs(d.firstOrder-1.1002213438072701e-6)<1e-15);
  assert.ok(Math.abs(d.exactNearSide-1.128190974777255e-6)<1e-15);
  assert.ok(Math.abs(d.relativeDelta-0.025421821824685775)<1e-10);
  assert.ok(d.referenceUrls.some(x=>x.includes("nasa.gov")));
  assert.ok(d.referenceUrls.some(x=>x.includes("dlr.de")));
  assert.ok(TIDE_TEST_QUESTION.includes("accélération différentielle"));
  assert.equal(TIDE_REFERENCE.distanceM,384400000);
});
test("Un oracle numérique invalide est rejeté avant publication",()=>{
  assert.throws(()=>computeLunarTide({...TIDE_REFERENCE,distanceM:0}),/invalides/);
  assert.throws(()=>computeLunarTide({...TIDE_REFERENCE,distanceM:1}),/invalides/);
  assert.throws(()=>computeLunarTide({...TIDE_REFERENCE,moonMassKg:NaN}),/invalides/);
});
test("Aucune estimation IA n'est inventée à partir d'un chiffre dans le texte",()=>{
  assert.equal(extractTidalEstimate("M=7.3483e22 kg"),null);
  assert.equal(extractTidalEstimate("ESTIMATION_MAREE_M_S2=1.10022e-6"),1.10022e-6);
  assert.equal(extractTidalEstimate("Une conclusion.\nESTIMATION_MAREE_M_S2 = 1,1e-6"),1.1e-6);
  assert.equal(extractTidalEstimate("ESTIMATION_MAREE_M_S2=-1.1e-6"),null);
  assert.equal(extractTidalEstimate("ESTIMATION_MAREE_M_S2=0"),null);
});
test("Audit numérique compatible et divergent : statut non probant, même si proche",()=>{
  const close=inspectScientificResponse({
    provider:"AI Horde",model:"qwen",
    caseId:"lunar_tides",elapsedMs:6500,
    text:"Une dérivation et un calcul.\nESTIMATION_MAREE_M_S2=1.10e-6"
  });
  assert.equal(close.numericStatus,"COMPATIBLE_NUMERIQUEMENT");
  assert.equal(close.resultStatus,"CANDIDAT");
  assert.ok(close.relativeError<0.01);
  const wrong=inspectScientificResponse({
    provider:"SPARKTIATES / Ollama",model:"gemma",
    caseId:"lunar_tides",elapsedMs:330,
    text:"Un calcul erroné.\nESTIMATION_MAREE_M_S2=3.3e-6"
  });
  assert.equal(wrong.numericStatus,"ECART_NUMERIQUE");
  const verdict=compareResearchOutputs([close,wrong]);
  assert.equal(verdict.usableResponses,2);
  assert.equal(verdict.separateProviders,2);
  assert.equal(verdict.independentScientificValidation,false);
  assert.equal(verdict.numericDisagreement,true);
});
test("Une seule IA ou deux sorties du même fournisseur ne constituent pas une validation indépendante",()=>{
  const one=inspectScientificResponse({
    provider:"AI Horde",model:"model a",caseId:"open_research",
    text:"Une hypothèse à tester."
  });
  assert.equal(one.numericStatus,"INCONNU");
  assert.equal(compareResearchOutputs([one]).separateProviders,1);
  assert.equal(compareResearchOutputs([one]).independentScientificValidation,false);
  const same=compareResearchOutputs([one,{...one,model:"autre modèle"}]);
  assert.equal(same.separateProviders,1);
  assert.equal(same.independentScientificValidation,false);
  assert.match(same.conclusion,/seul fournisseur/i);
});
test("Question libre ne reçoit pas de fausse vérification gravitationnelle",()=>{
  const prompts=makeSciencePrompts({
    caseId:"open_research",question:"Quelle expérience testerait la glace polaire ?"
  });
  assert.match(prompts.at(-1).content,/glace polaire/);
  assert.doesNotMatch(prompts.at(-1).content,/ESTIMATION_MAREE_M_S2/);
  const tides=makeSciencePrompts({caseId:"lunar_tides",question:"Bonjour"});
  assert.match(tides.at(-1).content,/ESTIMATION_MAREE_M_S2/);
  assert.match(tides.at(-1).content,/G=6\.67430e-11/);
  assert.throws(()=>makeSciencePrompts({caseId:"open_research",question:""}),/requise/);
});
test("Rapport reproductible, avec sources, résultats et limites scientifiques",()=>{
  const result=inspectScientificResponse({provider:"AI Horde",model:"Test 9B",
    text:"ESTIMATION_MAREE_M_S2=1.1e-6",elapsedMs:1700});
  const report={
    caseId:"lunar_tides",createdAt:"14/11/2026 18:00",question:TIDE_TEST_QUESTION,
    reference:computeLunarTide(),results:[result],failures:[],
    comparison:compareResearchOutputs([result])
  };
  const output=scienceReportText(report);
  assert.match(output,/NASA|nasa\.gov/i);
  assert.match(output,/RECONSTRUIT/);
  assert.match(output,/CANDIDAT/);
  assert.match(output,/Validation indépendante des affirmations scientifiques : NON/);
  assert.doesNotMatch(output,/sk_[a-z0-9]{5,}/i);
});
test("L'interface est ajoutée au même Salon, sans supprimer les cinq moteurs",()=>{
  const html=readFileSync(new URL("../tchat.html",import.meta.url),"utf8");
  const js=readFileSync(new URL("../tchat-distant.mjs",import.meta.url),"utf8");
  const module=readFileSync(new URL("../science-panel.mjs",import.meta.url),"utf8");
  for(const id of ["scienceCoord","scienceCas","scienceQuestion","scienceQuestionWrap",
    "scienceHorde","scienceSparktiates","scienceLancer","scienceStop","scienceCopier",
    "scienceResultats","scienceEtat","scienceDerniere"]){
    assert.ok(html.includes('id="'+id+'"'),"Élément "+id+" préservé");
  }
  for(const engine of ["puter","research-local","horde","pollinations","sparktiates"]){
    assert.ok(html.includes('value="'+engine+'"'),"Moteur "+engine+" préservé");
  }
  for(const id of ["fil","moi","tour","infini","debattre","arreter","passerHorde"])
    assert.ok(html.includes('id="'+id+'"'),"Salon "+id);
  assert.match(html,/ChatGPT et René Le Corre®/);
  assert.match(js,/initScientificCoordinator\(\{getConfig:/);
  assert.match(module,/Promise\.allSettled\(task\)/);
  assert.match(module,/chatWithHorde\(/);
  assert.match(module,/sparktiatesChat\(/);
  assert.doesNotMatch(module,/localStorage|sessionStorage|window\.puter|chatWithPollinations/);
  assert.match(module,/currentController\?\.abort\(\)/);
});
