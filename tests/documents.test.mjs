import test from "node:test";
import assert from "node:assert/strict";
import {DOCUMENT_LIMITS,classifyDocument,trimContent,buildDocumentContext,safeDicomInfo,createDocumentManager} from "../tchat-documents.mjs";

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
