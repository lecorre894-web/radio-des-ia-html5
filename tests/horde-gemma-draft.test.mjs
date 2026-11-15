import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildHordeMessages} from "../tchat-horde.mjs";
import {detectHordeMetaOutput,generalistRetryMessages} from "../tchat-horde-quality.mjs";

const screenshotDraft=[
  '* User says: "Bonjour. Donne d\'abord la réponse utile, sans présentation personnelle ni longue charte méthodologique."',
  '(Hello. Give the useful answer first, without personal introduction or long methodological charter.)',
  '* Constraint: The user hasn\'t actually asked a specific question yet, just set the ground rules for the interaction.',
  '* System prompt constraints:',
  '* Respond in French.',
  '* Direct and clear language.',
  '* No copying/translating the question.',
  '* No working notes.',
  '* No describing role/instructions/preparation.',
  '* No fake sources/web searches/doctorates.',
  '* The user greeted me and gave a formatting instruction.',
  '* Since there is no actual question to answer yet, I need to acknowledge the greeting and signal readiness.',
  '* *Draft 1 (Too long):* Bonjour. Je suis prêt.',
  '* *Draft 2 (Better):* Bonjour. Je suis prêt. Quelle est votre question ?',
  '* *Draft 3 (Strict adherence to "useful answer first"):* Since there is no question.',
  '* Keep it extremely brief.',
  '* The user said "Réponds à cette intervention humaine en priorité".'
].join("\n");

test("Capture du 15 novembre : les notes internes et trois brouillons de Gemma sont rejetés",()=>{
  assert.match(detectHordeMetaOutput(screenshotDraft),/consignes|commenté/);
  assert.match(detectHordeMetaOutput("   * Draft 2 (Better): Bonjour. Je suis prêt."),/consignes|commenté/);
  assert.match(detectHordeMetaOutput("  * System prompt constraints:\n  * Respond in French"),/consignes|commenté/);
  assert.match(detectHordeMetaOutput("User says: Bonjour"),/consignes|commenté/);
});

test("Un Bonjour est envoyé tel quel, sans recopie de consignes dans le message utilisateur",()=>{
  const prompt=buildHordeMessages({
    history:[{origin:"human",texte:"Bonjour"}],
    topic:"La Lune",includeHistory:false
  });
  assert.equal(prompt.length,2);
  assert.equal(prompt[1].content,"Bonjour");
  assert.doesNotMatch(prompt[1].content,/Donne d'abord|Réponds à cette intervention|Sujet directeur/);
  assert.ok(prompt[0].content.length<700);
  assert.match(prompt[0].content,/courte salutation/);
  const retry=generalistRetryMessages({history:[{origin:"human",texte:"Bonjour"}]});
  assert.equal(retry[1].content,"Bonjour");
  assert.match(retry[0].content,/simple salutation/);
});

test("Une question lunaire reste scientifique, une réponse valide n'est pas bloquée",()=>{
  const prompt=buildHordeMessages({history:[{origin:"human",texte:"Pourquoi voit-on environ 59 % de la surface lunaire ?"}],topic:"La Lune"});
  assert.match(prompt[0].content,/Astrophysique/);
  assert.match(prompt[1].content,/59 %/);
  assert.equal(detectHordeMetaOutput("La libration lunaire résulte surtout de la variation de vitesse angulaire sur une orbite elliptique et d'un angle de vue changeant."),"");
  assert.equal(detectHordeMetaOutput("Bonjour ! Comment puis-je vous aider aujourd'hui ?"),"");
});

test("Les anciens brouillons sont masqués uniquement à l'affichage, pas effacés de l'historique",()=>{
  const source=readFileSync(new URL("../tchat-distant.mjs",import.meta.url),"utf8");
  assert.match(source,/function lastHordeBadAnswer\(\)/);
  assert.match(source,/lastHordeBadAnswer\(\)\)/);
  assert.match(source,/const hordeBad=m.origin==="ai"/);
  assert.match(source,/summary\.textContent="Afficher le texte original \(conservé dans l'historique\)"/);
  assert.match(source,/raw\.textContent=String\(m\.texte\|\|""\)/);
  assert.match(source,/state\.messages=state\.messages\.filter\(m=>m!==current\)/);
  assert.doesNotMatch(source,/localStorage\.removeItem\("radio-salon-distant-v1"\)/);
});
