/**
 * Chargement facultatif de Puter.js.
 * La Radio et AI Horde restent disponibles sans télécharger le SDK au démarrage.
 * Aucune clé, aucun stockage, aucun appel de génération n'est effectué ici.
 */
export const PUTER_SCRIPT_URL = "https://js.puter.com/v2/";
let loading = null;

export function loadPuter({documentRef=globalThis.document,windowRef=globalThis.window}={}) {
  if(windowRef?.puter?.ai?.chat) return Promise.resolve(windowRef.puter);
  if(loading) return loading;
  if(!documentRef?.createElement || !documentRef?.head)
    return Promise.reject(new Error("Environnement de navigateur indisponible."));
  loading = new Promise((resolve,reject)=>{
    const script=documentRef.createElement("script");
    script.src=PUTER_SCRIPT_URL;
    script.async=true;
    script.onload=()=>{
      if(windowRef?.puter?.ai?.chat)resolve(windowRef.puter);
      else reject(new Error("Puter.js a été chargé mais son moteur IA est indisponible."));
    };
    script.onerror=()=>reject(new Error("Impossible de charger Puter.js. Vérifie la connexion et les bloqueurs."));
    documentRef.head.append(script);
  }).catch(error=>{
    loading=null; // l'utilisateur peut réessayer ; jamais de boucle automatique.
    throw error;
  });
  return loading;
}
