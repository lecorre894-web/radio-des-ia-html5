/* Générateur d'images indépendant du tchat. Aucun chargement de modèles vidéo. */
const $=id=>document.getElementById(id);
const MODELS=Object.freeze([
  "openai/gpt-image-2.6-flare",
  "google/gemini-3.1-flash-image",
  "black-forest-labs/flux-schnell",
  "gpt-image-2.6-flare",
  "gemini-3.1-flash-image"
]);
export function validatedImageRequest({prompt,model,ratio,testMode}){
  const text=String(prompt||"").trim();
  if(!text||text.length>1500)throw new Error("La description doit contenir entre 1 et 1 500 caractères.");
  if(!MODELS.includes(model))throw new Error("Modèle de génération d'images non reconnu.");
  if(!["1:1","16:9","9:16","3:2"].includes(ratio))throw new Error("Format d'image non reconnu.");
  const [w,h]=ratio.split(":").map(Number);
  const edge=1024;
  const dims=w>=h?{w:edge,h:Math.round(edge*h/w)}:{w:Math.round(edge*w/h),h:edge};
  return {prompt:text,options:{model,ratio:dims,test_mode:Boolean(testMode)}};
}
export async function runImageGeneration(puter,request){
  // Le booléen true est le mode test documenté ; il est prioritaire sur tout identifiant payant.
  if(request.options.test_mode)return puter.ai.txt2img(request.prompt,true);
  return puter.ai.txt2img(request.prompt,{
    model:request.options.model,ratio:request.options.ratio
  });
}
export function createImageGenerator(){
  if(typeof document==="undefined")return null;
  const prompt=$("imagePrompt"),model=$("imageModele"),ratio=$("imageRatio"),btn=$("imageGenerer");
  const demo=$("imageDemo"),status=$("imageEtat"),result=$("imageResult"),save=$("imageEnregistrer");
  if(!prompt||!model||!ratio||!btn||!demo||!status||!result||!save)return null;
  let busy=false,src="",objectURL=null;
  const say=text=>status.textContent=text;
  function clearPrevious(){
    result.replaceChildren();save.hidden=true;src="";
    if(objectURL){URL.revokeObjectURL(objectURL);objectURL=null;}
  }
  async function generate(){
    if(busy)return;
    let request;
    try{request=validatedImageRequest({prompt:prompt.value,model:model.value,ratio:ratio.value,testMode:demo.checked});}
    catch(e){say(String(e.message||e));return;}
    const puter=globalThis.puter;
    if(!puter?.ai?.txt2img||!puter?.auth?.isSignedIn?.()){
      say("Connectez-vous à Puter avant de générer une image.");return;
    }
    if(!request.options.test_mode && !confirm("Générer une image avec "+request.options.model+" ? Cette opération peut consommer les crédits Puter de votre compte."))return;
    busy=true;btn.disabled=true;clearPrevious();
    say(request.options.test_mode?"Création d'une image de démonstration (mode test)…":"Génération distante en cours ; les crédits du fournisseur peuvent être débités…");
    try{
      const output=await runImageGeneration(puter,request);
      const url=String(output?.src||"");
      if(!/^(https:\/\/|http:\/\/|data:image\/|blob:)/i.test(url))throw new Error("Le fournisseur n'a retourné aucune image exploitable.");
      src=url;
      const preview=document.createElement("img");
      preview.src=src;preview.alt="Image générée à partir de la description saisie";
      preview.className="pieceApercu";preview.style.maxWidth="100%";
      preview.loading="eager";result.append(preview);
      save.hidden=false;
      say(request.options.test_mode?"Image de démonstration affichée ; aucun crédit de génération consommé selon Puter.":"Image générée. Enregistrez-la : certaines adresses hébergées expirent.");
    }catch(e){say("Échec de génération : "+String(e?.message||e));}
    finally{busy=false;btn.disabled=false;}
  }
  async function download(){
    if(!src)return;
    say("Préparation de l'enregistrement…");
    try{
      const response=await fetch(src);
      if(!response.ok)throw new Error("HTTP "+response.status);
      const blob=await response.blob();
      if(!blob.type.startsWith("image/"))throw new Error("Réponse non reconnue comme image.");
      objectURL=URL.createObjectURL(blob);
      const ext=blob.type.includes("png")?"png":blob.type.includes("webp")?"webp":"jpg";
      const anchor=document.createElement("a");
      anchor.href=objectURL;anchor.download="radio-des-ia-image-"+Date.now()+"."+ext;
      document.body.append(anchor);anchor.click();anchor.remove();
      say("Enregistrement demandé au navigateur.");
    }catch(e){
      say("Le navigateur empêche le téléchargement direct. Maintenez le doigt sur l'image pour l'enregistrer.");
    }
  }
  btn.addEventListener("click",()=>void generate());
  save.addEventListener("click",()=>void download());
  save.hidden=true;
  say("Générateur prêt. Aucun crédit dépensé avant d'appuyer sur Générer.");
  return {generate,clear:clearPrevious};
}
if(typeof document!=="undefined")createImageGenerator();
