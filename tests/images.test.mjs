import test from "node:test";
import assert from "node:assert/strict";
import {validatedImageRequest,createImageGenerator} from "../tchat-images.mjs";

test("générateur : prompt, modèle et ratio validés sans déclencher de génération",()=>{
 const req=validatedImageRequest({prompt:"Une image de la Lune",model:"gpt-image-2.6-flare",ratio:"16:9",testMode:false});
 assert.equal(req.prompt,"Une image de la Lune");
 assert.deepEqual(req.options.ratio,{w:16,h:9});
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
