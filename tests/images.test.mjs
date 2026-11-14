import test from "node:test";
import assert from "node:assert/strict";
import {validatedImageRequest,createImageGenerator,runImageGeneration} from "../tchat-images.mjs";

test("générateur : prompt, modèle et ratio validés sans déclencher de génération",()=>{
 const req=validatedImageRequest({prompt:"Une image de la Lune",model:"gpt-image-2.6-flare",ratio:"16:9",testMode:false});
 assert.equal(req.prompt,"Une image de la Lune");
 assert.deepEqual(req.options.ratio,{w:1024,h:576});
 assert.equal(req.options.model,"gpt-image-2.6-flare");
 assert.equal(req.options.test_mode,false);
});
test("mode démonstration explicitement défini",()=>{
 const req=validatedImageRequest({prompt:"Tasse bleue",model:"gemini-3.1-flash-image",ratio:"1:1",testMode:true});
 assert.equal(req.options.test_mode,true);
});
test("les modèles non déclarés et formats vidéo sont rejetés",()=>{
 assert.throws(()=>validatedImageRequest({prompt:"bonjour",model:"unsupported",ratio:"1:1"}),/non reconnu/);
 assert.throws(()=>validatedImageRequest({prompt:"bonjour",model:"gpt-image-2.6-flare",ratio:"video"}),/non reconnu/);
 assert.throws(()=>validatedImageRequest({prompt:"",model:"gpt-image-2.6-flare",ratio:"1:1"}),/description/);
});
test("générateur isolé : aucune dépendance à la radio existante",()=>{
 const previous=globalThis.document;
 globalThis.document={getElementById:()=>null};
 try{
   assert.equal(createImageGenerator(),null);
 }finally{
   if(previous===undefined)delete globalThis.document;
   else globalThis.document=previous;
 }
});

test("mode gratuit Puter : second argument vrai, jamais options payantes",async()=>{
 const calls=[];
 const puter={ai:{txt2img:async(...args)=>{calls.push(args);return {src:"data:image/png;base64,AA=="};}}};
 const req=validatedImageRequest({prompt:"Test",model:"openai/gpt-image-2.6-flare",ratio:"1:1",testMode:true});
 await runImageGeneration(puter,req);
 assert.deepEqual(calls[0],["Test",true]);
});
test("génération réelle : fournisseur et résolution déclarés sans test_mode",async()=>{
 const calls=[];
 const puter={ai:{txt2img:async(...args)=>{calls.push(args);return {src:"data:image/png;base64,AA=="};}}};
 const req=validatedImageRequest({prompt:"Vue de Mars",model:"google/gemini-3.1-flash-image",ratio:"9:16",testMode:false});
 await runImageGeneration(puter,req);
 assert.deepEqual(calls[0],["Vue de Mars",{model:"google/gemini-3.1-flash-image",ratio:{w:576,h:1024}}]);
});
