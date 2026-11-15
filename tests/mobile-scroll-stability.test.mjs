import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const html=readFileSync(new URL("../tchat.html",import.meta.url),"utf8");
const code=readFileSync(new URL("../tchat-distant.mjs",import.meta.url),"utf8");
const start=code.indexOf("function installButtonViewportGuard(){");
const stop=code.indexOf("function init(){",start);
assert.ok(start>0 && stop>start);
const factory=new Function("document","window",
  code.slice(start,stop)+"\nreturn installButtonViewportGuard;");

test("Le statut distant du haut est retiré de la mise en page sans retirer le retour près du message",()=>{
  assert.match(html,/<div id="etat" hidden aria-hidden="true"><\/div>/);
  assert.match(html,/<div id="etatComposer"[^>]*role="status"/);
  assert.match(code,/\$\("etatComposer"\)/);
});

test("Les clics conservent le bouton à la même hauteur après modification du document",()=>{
  const callbacks=new Map(),frames=[];
  let top=310,scrolled=0;
  const button={
    disabled:false,isConnected:true,
    getBoundingClientRect:()=>({top})
  };
  const event={target:{closest:selector=>selector==="button"?button:null}};
  const document={addEventListener:(name,fn)=>callbacks.set(name,fn)};
  const window={
    requestAnimationFrame:fn=>{frames.push(fn);},
    scrollBy:(x,y)=>{assert.equal(x,0);scrolled+=y;top-=y;}
  };
  factory(document,window)();
  assert.ok(callbacks.has("pointerdown"));
  assert.ok(callbacks.has("click"));
  callbacks.get("pointerdown")(event);
  top=450; // browser focus/layout adjustment: 140 pixels downward
  callbacks.get("click")(event);
  while(frames.length)frames.shift()();
  assert.equal(top,310);
  assert.equal(scrolled,140);
});

test("Un bouton disparu ne déclenche aucun mouvement, les liens ne sont pas interceptés",()=>{
  const listeners=new Map(),frames=[];
  let count=0;
  const button={disabled:false,isConnected:true,getBoundingClientRect:()=>({top:240})};
  const document={addEventListener:(name,fn)=>listeners.set(name,fn)};
  const window={requestAnimationFrame:fn=>frames.push(fn),scrollBy:()=>count++};
  factory(document,window)();
  const target={closest:()=>button};
  listeners.get("pointerdown")({target});
  button.isConnected=false;
  listeners.get("click")({target});
  while(frames.length)frames.shift()();
  assert.equal(count,0);
  listeners.get("click")({target:{closest:()=>null}});
  assert.equal(count,0);
});
