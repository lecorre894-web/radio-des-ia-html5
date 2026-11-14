import test from "node:test";
import assert from "node:assert/strict";
import {DOCUMENT_LIMITS,classifyDocument,trimContent,buildDocumentContext,safeDicomInfo,createDocumentManager,decodeDocument} from "../tchat-documents.mjs";

test("types de pièces jointes reconnus explicitement",()=>{
 for(const [name,expected] of Object.entries({
  "rapport.pdf":"pdf","contrat.docx":"word","ancien.doc":"legacyWord",
  "budget.xlsx":"table","historique.xls":"table","donnees.csv":"table",
  "notes.txt":"text","capture.gif":"image","image.jpeg":"image",
  "coupe.tiff":"tiff","IRM.dcm":"dicom","inconnu.exe":"unknown"
 }))assert.equal(classifyDocument(name),expected,name);
});
test("le contenu transmis est limité et signalé comme partiel",()=>{
 const clipped=trimContent("abcdef",3);
 assert.deepEqual(clipped,{text:"abc",truncated:true});
 const prompt=buildDocumentContext([{name:"contrat.pdf",kind:"pdf",text:"ligne ".repeat(200),truncated:true}],180);
 assert.ok(prompt.includes("contrat.pdf"));
 assert.ok(prompt.includes("EXTRACTION PARTIELLE"));
 assert.ok(!prompt.includes("ligne ".repeat(100)));
});
test("une image non transmise ne doit pas être déclarée analysée",()=>{
 const prompt=buildDocumentContext([{name:"photo.gif",kind:"image",text:"GIF : 100 pixels"}]);
 assert.match(prompt,/ne présume pas avoir vu les pixels/);
});
test("les métadonnées DICOM ne publient pas les champs personnels",()=>{
 const info=safeDicomInfo({modality:"MR",rows:512,cols:512,bits:16,photometric:"MONOCHROME2",
   patientName:"NOM SECRET",patientID:"SENSIBLE"});
 assert.match(info,/512 × 512/);
 assert.doesNotMatch(info,/NOM SECRET|SENSIBLE/);
});
test("le module reste inerte sans interface HTML (le Salon n'est pas bloqué)",()=>{
 assert.ok(DOCUMENT_LIMITS.maxFileBytes>=1024*1024);
 // Le fallback ne doit demander aucun réseau ni interagir avec Puter.
 const old=globalThis.document;
 globalThis.document={getElementById:()=>null};
 try{
  const manager=createDocumentManager();
  assert.equal(manager.hasAttachments(),false);
  assert.equal(manager.isReading(),false);
  assert.ok(manager.prepare);
 }finally{if(old===undefined)delete globalThis.document;else globalThis.document=old;}
});

test("formats JSON et code de programmation reconnus, vidéos exclues",()=>{
 for(const file of ["data.json","mesures.jsonl","notebook.ipynb","secteur.geojson"]){
   assert.equal(classifyDocument(file),"json",file);
 }
 for(const file of ["solver.py","interface.js","module.ts","analyse.cpp","calcul.rs","recherche.sql","index.html","style.css","Dockerfile","script.sh"]){
   assert.equal(classifyDocument(file),"code",file);
 }
 for(const file of ["photo.jpeg","scan.tiff"]){
   assert.ok(["image","tiff"].includes(classifyDocument(file)),file);
 }
 for(const file of ["film.mp4","capture.webm","video.mov","archive.mkv"]){
   assert.equal(classifyDocument(file),"video",file);
 }
});
test("le JSON est validé sans exécuter les expressions",async()=>{
 const data={name:"configuration.json",size:34,text:async()=>'{ "x": 2, "actif": true }'};
 const out=await decodeDocument(data);
 assert.equal(out.kind,"json");
 assert.match(out.text,/"actif": true/);
 await assert.rejects(()=>decodeDocument({name:"faux.json",size:5,text:async()=>"{non valide}"}),/JSON invalide/);
});
test("le fichier code source reste du texte sans effet de bord",async()=>{
 globalThis.__RADIO_CODE_TEST=0;
 const result=await decodeDocument({name:"exemple.js",size:60,text:async()=> "globalThis.__RADIO_CODE_TEST=99;\n"});
 assert.equal(result.kind,"code");
 assert.equal(globalThis.__RADIO_CODE_TEST,0);
 assert.match(result.warning,/non exécuté/);
 delete globalThis.__RADIO_CODE_TEST;
});
test("notebook Jupyter : aucune sortie embarquée incluse",async()=>{
 const ipynb={cells:[{cell_type:"code",source:["x = 2\n"],outputs:[{data:{"image/png":"PRIVATE_IMAGE"}}]},{cell_type:"markdown",source:["Conclusion"]}]};
 const output=await decodeDocument({name:"memo.ipynb",size:900,text:async()=>JSON.stringify(ipynb)});
 assert.match(output.text,/x = 2/);
 assert.match(output.text,/Conclusion/);
 assert.doesNotMatch(output.text,/PRIVATE_IMAGE/);
});
test("aucun format vidéo n'est décodé",async()=>{
 await assert.rejects(()=>decodeDocument({name:"movie.mp4",type:"video/mp4"}),/Vidéo non prise en charge/);
});
