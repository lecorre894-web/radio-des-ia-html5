import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {updateLineageMemory,archiveLineageSession} from "../tchat-lineage.mjs";

const html=readFileSync(new URL("../tchat.html",import.meta.url),"utf8");
const script=readFileSync(new URL("../tchat-distant.mjs",import.meta.url),"utf8");

function harness(){
  const nodes=new Map();
  class Element {
    constructor(){this.value="";this.textContent="";this.children=[];this.disabled=false;this.className="";}
    replaceChildren(...children){this.children=[...children];}
    append(...children){this.children.push(...children);}
  }
  const el=id=>{
    if(!nodes.has(id))nodes.set(id,new Element());
    return nodes.get(id);
  };
  const document={getElementById:el,createElement:()=>new Element()};
  const values=new Map();
  const localStorage={
    getItem:k=>values.has(k)?values.get(k):null,
    setItem:(k,v)=>values.set(k,String(v)),
    removeItem:k=>values.delete(k)
  };
  const window={};
  const source=script.replace(/^import [^\n]*\n/gm,"")
    .replace(/\ninit\(\);\s*$/,"\nreturn {addHuman,retryLastHuman,engineReadiness,state};");
  assert.match(source,/return \{addHuman,retryLastHuman,engineReadiness,state\};/);
  const app=new Function("document","localStorage","window","PERPLEXITY","KIMI",
    "addPerplexity","addKimi","buildPrompt","responseText","cleanAnswer","qualityIssue",
    "updateLineageMemory","archiveLineageSession",source)(
      document,localStorage,window,
      {nom:"Perplexity",modele:"perplexity/sonar-pro"},
      {nom:"Kimi",modele:"moonshotai/kimi-k3.1-pro"},
      x=>x,x=>x,()=>[],()=>"",x=>x,()=>false,
      updateLineageMemory,archiveLineageSession
    );
  return {app,el,window,values};
}

test("Le diagnostic et le bouton de reprise apparaissent directement près du champ",()=>{
  for(const id of ["moi","parler","moteurComposer","reessayerDernier","etatComposer"])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(html,/href="#modeRecherche">⚙️ Configurer le moteur IA/);
  assert.match(script,/\$\("reessayerDernier"\)\.addEventListener\("click",retryLastHuman\)/);
});
test("Sans moteur prêt, envoyer sauvegarde la question et affiche la cause sans fausse réponse",()=>{
  const {app,el,values}=harness();
  assert.equal(app.engineReadiness().ready,false);
  assert.match(app.engineReadiness().reason,/Connecte|connecté/i);
  el("moi").value="Pourquoi la Lune provoque-t-elle des marées ?";
  app.addHuman();
  assert.equal(app.state.messages.length,1);
  assert.equal(app.state.messages[0].origin,"human");
  assert.equal(app.state.messages[0].texte,"Pourquoi la Lune provoque-t-elle des marées ?");
  assert.ok(values.has("radio-salon-distant-v1"));
  assert.match(el("etatComposer").textContent,/AUCUNE RÉPONSE IA envoyée/);
  assert.match(el("etatComposer").textContent,/Puter/);
  assert.match(el("moteurComposer").textContent,/PAS ENCORE PRÊT/);
  assert.equal(el("reessayerDernier").disabled,false);
});
test("La reprise sans moteur ne duplique pas le dernier message",()=>{
  const {app,el}=harness();
  el("moi").value="Bonjour";
  app.addHuman();
  app.retryLastHuman();
  assert.equal(app.state.messages.length,1);
  assert.match(el("etatComposer").textContent,/Dernière question conservée/);
});
test("Un moteur AI Horde non configuré ne transmet pas des messages à un travailleur",()=>{
  const {app,el}=harness();
  app.state.engineChoice="horde";
  assert.equal(app.engineReadiness().ready,false);
  el("moi").value="Bonsoir";
  app.addHuman();
  assert.equal(app.state.messages.length,1);
  assert.match(el("etatComposer").textContent,/Actualiser les modèles disponibles/);
});
test("Une session Puter et un catalogue vérifié permettent de rendre le moteur prêt",()=>{
  const {app,window}=harness();
  assert.equal(app.engineReadiness().ready,false);
  window.puter={auth:{isSignedIn:()=>true}};
  app.state.validModels.add("gpt-test");
  assert.equal(app.engineReadiness().ready,true);
});
