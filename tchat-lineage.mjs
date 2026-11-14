/* Fil généalogique de la Radio des IA.
 * Une mémoire déterministe et vérifiable : aucune IA auxiliaire, aucun résumé inventé.
 * La continuité reste propre au navigateur et ne remplace jamais l'historique visible.
 */
export const LINEAGE_LIMITS=Object.freeze({
  maxEvents:90,maxArchives:8,rootChars:850,
  eventChars:520,archiveChars:480,maxContextChars:7800
});
const norm=value=>String(value??"").trim();
const isGreeting=text=>/^(bonjour|bonsoir|salut|hello|coucou|merci|bonne nuit)[!?.\s]*$/i.test(norm(text));
const useful=m=>m&&["human","ai"].includes(m.origin)&&
  typeof m.texte==="string"&&Boolean(m.texte.trim())&&!m.gifId;
function cut(text,limit){
  const t=norm(text),n=Math.max(40,Number(limit)||40);
  if(t.length<=n)return t;
  const start=Math.floor((n-25)*.61),end=n-25-start;
  return t.slice(0,start).trimEnd()+"\n[… extrait abrégé …]\n"+t.slice(-end).trimStart();
}
function keyFor(m){
  // Empreinte locale pour éviter de réimporter plusieurs fois les mêmes tours.
  const text=[m.origin,m.nom||"",m.heure||"",m.modele||"",m.texte||""].join("\u001f");
  let a=2166136261;
  for(let i=0;i<text.length;i++){a^=text.charCodeAt(i);a=Math.imul(a,16777619)>>>0;}
  return a.toString(16).padStart(8,"0")+":"+text.length+":"+text.slice(0,32);
}
function toEvent(m){
  return {id:keyFor(m),origin:m.origin,nom:norm(m.nom).slice(0,75),
    texte:cut(m.texte,LINEAGE_LIMITS.eventChars)};
}
export function updateLineageMemory(previous,messages){
  const before=previous&&typeof previous==="object"?previous:{};
  const events=Array.isArray(before.events)?before.events.filter(x=>x&&typeof x.id==="string"
      &&["human","ai"].includes(x.origin)&&typeof x.texte==="string")
    .map(x=>({id:x.id.slice(0,90),origin:x.origin,
      nom:norm(x.nom).slice(0,75),texte:cut(x.texte,LINEAGE_LIMITS.eventChars)})):[];
  const known=new Set(events.map(x=>x.id));
  const valid=(Array.isArray(messages)?messages:[]).filter(useful);
  let root=norm(before.root).slice(0,LINEAGE_LIMITS.rootChars);
  const original=valid.find(m=>m.origin==="human"&&!isGreeting(m.texte));
  if(!root&&original)root=cut(original.texte,LINEAGE_LIMITS.rootChars);
  for(const m of valid){
    const id=keyFor(m);
    if(known.has(id))continue;
    events.push(toEvent(m));known.add(id);
  }
  // Le premier sujet humain reste dans root, même si les vieux messages sortent du tampon.
  return {version:1,root,
    events:events.slice(-LINEAGE_LIMITS.maxEvents)};
}
export function archiveLineageSession(archives,memory,topic=""){
  const all=Array.isArray(archives)?archives.filter(a=>a&&typeof a==="object"):[];
  const events=(memory?.events||[]).filter(x=>x&&typeof x.texte==="string");
  const root=norm(memory?.root||topic);
  if(!root&&!events.length)return all.slice(-LINEAGE_LIMITS.maxArchives);
  const summary={
    root:cut(root||topic,LINEAGE_LIMITS.rootChars),
    topic:norm(topic).slice(0,250),
    latestHuman:cut([...events].reverse().find(x=>x.origin==="human")?.texte||"",360),
    latestAI:cut([...events].reverse().find(x=>x.origin==="ai")?.texte||"",360)
  };
  return [...all.map(a=>({
    root:cut(a.root,LINEAGE_LIMITS.rootChars),
    topic:norm(a.topic).slice(0,250),
    latestHuman:cut(a.latestHuman,360),
    latestAI:cut(a.latestAI,360)
  })),summary].slice(-LINEAGE_LIMITS.maxArchives);
}
export function buildLineageContext(messages,{sujet="",memory=null,archives=[],includeArchives=true,maxChars=LINEAGE_LIMITS.maxContextChars}={}){
  const chat=(Array.isArray(messages)?messages:[]).filter(useful);
  const mem=updateLineageMemory(memory,chat);
  const first=chat.find(m=>m.origin==="human"&&!isGreeting(m.texte));
  const root=norm(sujet)||norm(mem.root)||norm(first?.texte);
  const humanIndex=chat.map(m=>m.origin).lastIndexOf("human");
  const previousAI=humanIndex>0?[...chat.slice(0,humanIndex)].reverse().find(m=>m.origin==="ai"):null;
  const latestHuman=humanIndex>=0?chat[humanIndex]:null;
  const current=chat.slice(-9);
  const freshKeys=new Set(chat.map(keyFor));
  const older=mem.events.filter(m=>m.origin==="human"&&!freshKeys.has(m.id)).slice(-3);
  const sections=[];
  if(root)sections.push("RACINE DU FIL / PREMIÈRE QUESTION OU SUJET EXPLICITE :\n"+cut(root,LINEAGE_LIMITS.rootChars));
  if(previousAI&&latestHuman){
    sections.push("RÉPONSE ANTÉRIEURE À LAQUELLE LA DERNIÈRE INTERVENTION HUMAINE PEUT RÉAGIR :\n"+
      cut(previousAI.texte,700));
  }
  if(older.length)sections.push("JALONS HUMAINS ANCIENS CONSERVÉS LOCALEMENT (extraits non exhaustifs) :\n"+
    older.map(x=>"Vous : "+cut(x.texte,260)).join("\n"));
  if(includeArchives&&Array.isArray(archives)&&archives.length){
    const saved=archives.slice(-2).map(a=>{
      const label=cut(a.topic||a.root||"Salon antérieur",220);
      const question=cut(a.root||"",280);
      const last=cut(a.latestHuman||"",190);
      return "Salon précédent — "+label+
        (question&&question!==label?" | question fondatrice : "+question:"")+
        (last?" | dernière précision : "+last:"");
    });
    sections.push("AUTRES SALONS DE CE NAVIGATEUR (repères historiques ; ne pas les confondre avec le sujet actuel) :\n"+saved.join("\n"));
  }
  if(current.length){
    sections.push("ÉVOLUTION CHRONOLOGIQUE RÉCENTE — participants réels, aucune transcription inventée :\n"+
      current.map(m=>(m.origin==="human"?"Vous":norm(m.nom)||"IA")+
        " : "+cut(m.texte,m.origin==="human"?800:LINEAGE_LIMITS.eventChars)).join("\n\n"));
  }
  if(!sections.length)return "";
  const max=Math.max(900,Math.min(12000,Number(maxChars)||LINEAGE_LIMITS.maxContextChars));
  let text=sections.join("\n\n");
  // Préserver la racine et les derniers échanges ; retirer d'abord les archives accessoires.
  if(text.length>max){
    let indexed=sections.map((value,i)=>({value,i}));
    const removable=[sections.findIndex(x=>x.startsWith("AUTRES SALONS")),
      sections.findIndex(x=>x.startsWith("JALONS HUMAINS"))].filter(i=>i>=0);
    for(const id of removable){
      if(text.length<=max)break;
      indexed=indexed.filter(x=>x.i!==id);
      text=indexed.map(x=>x.value).join("\n\n");
    }
  }
  if(text.length>max){
    // Une ultime limite protège les crédits des utilisateurs. La question actuelle
    // reste intégrale ailleurs dans buildPrompt.
    text=cut(text,max);
  }
  return text;
}
