import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";

const read=path=>readFileSync(new URL(path, import.meta.url),"utf8");

test("Banc d'essai Horde indépendant : aucune substitution des pages existantes",()=>{
  const diag=read("../aihorde-test.html");
  const salon=read("../tchat.html");
  const radio=read("../index.html");
  assert.match(diag,/id="modeleHorde"/);
  assert.match(diag,/id="lancerTest"/);
  assert.match(diag,/id="etatHorde"/);
  assert.match(diag,/aihorde-test\.mjs\?v=1/);
  assert.match(salon,/js\.puter\.com\/v2/);
  assert.match(salon,/id="moteurDialogue"/);
  assert.match(salon,/id="fil"/);
  assert.match(radio,/radio-public\.js/);
  assert.doesNotMatch(salon,/aihorde-test\.mjs/);
  assert.doesNotMatch(radio,/aihorde-test\.mjs/);
});
test("L'API anonyme n'envoie rien automatiquement et ne collecte pas l'historique",()=>{
  const module=read("../aihorde-test.mjs");
  assert.match(module,/oai\.aihorde\.net\/v1/);
  assert.match(module,/0000000000/);
  assert.match(module,/\/chat\/completions/);
  assert.match(module,/\/models/);
  assert.match(module,/voirModeles"\)\.addEventListener\("click"/);
  assert.match(module,/lancerTest"\)\.addEventListener\("click"/);
  assert.doesNotMatch(module,/localStorage|sessionStorage|window\.puter|radio-salon-distant-v1/);
  assert.doesNotMatch(module,/void listModels\(\);\s*$/);
});
test("Le JavaScript du banc d'essai a une syntaxe valide",()=>{
  execFileSync(process.execPath,["--check",new URL("../aihorde-test.mjs",import.meta.url).pathname],{stdio:"pipe"});
});
