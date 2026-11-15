/**
 * SPARKTIATES CHAIN v0.1 — independent, PRIVATE experimental ledger.
 * Zero mainnet Bitcoin compatibility; no financial value is asserted.
 * Ed25519 + SHA-256; deterministic JSON representation; UTXO model.
 * Not production cryptocurrency, not audited Byzantine consensus.
 */
import {
  createHash,createPublicKey,createPrivateKey,generateKeyPairSync,sign,verify
} from "node:crypto";

export const POLICY=Object.freeze({
  version:1,
  chainId:"sparktiates-regtest-v1",
  symbol:"SPK",
  decimals:8,
  atomicUnitsPerCoin:100_000_000,
  maxSupply:2_100_000_000_000_000,
  firstReward:5_000_000_000,
  halvingInterval:210_000,
  targetSeconds:30,
  validators:3,
  quorum:2,
  maxTransactions:100,
  maxInputs:32,
  maxOutputs:32
});
const isMoney=n=>Number.isSafeInteger(n)&&n>=0&&n<=POLICY.maxSupply;
const isPositiveMoney=n=>isMoney(n)&&n>0;
const fail=message=>{throw Error("SPK: "+message);};
export function stable(value){
  if(value===null)return "null";
  if(typeof value==="string"||typeof value==="boolean")return JSON.stringify(value);
  if(typeof value==="number"){
    if(!Number.isSafeInteger(value))fail("entier non sûr interdit");
    return String(value);
  }
  if(Array.isArray(value))return "["+value.map(stable).join(",")+"]";
  if(typeof value==="object"&&Object.getPrototypeOf(value)===Object.prototype){
    const keys=Object.keys(value).sort();
    return "{"+keys.map(k=>JSON.stringify(k)+":"+stable(value[k])).join(",")+"}";
  }
  fail("type non canonique");
}
export const sha256=data=>createHash("sha256").update(data).digest("hex");
export const digest=(domain,data)=>sha256(domain+"\0"+stable(data));
const bytes=hex=>Buffer.from(hex,"hex");
function base64Bytes(value,max=120){
  if(typeof value!=="string"||value.length>max||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)||value.length%4!==0)
    fail("encodage base64 invalide");
  const result=Buffer.from(value,"base64");
  if(result.toString("base64")!==value)fail("base64 non canonique");
  return result;
}
function publicKey(pub){
  const b=base64Bytes(pub,96);
  if(b.length!==44)fail("clé publique SPKI attendue sur 44 octets");
  const key=createPublicKey({key:b,format:"der",type:"spki"});
  if(key.asymmetricKeyType!=="ed25519")fail("clé non Ed25519");
  return key;
}
function privateKey(pk){
  const b=base64Bytes(pk,200);
  const key=createPrivateKey({key:b,format:"der",type:"pkcs8"});
  if(key.asymmetricKeyType!=="ed25519")fail("clé privée non Ed25519");
  return key;
}
export function newIdentity(){
  const {publicKey:pub,privateKey:priv}=generateKeyPairSync("ed25519");
  return {
    publicKey:pub.export({format:"der",type:"spki"}).toString("base64"),
    privateKey:priv.export({format:"der",type:"pkcs8"}).toString("base64")
  };
}
export function address(pub){
  publicKey(pub);
  return "spk1_"+sha256(base64Bytes(pub)).slice(0,40);
}
export const validAddress=a=>typeof a==="string"&&/^spk1_[a-f0-9]{40}$/.test(a);
function signedBytes(domain,obj){return bytes(digest(domain,obj));}
export function signData(privateDer,domain,obj){
  return sign(null,signedBytes(domain,obj),privateKey(privateDer)).toString("base64");
}
export function verifyData(pub,signature,domain,obj){
  try{
    return verify(null,signedBytes(domain,obj),publicKey(pub),base64Bytes(signature,100));
  }catch{return false;}
}
export function validatorList(validators){
  if(!Array.isArray(validators)||validators.length!==3)fail("exactement 3 validateurs nécessaires");
  const ids=new Set(),pubs=new Set();
  const result=validators.map(v=>{
    if(!v||typeof v.id!=="string"||!/^[a-z][a-z0-9_-]{0,30}$/.test(v.id))
      fail("identifiant validateur invalide");
    publicKey(v.publicKey);
    if(ids.has(v.id)||pubs.has(v.publicKey))fail("validateur dupliqué");
    ids.add(v.id);pubs.add(v.publicKey);
    return {id:v.id,publicKey:v.publicKey};
  });
  result.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  return result;
}
export function genesis(validators){
  const list=validatorList(validators);
  const body={
    version:POLICY.version,chainId:POLICY.chainId,height:0,
    previousHash:"0".repeat(64),timestamp:0,validators:list,
    policy:POLICY,distribution:[],supply:0,
    tag:"PRIVATE EXPERIMENT — ZERO VALUE"
  };
  return {...body,hash:digest("SPK/genesis/v1",body)};
}
export function blockReward(height){
  if(!Number.isSafeInteger(height)||height<1)fail("hauteur invalide");
  const shift=Math.floor(height/POLICY.halvingInterval);
  if(shift>=64)return 0;
  return Math.floor(POLICY.firstReward/2**shift);
}
export const mintTxid=height=>digest("SPK/mint-reference/v1",{chainId:POLICY.chainId,height});
export function utxoRoot(map){
  const ordered=[...map.entries()].sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0).map(([ref,u])=>({
    ref,to:u.to,amount:u.amount
  }));
  return digest("SPK/utxo-state/v1",ordered);
}
export function merkleRoot(hashes){
  if(!hashes.length)return sha256("SPK/EMPTY/TX");
  let layer=hashes.map(x=>{
    if(!/^[a-f0-9]{64}$/.test(x))fail("feuille Merkle incorrecte");
    return x;
  });
  while(layer.length>1){
    const next=[];
    for(let i=0;i<layer.length;i+=2){
      const a=layer[i],b=layer[i+1]||layer[i];
      next.push(sha256(Buffer.concat([bytes(a),bytes(b)])));
    }
    layer=next;
  }
  return layer[0];
}
export function txBody(tx){
  if(!tx||typeof tx!=="object"||!Array.isArray(tx.inputs)||!Array.isArray(tx.outputs))
    fail("transaction invalide");
  return {
    version:tx.version,chainId:tx.chainId,
    inputs:tx.inputs.map(i=>({txid:i.txid,index:i.index,pubKey:i.pubKey})),
    outputs:tx.outputs.map(o=>({to:o.to,amount:o.amount}))
  };
}
export const txMessage=tx=>digest("SPK/tx-message/v1",txBody(tx));
export const txId=tx=>digest("SPK/txid/v1",{
  ...txBody(tx),
  witnesses:tx.inputs.map(i=>i.signature)
});
export function signTransaction(draft,keys){
  const draftBody=txBody(draft);
  if(!Array.isArray(keys)||keys.length!==draftBody.inputs.length)
    fail("clés manquantes pour les entrées");
  const signed={...draftBody,inputs:draftBody.inputs.map((i,index)=>({
    ...i,signature:signData(keys[index],"SPK/input/v1",{
      chainId:POLICY.chainId,txMessage:txMessage(draftBody),index
    })
  }))};
  return {...signed,id:txId(signed)};
}
export function initialState(configGenesis){
  if(stable(configGenesis)!==stable(genesis(configGenesis.validators)))
    fail("genèse incompatible ou paramètres monétaires modifiés");
  return {
    height:0,hash:configGenesis.hash,timestamp:0,
    supply:0,utxos:new Map(),chain:[configGenesis]
  };
}
function safeAdd(a,b){
  if(!isMoney(a)||!isMoney(b)||!Number.isSafeInteger(a+b)||a+b>POLICY.maxSupply)
    fail("dépassement monétaire");
  return a+b;
}
function applyTx(utxos,tx){
  if(!tx||tx.version!==1||tx.chainId!==POLICY.chainId||
    !Array.isArray(tx.inputs)||tx.inputs.length<1||tx.inputs.length>POLICY.maxInputs||
    !Array.isArray(tx.outputs)||tx.outputs.length<1||tx.outputs.length>POLICY.maxOutputs)
    fail("structure transaction incompatible");
  const body=txBody(tx);
  if(!/^[a-f0-9]{64}$/.test(String(tx.id))||txId(tx)!==tx.id)
    fail("identifiant transaction non valide");
  let inputsSum=0,outputsSum=0;
  const seen=new Set();
  for(let i=0;i<tx.inputs.length;i++){
    const item=tx.inputs[i];
    if(!/^[a-f0-9]{64}$/.test(String(item.txid))||
       !Number.isSafeInteger(item.index)||item.index<0||item.index>31)
      fail("référence UTXO invalide");
    const ref=item.txid+":"+item.index;
    if(seen.has(ref))fail("double entrée dans une transaction");
    seen.add(ref);
    const available=utxos.get(ref);
    if(!available)fail("UTXO inexistant ou déjà dépensé");
    if(address(item.pubKey)!==available.to)fail("propriétaire différent");
    if(!verifyData(item.pubKey,item.signature,"SPK/input/v1",{
      chainId:POLICY.chainId,txMessage:txMessage(body),index:i
    }))fail("signature transaction invalide");
    inputsSum=safeAdd(inputsSum,available.amount);
  }
  for(const output of tx.outputs){
    if(!validAddress(output.to)||!isPositiveMoney(output.amount))
      fail("sortie UTXO invalide");
    outputsSum=safeAdd(outputsSum,output.amount);
  }
  if(outputsSum>inputsSum)fail("création monétaire par transaction");
  for(const ref of seen)utxos.delete(ref);
  tx.outputs.forEach((o,index)=>utxos.set(tx.id+":"+index,{to:o.to,amount:o.amount}));
  return inputsSum-outputsSum;
}
export function proposeBody(state,{validators,proposer,timestamp,transactions=[],coinbaseTo}={}){
  const ordered=validatorList(validators);
  const height=state.height+1;
  const expected=ordered[(height-1)%ordered.length].id;
  if(proposer!==expected)fail("proposeur hors tour");
  const body={
    version:1,chainId:POLICY.chainId,height,
    previousHash:state.hash,timestamp,
    proposer,transactions,coinbase:{
      to:coinbaseTo,amount:0
    },merkleRoot:merkleRoot(transactions.map(tx=>tx.id)),stateRoot:""
  };
  const {state:transformed,fees}=transition(state,body,ordered,{draft:true});
  body.coinbase.amount=blockReward(height)+fees;
  if(!isMoney(body.coinbase.amount))fail("récompense invalide");
  const second=transition(state,body,ordered,{draft:true});
  body.stateRoot=utxoRoot(second.state.utxos);
  return body;
}
export function transition(state,body,validators,{draft=false}={}){
  const vs=validatorList(validators);
  if(!body||body.version!==1||body.chainId!==POLICY.chainId||
     body.height!==state.height+1||body.previousHash!==state.hash||
     body.proposer!==vs[(body.height-1)%3].id||
     !Number.isSafeInteger(body.timestamp)||body.timestamp<state.timestamp||
     body.timestamp<0)
    fail("bloc hors chaîne, hors tour ou horodatage incorrect");
  if(!Array.isArray(body.transactions)||body.transactions.length>POLICY.maxTransactions)
    fail("trop de transactions");
  if(!body.coinbase||!validAddress(body.coinbase.to)||!isMoney(body.coinbase.amount))
    fail("sortie de récompense invalide");
  const hashes=body.transactions.map(tx=>tx.id);
  if(body.merkleRoot!==merkleRoot(hashes))fail("racine Merkle invalide");
  const utxos=new Map(state.utxos),seenTx=new Set();
  let fees=0;
  for(const tx of body.transactions){
    if(seenTx.has(tx.id))fail("transaction répétée");
    seenTx.add(tx.id);
    fees=safeAdd(fees,applyTx(utxos,tx));
  }
  const reward=blockReward(body.height);
  if(state.supply+reward>POLICY.maxSupply)fail("plafond monétaire dépassé");
  if(!draft&&body.coinbase.amount!==safeAdd(reward,fees))
    fail("récompense + frais incorrects");
  const coinbaseAmount=draft?safeAdd(reward,fees):body.coinbase.amount;
  if(coinbaseAmount>0)
    utxos.set(mintTxid(body.height)+":0",{to:body.coinbase.to,amount:coinbaseAmount});
  const root=utxoRoot(utxos);
  const supplyAfter=safeAdd(state.supply,reward);
  let sumUTXO=0;
  for(const value of utxos.values())sumUTXO=safeAdd(sumUTXO,value.amount);
  if(sumUTXO!==supplyAfter)
    fail("invariant comptable violé : somme UTXO ≠ émission totale");
  if(!draft&&body.stateRoot!==root)fail("racine d'état UTXO incorrecte");
  const next={
    height:body.height,
    hash:digest("SPK/block/v1",body),
    timestamp:body.timestamp,
    supply:supplyAfter,
    utxos,
    chain:state.chain
  };
  return {state:next,fees,stateRoot:root};
}
export const voteMessage=(height,hash)=>({
  chainId:POLICY.chainId,kind:"LOCKED_VOTE_V1",height,hash
});
export const signVote=(privateDer,height,hash)=>
  signData(privateDer,"SPK/vote/v1",voteMessage(height,hash));
export function verifyCertificate(body,certificate,validators){
  const vs=validatorList(validators);
  if(!Array.isArray(certificate)||certificate.length<2||certificate.length>3)
    fail("quorum absent");
  const hash=digest("SPK/block/v1",body),used=new Set();
  for(const vote of certificate){
    if(!vote||typeof vote.validator!=="string"||used.has(vote.validator))
      fail("double vote ou identifiant invalide");
    const v=vs.find(x=>x.id===vote.validator);
    if(!v||!verifyData(v.publicKey,vote.signature,"SPK/vote/v1",
      voteMessage(body.height,hash)))fail("signature de quorum invalide");
    used.add(vote.validator);
  }
  if(used.size<POLICY.quorum)fail("quorum insuffisant");
  return hash;
}
export function commitBlock(state,body,certificate,validators){
  const hash=verifyCertificate(body,certificate,validators);
  const transformed=transition(state,body,validators).state;
  if(transformed.hash!==hash)fail("empreinte bloc incohérente");
  return {
    ...transformed,chain:[...state.chain,{body,certificate,hash}]
  };
}
export const balance=(state,owner)=>
  [...state.utxos.values()].filter(u=>u.to===owner)
    .reduce((sum,u)=>safeAdd(sum,u.amount),0);
export const spendables=(state,owner)=>
  [...state.utxos.entries()].filter(([,u])=>u.to===owner)
    .map(([ref,u])=>{
      const i=ref.lastIndexOf(":");
      return {txid:ref.slice(0,i),index:Number(ref.slice(i+1)),...u};
    });
