/* Tableau de bord Émojis · Émoticônes · GIF — facultatif et isolé.
 * Les GIF restent privés à ce navigateur (IndexedDB, ou mémoire si indisponible).
 * Aucun GIF n'est transmis aux modèles ou publié sur GitHub automatiquement.
 */
export const EMOJI_GROUPS=Object.freeze({
  "Sourires":["😀","😃","😄","😁","😆","😂","🤣","😊","😍","🥰","😘","😎","🤩","🤗","🥹","😮","😱","😭","😴","🤔","🙃","😇","😅","🥳"],
  "Gestes":["👍","👎","👏","🙌","🙏","🤝","👋","✌️","🤞","💪","🫶","👀","❤️","💙","💚","💛","💜","🖤","💔","💯","🔥","✨","🎉","🎁"],
  "Science":["🧠","🔬","🔭","🧪","⚛️","🧬","🧮","💻","🤖","📡","🛰️","🚀","🌍","🌕","🌌","☀️","💡","⚙️","📊","📈","✅","❌","⚠️","❓"],
  "Nature":["🐱","🐶","🦊","🐼","🦋","🌸","🌻","🌹","🌲","🌈","⭐","🌊","☕","🍕","🍀","🎵","🎶","🎭","🎨","📻"]
});
export const EMOTICONS=Object.freeze([":-)",":)",":-D",":D",";-)",";)","<3","</3",":-P",":P",":-(",":(",":-O","o_O","^_^","-_-","(・_・;)","(≧◡≦)","¯\\_(ツ)_/¯","(づ｡◕‿‿◕｡)づ"]);
export const GIF_LIMITS=Object.freeze({maxBytes:4*1024*1024,maxFiles:12,maxTotalBytes:32*1024*1024});
export function isValidGifSignature(bytes){
  const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes||[]);
  if(b.length<6)return false;
  const head=String.fromCharCode(...b.subarray(0,6));
  return head==="GIF87a"||head==="GIF89a";
}
export async function validateGif(file){
  if(!file||typeof file.size!=="number"||file.size<=0)throw new Error("GIF vide.");
  if(file.size>GIF_LIMITS.maxBytes)throw new Error("GIF trop volumineux : 4 Mio maximum.");
  if(!/\.gif$/i.test(file.name||""))throw new Error("Seuls les fichiers .gif sont acceptés.");
  const head=new Uint8Array(await file.slice(0,6).arrayBuffer());
  if(!isValidGifSignature(head))throw new Error("Fichier GIF invalide : signature GIF87a/GIF89a absente.");
  return true;
}
const memory=new Map();
const urls=new Map();
let databasePromise=null;
function openDatabase(){
  if(databasePromise)return databasePromise;
  if(typeof indexedDB==="undefined")return Promise.resolve(null);
  databasePromise=new Promise(resolve=>{
    let request;
    try{request=indexedDB.open("radio-ia-gifs-local",1);}
    catch{resolve(null);return;}
    request.onupgradeneeded=()=>{
      if(!request.result.objectStoreNames.contains("gifs"))
        request.result.createObjectStore("gifs",{keyPath:"id"});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>resolve(null);
    request.onblocked=()=>resolve(null);
  });
  return databasePromise;
}
async function records(){
  const db=await openDatabase();
  if(!db)return [...memory.values()];
  return new Promise(resolve=>{
    try{
      const tx=db.transaction("gifs","readonly");
      const req=tx.objectStore("gifs").getAll();
      req.onsuccess=()=>resolve(Array.isArray(req.result)?req.result:[]);
      req.onerror=()=>resolve([...memory.values()]);
    }catch{resolve([...memory.values()]);}
  });
}
async function saveRecord(item){
  const db=await openDatabase();
  if(!db){memory.set(item.id,item);return;}
  await new Promise((resolve,reject)=>{
    try{
      const tx=db.transaction("gifs","readwrite");
      tx.oncomplete=resolve;tx.onerror=()=>reject(new Error("Stockage local des GIF saturé ou indisponible."));
      tx.objectStore("gifs").put(item);
    }catch(e){reject(e);}
  });
}
async function dropRecord(id){
  const db=await openDatabase();
  memory.delete(id);
  if(urls.has(id)){URL.revokeObjectURL(urls.get(id));urls.delete(id);}
  if(!db)return;
  await new Promise(resolve=>{
    try{
      const tx=db.transaction("gifs","readwrite");
      tx.oncomplete=resolve;tx.onerror=resolve;
      tx.objectStore("gifs").delete(id);
    }catch{resolve();}
  });
}
async function getRecord(id){
  if(memory.has(id))return memory.get(id);
  const db=await openDatabase();
  if(!db)return null;
  return new Promise(resolve=>{
    try{
      const req=db.transaction("gifs","readonly").objectStore("gifs").get(id);
      req.onsuccess=()=>resolve(req.result||null);
      req.onerror=()=>resolve(null);
    }catch{resolve(null);}
  });
}
async function gifURL(id){
  if(urls.has(id))return urls.get(id);
  const item=await getRecord(id);
  if(!item||!item.blob)return null;
  const url=URL.createObjectURL(item.blob);
  urls.set(id,url);
  return url;
}
export function createReactionBoard({onInsert,onSendGif,onStatus}={}){
  if(typeof document==="undefined")return null;
  const $=id=>document.getElementById(id);
  const toggle=$("reactionToggle"),board=$("reactionBoard"),close=$("reactionClose");
  const emojis=$("reactionEmojis"),smileys=$("reactionSmileys"),gifs=$("reactionGifs");
  const search=$("reactionSearch"),gifInput=$("reactionGifFile"),gifList=$("reactionGifList");
  const status=$("reactionStatus");
  if(!toggle||!board||!close||!emojis||!smileys||!gifs||!search||!gifInput||!gifList||!status)return null;
  let tab="emoji",busy=false;
  const say=message=>{status.textContent=message;onStatus?.(message);};
  const chip=(value,container)=>{
    const btn=document.createElement("button");btn.type="button";btn.className="reactionChip";
    btn.textContent=value;btn.title="Insérer "+value;btn.setAttribute("aria-label","Insérer "+value);
    btn.addEventListener("click",()=>{onInsert?.(value);say(value+" ajouté au message.");});
    container.append(btn);
  };
  function renderPalette(){
    const match=search.value.trim().toLocaleLowerCase("fr");
    emojis.replaceChildren();smileys.replaceChildren();
    for(const [category,values] of Object.entries(EMOJI_GROUPS)){
      if(match&&!category.toLocaleLowerCase("fr").includes(match)&&!values.some(v=>v.includes(match)))continue;
      const wrap=document.createElement("div");wrap.className="reactionGroup";
      const label=document.createElement("strong");label.textContent=category;wrap.append(label);
      const buttons=document.createElement("div");buttons.className="reactionGrid";
      for(const value of values)chip(value,buttons);
      wrap.append(buttons);emojis.append(wrap);
    }
    for(const value of EMOTICONS)if(!match||value.includes(match))chip(value,smileys);
  }
  async function renderGIFs(){
    gifList.replaceChildren();
    const all=(await records()).sort((a,b)=>b.created-a.created);
    if(!all.length){
      const empty=document.createElement("p");empty.textContent="Aucun GIF enregistré. Importez un GIF depuis votre téléphone ou ordinateur.";
      gifList.append(empty);return;
    }
    for(const item of all){
      const wrap=document.createElement("div");wrap.className="reactionGifItem";
      const img=document.createElement("img");img.alt="GIF animé : "+item.name;img.loading="lazy";
      const url=await gifURL(item.id);
      if(url)img.src=url;
      const label=document.createElement("span");label.textContent=item.name+" · "+(item.size/1048576).toFixed(2)+" Mio";
      const use=document.createElement("button");use.textContent="Envoyer dans la conversation";use.type="button";
      use.addEventListener("click",()=>{onSendGif?.({id:item.id,name:item.name});say("GIF inséré dans cette conversation.");});
      const remove=document.createElement("button");remove.textContent="Supprimer du tableau";remove.type="button";
      remove.addEventListener("click",()=>void(async()=>{await dropRecord(item.id);await renderGIFs();say("GIF supprimé de la bibliothèque locale.");})());
      wrap.append(img,label,use,remove);gifList.append(wrap);
    }
  }
  function selectTab(next){
    tab=next;
    emojis.hidden=tab!=="emoji";smileys.hidden=tab!=="emoticon";gifs.hidden=tab!=="gif";
    for(const btn of board.querySelectorAll("[data-reaction-tab]")){
      const chosen=btn.dataset.reactionTab===tab;
      btn.setAttribute("aria-pressed",String(chosen));
      btn.classList.toggle("primary",chosen);
    }
    search.hidden=tab==="gif";
    if(tab==="gif")void renderGIFs();else renderPalette();
  }
  async function addGIFs(files){
    if(busy)return;
    busy=true;gifInput.disabled=true;
    try{
      for(const file of Array.from(files||[])){
        try{
          await validateGif(file);
          const all=await records();
          if(all.length>=GIF_LIMITS.maxFiles)throw new Error("Tableau complet : 12 GIF maximum.");
          if(all.reduce((n,e)=>n+e.size,0)+file.size>GIF_LIMITS.maxTotalBytes)throw new Error("Bibliothèque complète : 32 Mio maximum.");
          const id="gif-"+Date.now()+"-"+Math.random().toString(36).slice(2);
          await saveRecord({id,name:String(file.name).slice(0,120),size:file.size,
            created:Date.now(),blob:file});
          say("GIF ajouté : "+file.name);
        }catch(error){say(file.name+" : "+String(error?.message||error));}
      }
    }finally{
      busy=false;gifInput.disabled=false;gifInput.value="";await renderGIFs();
    }
  }
  async function renderMessageGif(id,holder){
    if(!holder||!id)return;
    const url=await gifURL(id);
    if(!url||!holder.isConnected)return;
    const img=document.createElement("img");
    img.src=url;img.alt="GIF animé partagé dans cette conversation";
    img.loading="lazy";img.className="reactionMessageGif";
    holder.append(img);
  }
  toggle.addEventListener("click",()=>{
    board.hidden=!board.hidden;toggle.setAttribute("aria-expanded",String(!board.hidden));
    if(!board.hidden){selectTab(tab);board.scrollIntoView({block:"nearest",behavior:"smooth"});}
  });
  close.addEventListener("click",()=>{board.hidden=true;toggle.setAttribute("aria-expanded","false");});
  for(const btn of board.querySelectorAll("[data-reaction-tab]"))btn.addEventListener("click",()=>selectTab(btn.dataset.reactionTab));
  search.addEventListener("input",renderPalette);
  gifInput.addEventListener("change",()=>void addGIFs(gifInput.files));
  renderPalette();selectTab(tab);
  say("Tableau prêt : les émoticônes rejoignent le texte ; les GIF sont enregistrés uniquement dans ce navigateur.");
  return {renderMessageGif,open:()=>{board.hidden=false;toggle.setAttribute("aria-expanded","true");selectTab(tab);}};
}
