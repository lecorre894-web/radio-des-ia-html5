/**
 * Deterministic registry of 2,048 independent private SPARKTIATES networks.
 * A logical network consumes no listener or CPU unless a node joins it.
 * No public IPs, no torrent swarms, no physical machines are invented.
 */
import {createHmac,createHash} from "node:crypto";
import {V2_POLICY,genesisV2,validNetworkId,chainIdFor} from "./pow-v2.mjs";
const pattern=/^[a-zA-Z0-9_-]{1,60}$/;
export function networkIdAt(index){
  if(!Number.isInteger(index)||index<1||index>V2_POLICY.networkCount)
    throw Error("SPK NETWORK: index hors 1..2048");
  return "spk-net-"+String(index).padStart(4,"0");
}
export function networkDescriptor(indexOrId){
  const id=typeof indexOrId==="number"?networkIdAt(indexOrId):indexOrId;
  if(!validNetworkId(id))throw Error("SPK NETWORK: réseau non reconnu");
  const genesis=genesisV2(id);
  return Object.freeze({id,chainId:chainIdFor(id),
    genesisHash:genesis.hash,protocol:V2_POLICY.version||V2_POLICY.protocol,
    isolation:"SEPARATE_CHAIN_AND_GENESIS",private:true,activated:false});
}
export function createNetworkCatalog(){
  const entries=Array.from({length:V2_POLICY.networkCount},
    (_,i)=>networkDescriptor(i+1));
  const unique=new Set(entries.map(n=>n.genesisHash));
  if(unique.size!==V2_POLICY.networkCount)
    throw Error("SPK NETWORK: collisions de genèse");
  return Object.freeze({
    count:entries.length,
    descriptor:indexOrId=>networkDescriptor(indexOrId),
    entries,
    fingerprint:createHash("sha256").update(
      entries.map(x=>x.id+":"+x.genesisHash).join("\n")).digest("hex")
  });
}
export function deriveNetworkSecret(master,networkId){
  if(typeof master!=="string"||master.length<32||!validNetworkId(networkId))
    throw Error("SPK NETWORK: secret maître >=32 caractères et réseau requis");
  return createHmac("sha256",master).update(
    "SPK-OVERLAY-V2\0"+chainIdFor(networkId)).digest("hex");
}
export function derivePeerHmac(secret,content){
  if(typeof secret!=="string"||secret.length<32||
     !content||typeof content!=="object")
    throw Error("SPK NETWORK: signature de pair invalide");
  return createHmac("sha256",secret).update(
    JSON.stringify([content.version,content.networkId,content.id,
      content.genesisHash,content.nonce])).digest("hex");
}
