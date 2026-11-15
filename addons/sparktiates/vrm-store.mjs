/**
 * SPARKTIATES VRM — private append-only scientific event journal.
 * This is a real file on the computer that runs SPARKTIATES, not an emulated
 * datacenter or a public GitHub repository. Nothing is uploaded by default.
 */
import {mkdir,readFile,appendFile,stat} from "node:fs/promises";
import {dirname} from "node:path";
import {homedir} from "node:os";
import {join} from "node:path";

export const DEFAULT_VRM_FILE=join(homedir(),".sparktiates","radio-vrm","events.jsonl");
const MAX_FILE_BYTES=32*1024*1024;
const MAX_EVENTS=50_000;
const ALLOWED_TYPES=new Set(["QUESTION","CANDIDAT","CORRECTION_CANDIDATE","NOTE","MESURE_DECLAREE"]);

export function normalizeVrmEvent(value){
  if(!value||typeof value!=="object"||Array.isArray(value))throw Error("Événement VRM invalide.");
  const id=String(value.id??"");
  if(!/^[0-9a-f]{16}$/i.test(id))throw Error("ID VRM invalide.");
  const origin=String(value.origin??"");
  if(!["human","ai"].includes(origin))throw Error("Origine VRM invalide.");
  const type=String(value.type??"");
  if(!ALLOWED_TYPES.has(type))throw Error("Type VRM invalide.");
  const text=value.text;
  if(typeof text!=="string"||!text.trim()||text.length>10000)throw Error("Extrait VRM vide ou trop long.");
  const time=String(value.time??"");
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(time)||!Number.isFinite(Date.parse(time)))
    throw Error("Horodatage VRM invalide.");
  const nom=String(value.nom??"").slice(0,100);
  const model=String(value.model??"").slice(0,180);
  const topic=String(value.topic??"").slice(0,250);
  return {id,origin,type,text,time,nom,model,topic,
    evidence:origin==="human"?"DÉCLARATION_HUMAINE":"PROPOSITION_IA_NON_VÉRIFIÉE"};
}

export function createVrmStore({file=process.env.SPARKTIATES_VRM_FILE||DEFAULT_VRM_FILE}={}){
  let ready=null;
  let queue=Promise.resolve();
  const data=[],byId=new Map();
  async function open(){
    if(ready)return ready;
    ready=(async()=>{
      await mkdir(dirname(file),{recursive:true,mode:0o700});
      let raw="";
      try{raw=await readFile(file,"utf8");}
      catch(e){if(e.code!=="ENOENT")throw e;}
      if(Buffer.byteLength(raw)>MAX_FILE_BYTES)
        throw Error("Journal VRM au-delà de la limite de sécurité.");
      for(const line of raw.split("\n").filter(Boolean)){
        let entry;
        try{entry=normalizeVrmEvent(JSON.parse(line));}
        catch{throw Error("Journal VRM corrompu : ne pas écraser le fichier.");}
        if(!byId.has(entry.id)){
          byId.set(entry.id,entry);
          data.push(entry);
        }
      }
      if(data.length>MAX_EVENTS)throw Error("Trop d'événements VRM.");
    })();
    try{await ready;}catch(e){ready=null;throw e;}
    return ready;
  }
  async function lock(fn){
    const current=queue.then(fn);
    queue=current.catch(()=>{});
    return current;
  }
  return {
    async status(){await open();return {events:data.length,storage:"persistent-file",pathConfigured:true};},
    async read({offset=0,limit=100}={}){
      await open();
      const start=Math.max(0,Number.isInteger(offset)?offset:0);
      const amount=Math.max(1,Math.min(200,Number.isInteger(limit)?limit:100));
      return {events:data.slice(start,start+amount),total:data.length,
        next:start+amount<data.length?start+amount:null};
    },
    async merge(values){
      if(!Array.isArray(values)||!values.length||values.length>12)
        throw Error("Lot VRM : 1 à 12 éléments.");
      const input=values.map(normalizeVrmEvent);
      return lock(async()=>{
        await open();
        const pending=[],local=new Map();
        for(const e of input){
          const current=byId.get(e.id)||local.get(e.id);
          if(current){
            if(current.origin!==e.origin || current.text!==e.text)
              throw Error("Conflit d'identifiant VRM : journal inchangé.");
            continue;
          }
          local.set(e.id,e);pending.push(e);
        }
        if(data.length+pending.length>MAX_EVENTS)
          throw Error("Capacité maximale VRM atteinte ; sauvegarder le journal.");
        if(pending.length){
          const block=pending.map(e=>JSON.stringify(e)+"\n").join("");
          const bytes=await stat(file).then(x=>x.size).catch(e=>e.code==="ENOENT"?0:Promise.reject(e));
          if(bytes+Buffer.byteLength(block)>MAX_FILE_BYTES)
            throw Error("Capacité maximale de stockage VRM atteinte.");
          await appendFile(file,block,{encoding:"utf8",mode:0o600,flag:"a"});
          for(const e of pending){byId.set(e.id,e);data.push(e);}
        }
        return {accepted:pending.length,duplicates:input.length-pending.length,total:data.length};
      });
    }
  };
}
