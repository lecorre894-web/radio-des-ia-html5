/**
 * SPARKTIATES BATON V3 — ONE LEDGER replicated by the three triangle
 * vertices. Each vertex has ONE local verified snapshot, NOT 2,048 chains.
 * Every snapshot is revalidated from the shared genesis before acceptance.
 * Files never contain a private key. Fail closed on corruption.
 */
import {
  existsSync,mkdirSync,readFileSync,openSync,writeFileSync,
  fsyncSync,closeSync,renameSync,unlinkSync
} from "node:fs";
import {join,resolve} from "node:path";
import {tmpdir,homedir} from "node:os";
import {randomBytes} from "node:crypto";
import {stable,sha256,newIdentity,address} from "./chain-core.mjs";
import {createPrivateKey,createPublicKey} from "node:crypto";
import {stateRootV2,V2_POLICY} from "./pow-v2.mjs";
import {
  BATON_V3,batonGenesis,initialBatonState,
  acceptBatonBlock,replayBatonChain,routeForHeight
} from "./baton-v3.mjs";

const check=(condition,msg)=>{
  if(!condition)throw Error("SPK-V3-REGISTRE: "+msg);
};
export const DEFAULT_BATON_LEDGER_DIR=join(homedir(),
  ".sparktiates","chain","baton-v3-single-chain");
export function deriveBatonEntries(chain){
  check(Array.isArray(chain)&&chain.length>=1&&
    chain.length<=V2_POLICY.maxChainLength,"taille de registre invalide");
  let state=initialBatonState();
  check(stable(chain[0])===stable(batonGenesis()),
    "genèse unique différente");
  const entries=[];
  for(const block of chain.slice(1)){
    const prior=state;
    state=acceptBatonBlock(state,block);
    const route=routeForHeight(state.height);
    entries.push({
      height:state.height,
      previousHash:prior.hash,
      hash:state.hash,
      relayId:route.relayId,
      relayCycle:route.cycle,
      triangleVertex:route.triangleVertex,
      difficultyBits:"0x"+block.header.bits.toString(16),
      proofHash:state.hash,
      cumulativeWork:state.cumulativeWork.toString(),
      stateRoot:stateRootV2(state.utxos),
      supply:state.supply
    });
  }
  return {entries,state};
}
export function verifiedBatonSnapshot(state){
  check(state&&Array.isArray(state.chain),"état sans chaîne");
  const validated=deriveBatonEntries(state.chain);
  const accepted=validated.state;
  check(accepted.hash===state.hash&&accepted.height===state.height&&
    accepted.supply===state.supply&&
    accepted.cumulativeWork===state.cumulativeWork&&
    stateRootV2(accepted.utxos)===stateRootV2(state.utxos),
    "état local divergent de son registre");
  const payload={
    schema:"SPK_BATON_SINGLE_LEDGER_V3",
    protocol:BATON_V3.protocol,
    genesisHash:batonGenesis().hash,
    relayCount:BATON_V3.logicalRelays,
    height:accepted.height,tip:accepted.hash,
    totalIssued:accepted.supply,
    cumulativeWork:accepted.cumulativeWork.toString(),
    utxoRoot:stateRootV2(accepted.utxos),
    entries:validated.entries,
    chain:accepted.chain
  };
  return {...payload,
    checksum:sha256(stable(payload))};
}
export function readVerifiedBatonSnapshot(snapshot){
  check(snapshot&&typeof snapshot==="object"&&!Array.isArray(snapshot),
    "snapshot absent");
  const {checksum,...body}=snapshot;
  check(typeof checksum==="string"&&checksum===sha256(stable(body)),
    "empreinte de registre invalide");
  check(body.schema==="SPK_BATON_SINGLE_LEDGER_V3"&&
    body.protocol===BATON_V3.protocol&&
    body.genesisHash===batonGenesis().hash&&
    body.relayCount===BATON_V3.logicalRelays,
    "registre d'un protocole différent");
  check(Array.isArray(body.chain),"blocs manquants");
  const {entries,state}=deriveBatonEntries(body.chain);
  check(stable(entries)===stable(body.entries)&&
    body.height===state.height&&body.tip===state.hash&&
    body.totalIssued===state.supply&&
    body.utxoRoot===stateRootV2(state.utxos)&&
    body.cumulativeWork===state.cumulativeWork.toString(),
    "concordance parent / relais / sommet / émission invalide");
  return state;
}
export function createBatonLedger({
  directory=DEFAULT_BATON_LEDGER_DIR,vertex
}={}){
  check(BATON_V3.vertices.includes(vertex),"sommet A, B ou C requis");
  check(typeof directory==="string"&&directory.length>0,
    "répertoire de registre requis");
  const root=resolve(directory);
  mkdirSync(root,{recursive:true,mode:0o700});
  const filename=join(root,"ledger-"+vertex+".json");
  let current=initialBatonState();
  if(existsSync(filename)){
    let parsed;
    try{parsed=JSON.parse(readFileSync(filename,"utf8"));}
    catch(e){throw Error("SPK-V3-REGISTRE: fichier illisible: "+String(e.message));}
    current=readVerifiedBatonSnapshot(parsed);
  }
  const persist=next=>{
    const payload=verifiedBatonSnapshot(next);
    const temp=filename+"."+randomBytes(6).toString("hex")+".tmp";
    let fd;
    try{
      fd=openSync(temp,"wx",0o600);
      writeFileSync(fd,JSON.stringify(payload)+"\n","utf8");
      fsyncSync(fd);closeSync(fd);fd=null;
      renameSync(temp,filename);
      current=readVerifiedBatonSnapshot(payload);
      return {vertex,filename,height:current.height,
        tip:current.hash,records:payload.entries.length,
        nextRelay:routeForHeight(current.height+1).relayId};
    }catch(e){
      if(fd!==undefined)try{closeSync(fd);}catch{}
      try{unlinkSync(temp);}catch{}
      throw e;
    }
  };
  return {
    vertex,filename,
    get state(){return current;},
    get exists(){return existsSync(filename);},
    persist,
    verify(){return verifiedBatonSnapshot(current);}
  };
}
/**
 * Wallet private keys are maintained in a separate 0600 file.
 * Unlike the public chain ledger, this file MUST NEVER be shared.
 */
export function createOrLoadBatonWallet({
  directory=DEFAULT_BATON_LEDGER_DIR,vertex
}={}){
  check(BATON_V3.vertices.includes(vertex),"sommet wallet invalide");
  const dir=resolve(directory);
  mkdirSync(dir,{recursive:true,mode:0o700});
  const filename=join(dir,"PRIVATE-wallet-"+vertex+".json");
  let wallet;
  if(existsSync(filename)){
    try{wallet=JSON.parse(readFileSync(filename,"utf8"));}
    catch{throw Error("SPK-V3-REGISTRE: clé privée illisible");}
  }else{
    wallet=newIdentity();
    const fd=openSync(filename,"wx",0o600);
    try{
      writeFileSync(fd,JSON.stringify(wallet)+"\n");
      fsyncSync(fd);
    }finally{closeSync(fd);}
  }
  check(wallet&&typeof wallet.publicKey==="string"&&
    typeof wallet.privateKey==="string","portefeuille privé invalide");
  try{
    const restored=createPublicKey(createPrivateKey({
      key:Buffer.from(wallet.privateKey,"base64"),format:"der",type:"pkcs8"
    })).export({format:"der",type:"spki"}).toString("base64");
    check(restored===wallet.publicKey,"clé privée et publique discordantes");
  }catch(e){
    throw Error("SPK-V3-REGISTRE: identité du wallet non validée: "+
      String(e.message||e));
  }
  return {...wallet,owner:address(wallet.publicKey)};
}
