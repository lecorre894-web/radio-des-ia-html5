import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {updateLineageMemory,archiveLineageSession} from "../tchat-lineage.mjs";

const html=readFileSync(new URL("../tchat.html",import.meta.url),"utf8");
const script=readFileSync(new URL("../tchat-distant.mjs",import.meta.url),"utf8");

function createHarness(){
  const nodes=new Map();
  class NodeMock{
    constructor(){this.value="";this.textContent="";this.children=[];this.className="";}
    replaceChildren(...children){this.children=[...children];}
    append(...children){this.children.push(...children);}
  }
  const element=id=>{
    if(!nodes.has(id))nodes.set(id,new NodeMock());
    return nodes.get(id);
  };
  const document={getElementById:element,createElement:()=>new NodeMock()};
  const values=new Map();
  const localStorage={
    getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),
    removeItem:key=>values.delete(key)
  };
  const source=script
    .replace(/^import [^\n]*\n/gm,"")
    .replace(/\ninit\(\);\s*$/,"\nreturn {addHuman,saveDraft,restoreDraft,state};");
  assert.match(source,/return \{addHuman,saveDraft,restoreDraft,state\};/);
  const app=new Function("document","localStorage","window","PERPLEXITY","KIMI",
      "addPerplexity","addKimi","buildPrompt","responseText","cleanAnswer","qualityIssue",
      "updateLineageMemory","archiveLineageSession",source)(
    document,localStorage,{}, {nom:"Perplexity",modele:"perplexity/sonar-pro"},
    {nom:"Kimi",modele:"moonshotai/kimi-k3.1-pro"},a=>a,a=>a,()=>[],()=>"",
    x=>x,()=>false,updateLineageMemory,archiveLineageSession
  );
  app.state.busy=true; // Le message est enregistré sans déclencher un appel au fournisseur.
  return {app,element,values};
}
test("Entrée ne déclenche jamais la transmission et textarea reste multiligne",()=>{
  assert.match(html,/<textarea id="moi"[^>]*enterkeyhint="enter"/);
  assert.match(html,/<button[^>]*id="parler"[^>]*>📨 Envoyer le message<\/button>/);
  assert.doesNotMatch(script,/\$\("moi"\)\.addEventListener\("keydown"/);
  assert.doesNotMatch(script,/event\.key\s*===?\s*["']Enter["']/);
  assert.match(script,/\$\("parler"\)\.addEventListener\("click",addHuman\)/);
});
test("un message multiligne est enregistré sans modifier ses retours chariot",()=>{
  const {app,element,values}=createHarness();
  const draft="Première ligne\n\nDeuxième ligne\nTroisième ligne";
  element("moi").value=draft;
  app.saveDraft();
  assert.equal(values.get("radio-salon-brouillon-v1"),draft);
  app.addHuman();
  assert.equal(app.state.messages.length,1);
  assert.equal(app.state.messages[0].texte,draft);
  assert.equal(element("moi").value,"");
  assert.equal(values.has("radio-salon-brouillon-v1"),false);
});
test("un brouillon persiste sans envoi et peut être restauré",()=>{
  const {app,element,values}=createHarness();
  const message="Un texte écrit\nsur plusieurs lignes";
  element("moi").value=message;app.saveDraft();
  element("moi").value="";app.restoreDraft();
  assert.equal(element("moi").value,message);
  assert.equal(app.state.messages.length,0);
  assert.equal(values.get("radio-salon-brouillon-v1"),message);
});
test("retour chariot seul : aucune publication et aucune perte du brouillon",()=>{
  const {app,element,values}=createHarness();
  element("moi").value="\n\n";app.saveDraft();app.addHuman();
  assert.equal(app.state.messages.length,0);
  assert.equal(element("moi").value,"\n\n");
  assert.equal(values.get("radio-salon-brouillon-v1"),"\n\n");
});
test("la Radio garde ses cinq intervenants et les contrôles de tours",()=>{
  assert.match(script,/nom:"Cairn"/);
  assert.match(script,/nom:"Brume"/);
  assert.match(script,/nom:"Aurore"/);
  assert.match(script,/\.\.\.PERPLEXITY/);
  assert.match(script,/\.\.\.KIMI/);
  assert.match(script,/launchInfinity\("debate"\)/);
  assert.match(script,/documentManager\.prepare\(messages\)/);
});
