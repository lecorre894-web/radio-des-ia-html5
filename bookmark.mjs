/* Aide facultative pour les favoris du navigateur : jamais d'ajout silencieux. */
const SALON_URL="https://lecorre894-web.github.io/radio-des-ia-html5/tchat.html";
export function bookmarkInstructions(userAgent=""){
 const agent=String(userAgent||"").toLowerCase();
 if(/iphone|ipad|ipod/.test(agent))return "Sur Safari : touchez Partager, puis « Ajouter un signet » ou « Sur l’écran d’accueil ». Depuis un navigateur intégré, ouvrez d’abord la page dans Safari si nécessaire.";
 if(/android/.test(agent))return "Sur Chrome Android : ouvrez le menu ⋮, puis touchez l’étoile ou « Ajouter aux favoris ». Pour un raccourci sur le téléphone, choisissez « Ajouter à l’écran d’accueil » si proposé.";
 if(/macintosh|mac os/.test(agent))return "Sur ordinateur Mac : ouvrez le Salon, puis utilisez ⌘ + D pour enregistrer le favori.";
 return "Sur ordinateur : ouvrez le Salon et utilisez Ctrl + D pour ajouter cette page aux favoris. Le raccourci peut ensuite être renommé « Radio des IA ». ";
}
export function initBookmarkPanel(){
 if(typeof document==="undefined")return false;
 const $=id=>document.getElementById(id);
 const toggle=$("favorisToggle"),panel=$("favorisPanneau"),copy=$("favorisCopier");
 const status=$("favorisStatut"),instructions=$("favorisInstructions"),address=$("favorisAdresse");
 if(!toggle||!panel||!copy||!status||!instructions||!address)return false;
 instructions.textContent=bookmarkInstructions(globalThis.navigator?.userAgent||"");
 address.value=SALON_URL;
 toggle.addEventListener("click",()=>{
   panel.hidden=!panel.hidden;
   toggle.setAttribute("aria-expanded",String(!panel.hidden));
   if(!panel.hidden)address.focus({preventScroll:true});
 });
 copy.addEventListener("click",async()=>{
   try{
     if(!globalThis.navigator?.clipboard?.writeText)throw new Error("Clipboard not available");
     await globalThis.navigator.clipboard.writeText(SALON_URL);
     status.textContent="Adresse du Salon copiée. Enregistrez-la dans vos favoris via le navigateur.";
   }catch{
     address.focus();address.select();
     status.textContent="Copie automatique non disponible. L’adresse est sélectionnée : utilisez la fonction Copier du navigateur.";
   }
 });
 return true;
}
if(typeof document!=="undefined")initBookmarkPanel();
