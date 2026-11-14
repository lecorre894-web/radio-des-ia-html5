import test from "node:test";
import assert from "node:assert/strict";
import {initScientificCoordinator} from "../science-panel.mjs";

class FakeElement {
  constructor(){
    this.value="";this.checked=false;this.disabled=false;this.hidden=false;
    this.textContent="";this.className="";this.children=[];
    this.events=new Map();
  }
  addEventListener(name,fn){this.events.set(name,fn);}
  replaceChildren(...items){this.children=[...items];}
  append(...items){this.children.push(...items);}
  click(){return this.events.get("click")?.();}
}
function walk(node){
  return [node.textContent||"",...(node.children||[]).flatMap(walk)].join("\n");
}
test("Coordinateur intégré : deux vrais points d'entrée simulés, zéro émission au chargement, rapport reproductible",async()=>{
  const originalDocument=globalThis.document;
  const originalFetch=globalThis.fetch;
  const originalNavigator=Object.getOwnPropertyDescriptor(globalThis,"navigator");
  const nodes=new Map();
  const el=id=>{
    if(!nodes.has(id))nodes.set(id,new FakeElement());
    return nodes.get(id);
  };
  let calls=[];
  try{
    globalThis.document={
      getElementById:el,
      createElement:()=>new FakeElement()
    };
    const clipboard={value:"",async writeText(s){this.value=s;}};
    Object.defineProperty(globalThis,"navigator",{configurable:true,value:{clipboard}});
    globalThis.fetch=async(url,options)=>{
      calls.push({url,headers:options.headers,body:JSON.parse(options.body)});
      const model=String(options.body).includes("model-local")?"model-local":"model-community";
      return new Response(JSON.stringify({
        model,choices:[{message:{content:"Une estimation analytique seulement.\nESTIMATION_MAREE_M_S2=1.1e-6"}}]
      }),{status:200});
    };
    el("scienceCas").value="lunar_tides";
    el("scienceHorde").checked=true;
    el("scienceSparktiates").checked=true;
    let contextCalls=0;
    initScientificCoordinator({getConfig:()=>{
      contextCalls++;
      return {
        history:[{origin:"human",texte:"Mon ancien message confidentiel"}],
        hordeModel:"model-community",
        hordeVerified:true,
        sparktiates:{verified:true,model:"model-local",
          endpoint:"https://pont.example",token:"test-secret-123456789012345"}
      };
    }});
    assert.equal(calls.length,0,"Aucun appel automatique au chargement");
    assert.equal(contextCalls,0,"Aucun historique lu au chargement");
    el("scienceLancer").click();
    await new Promise(resolve=>setTimeout(resolve,40));
    assert.equal(calls.length,2);
    assert.deepEqual(calls.map(c=>c.url).sort(),[
      "https://oai.aihorde.net/v1/chat/completions",
      "https://pont.example/v1/chat/completions"
    ]);
    assert.ok(calls.every(c=>!JSON.stringify(c.body).includes("Mon ancien message confidentiel")));
    assert.ok(calls.every(c=>!JSON.stringify(c.body).includes("test-secret-")));
    const horde=calls.find(c=>c.url.includes("aihorde"));
    const own=calls.find(c=>c.url.includes("pont.example"));
    assert.equal(horde.headers.Authorization,"Bearer 0000000000");
    assert.equal(own.headers.Authorization,"Bearer test-secret-123456789012345");
    assert.equal(horde.body.model,"model-community");
    assert.equal(own.body.model,"model-local");
    assert.equal(el("scienceCopier").disabled,false);
    assert.match(walk(el("scienceResultats")),/AI Horde/);
    assert.match(walk(el("scienceResultats")),/SPARKTIATES/);
    assert.match(walk(el("scienceResultats")),/COMPATIBLE_NUMERIQUEMENT/);
    el("scienceCopier").click();
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.match(clipboard.value,/Validation indépendante des affirmations scientifiques : NON/);
    assert.doesNotMatch(clipboard.value,/test-secret-/);
    assert.doesNotMatch(clipboard.value,/Mon ancien message confidentiel/);
  }finally{
    if(originalDocument===undefined)delete globalThis.document;
    else globalThis.document=originalDocument;
    globalThis.fetch=originalFetch;
    if(originalNavigator)Object.defineProperty(globalThis,"navigator",originalNavigator);
    else delete globalThis.navigator;
  }
});
