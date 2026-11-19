import {randomBytes,createHash} from "node:crypto";
const token=randomBytes(32).toString("base64url");
const hash=createHash("sha256").update(token).digest("hex");
console.log("TOKEN PRIVÉ : conserver hors GitHub, à partager à l'agent authentifié seulement\n"+token);
console.log("EMPREINTE SHA256 POUR LA BASE (non secrète) :\n"+hash);
console.log("Chaque jeton identifie UN SEUL agent ; révoquer en désactivant son entrée.");
