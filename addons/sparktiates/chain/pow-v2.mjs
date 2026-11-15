/**
 * SPARKTIATES Full PoW V2 — private retargeting consensus.
 * NEW genesis + chain IDs: never modifies the V1 fixed-difficulty ledger.
 * The only block consensus is SHA256d PoW; Ed25519 signs transactions.
 */
import {address,validAddress,signData,verifyData,digest,stable} from "./chain-core.mjs";
import {serializeHeader80,displayedHash,targetFromBits,powMerkle} from "./pow-core.mjs";

export const V2_POLICY=Object.freeze({
  protocol:2,prefix:"sparktiates-pow-v2",symbol:"SPK-V2",
  networkCount:2048,decimals:8,
  maxSupply:2_100_000_000_000_000,firstReward:5_000_000_000,
  halvingInterval:210_000,
  genesisBits:0x1f0fffff,powLimitBits:0x207fffff,
  targetSeconds:30,retargetInterval:8,
  maxFutureSeconds:120,medianWindow:5,
  maxTransactions:32,maxInputs:32,maxOutputs:32,
  maxChainLength:4096
});
const HASH=/^[0-9a-f]{64}$/;
const fail=message=>{throw Error("SPK-V2: "+message);};
const check=(value,message)=>{if(!value)fail(message);};
const validMoney=n=>Number.isSafeInteger(n)&&n>=0&&n<=V2_POLICY.maxSupply;
const add=(a,b)=>{check(validMoney(a)&&validMoney(b)&&validMoney(a+b),
  "dépassement monétaire");return a+b;};
const TOTAL=1n<<256n;
export const MAX_TARGET=targetFromBits(V2_POLICY.powLimitBits);
export function validNetworkId(id){
  return typeof id==="string"&&/^spk-net-\d{4}$/.test(id)&&
    Number(id.slice(-4))>=1&&Number(id.slice(-4))<=V2_POLICY.networkCount;
}
export function chainIdFor(id){
  check(validNetworkId(id),"identifiant réseau invalide");
  return V2_POLICY.prefix+"/"+id;
}
export function compactFromTarget(value){
  check(typeof value==="bigint"&&value>=1n&&value<=MAX_TARGET,
    "cible à compacter invalide");
  let size=Math.ceil(value.toString(16).length/2);
  let mantissa=size<=3?Number(value<<BigInt((3-size)*8)):
    Number(value>>BigInt((size-3)*8));
  if(mantissa&0x00800000){mantissa>>=8;size++;}
  const bits=size*0x1000000+mantissa;
  check(Number.isSafeInteger(bits)&&bits<=0xffffffff,"nBits trop grand");
  const decoded=targetFromBits(bits);
  check(decoded>=1n&&decoded<=MAX_TARGET,"compactage de cible invalide");
  return bits;
}
export function decodeCanonicalTarget(bits){
  const value=targetFromBits(bits);
  check(value<=MAX_TARGET,"cible sous difficulté minimale");
  check(compactFromTarget(value)===bits,"nBits non canonique");
  return value;
}
export function genesisV2(networkId="spk-net-0001"){
  const chainId=chainIdFor(networkId);
  const body={kind:"SPK_POW_V2_GENESIS",height:0,networkId,chainId,
    policy:V2_POLICY,tag:"EXPERIMENTAL PRIVATE NETWORK ZERO MARKET VALUE"};
  return {...body,hash:digest("SPK-V2/genesis",body)};
}
export function initialV2State(genesis=genesisV2()){
  check(genesis&&stable(genesis)===stable(genesisV2(genesis.networkId)),
    "genèse ou règles inconnues");
  return {networkId:genesis.networkId,chainId:genesis.chainId,height:0,
    hash:genesis.hash,timestamp:0,supply:0,cumulativeWork:0n,
    utxos:new Map(),chain:[genesis]};
}
export function subsidyV2(height){
  check(Number.isSafeInteger(height)&&height>0,"hauteur pour subvention invalide");
  const halvings=Math.floor(height/V2_POLICY.halvingInterval);
  return halvings>=64?0:Math.floor(V2_POLICY.firstReward/(2**halvings));
}
export const mintRefV2=(networkId,height)=>digest("SPK-V2/mint",{
  chainId:chainIdFor(networkId),height
});
export function medianPast(state){
  if(state.height===0)return 0;
  const values=state.chain.slice(-V2_POLICY.medianWindow).map(x=>x.header.timestamp)
    .sort((a,b)=>a-b);
  return values[Math.floor(values.length/2)];
}
/**
 * Retarget ONLY at heights 9, 17, ... after a window of 8 accepted blocks.
 * Observe the 7 intervals across the 8 blocks (7 * 30s).
 * Clamp each update to 1/4..4x; integer BigInt only.
 * NO real-time hashrate, local clock, or peer vote enters the formula.
 */
export function expectedBitsV2(state){
  check(state&&Array.isArray(state.chain)&&state.chain.length===state.height+1,
    "historique PoW V2 invalide");
  if(state.height===0)return V2_POLICY.genesisBits;
  const prior=state.chain.at(-1).header.bits;
  const span=V2_POLICY.retargetInterval;
  if(state.height%span!==0)return prior;
  const window=state.chain.slice(-span);
  check(window.length===span,"fenêtre retarget insuffisante");
  const targetSpan=(span-1)*V2_POLICY.targetSeconds;
  const elapsed=Math.max(1,window.at(-1).header.timestamp-window[0].header.timestamp);
  const clipped=Math.max(Math.floor(targetSpan/4),Math.min(targetSpan*4,elapsed));
  let next=decodeCanonicalTarget(prior)*BigInt(clipped)/BigInt(targetSpan);
  if(next<1n)next=1n;
  if(next>MAX_TARGET)next=MAX_TARGET;
  return compactFromTarget(next);
}
export function difficultyV2(state){
  const bits=expectedBitsV2(state),target=decodeCanonicalTarget(bits);
  return {chainId:state.chainId,height:state.height,nextHeight:state.height+1,
    retargetAtNext:state.height>0&&state.height%V2_POLICY.retargetInterval===0,
    retargetInterval:V2_POLICY.retargetInterval,targetSeconds:V2_POLICY.targetSeconds,
    nextBits:"0x"+bits.toString(16),targetHex:target.toString(16).padStart(64,"0"),
    expectedHashesApprox:(TOTAL/(target+1n)).toString(),
    relativeDifficulty:(MAX_TARGET/target).toString(),
    simulated110GHz:false,observedHashrate:null};
}
export function stateRootV2(utxos){
  return digest("SPK-V2/state",Array.from(utxos.entries())
    .sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0)
    .map(([ref,utxo])=>({ref,to:utxo.to,amount:utxo.amount})));
}
function unsigned(tx){
  check(tx&&Array.isArray(tx.inputs)&&Array.isArray(tx.outputs),
    "structure transaction invalide");
  return {version:tx.version,chainId:tx.chainId,
    inputs:tx.inputs.map(i=>({txid:i.txid,index:i.index,pubKey:i.pubKey})),
    outputs:tx.outputs.map(o=>({to:o.to,amount:o.amount}))};
}
export function transactionIdV2(tx){
  return digest("SPK-V2/txid",{...unsigned(tx),
    signatures:tx.inputs.map(i=>i.signature)});
}
export function signTransactionV2(draft,privateKeys){
  check(Array.isArray(privateKeys)&&privateKeys.length===draft?.inputs?.length,
    "clés de transaction manquantes");
  const body=unsigned(draft),payload=digest("SPK-V2/tx-message",body);
  const inputs=body.inputs.map((i,index)=>({...i,
    signature:signData(privateKeys[index],"SPK-V2/tx-sign",{
      chainId:body.chainId,payload,index})}));
  const tx={...body,inputs};
  return {...tx,id:transactionIdV2(tx)};
}
function applyTx(utxos,tx,chainId){
  check(tx&&tx.version===1&&tx.chainId===chainId&&
    Array.isArray(tx.inputs)&&tx.inputs.length>=1&&tx.inputs.length<=V2_POLICY.maxInputs&&
    Array.isArray(tx.outputs)&&tx.outputs.length>=1&&tx.outputs.length<=V2_POLICY.maxOutputs,
    "transaction hors réseau ou format incorrect");
  check(HASH.test(tx.id)&&transactionIdV2(tx)===tx.id,"identifiant TX invalide");
  const payload=digest("SPK-V2/tx-message",unsigned(tx));
  let inputs=0,outputs=0;const seen=new Set();
  for(let index=0;index<tx.inputs.length;index++){
    const i=tx.inputs[index];
    check(i&&HASH.test(i.txid)&&Number.isInteger(i.index)&&i.index>=0&&i.index<=31,
      "référence entrée invalide");
    const ref=i.txid+":"+i.index;
    check(!seen.has(ref),"entrée répétée");
    seen.add(ref);
    const utxo=utxos.get(ref);
    check(utxo,"UTXO inconnu ou double dépense");
    check(address(i.pubKey)===utxo.to,"propriétaire différent");
    check(verifyData(i.pubKey,i.signature,"SPK-V2/tx-sign",{
      chainId,payload,index}),"signature transaction invalide");
    inputs=add(inputs,utxo.amount);
  }
  for(const o of tx.outputs){
    check(o&&validAddress(o.to)&&validMoney(o.amount)&&o.amount>0,
      "sortie TX invalide");
    outputs=add(outputs,o.amount);
  }
  check(inputs>=outputs,"transaction crée des fonds");
  for(const ref of seen)utxos.delete(ref);
  tx.outputs.forEach((o,index)=>utxos.set(tx.id+":"+index,{
    to:o.to,amount:o.amount}));
  return inputs-outputs;
}
function computeNext(state,body){
  check(body&&body.chainId===state.chainId&&body.height===state.height+1,
    "bloc étranger ou mauvaise hauteur");
  check(Array.isArray(body.transactions)&&
    body.transactions.length<=V2_POLICY.maxTransactions,"trop de transactions");
  check(body.coinbase&&validAddress(body.coinbase.to),"adresse minière invalide");
  const utxos=new Map(state.utxos),ids=new Set();let fees=0;
  for(const tx of body.transactions){
    check(!ids.has(tx.id),"transaction répétée");
    ids.add(tx.id);fees=add(fees,applyTx(utxos,tx,state.chainId));
  }
  const subsidy=subsidyV2(body.height),coinbase=add(subsidy,fees);
  check(body.coinbase.amount===coinbase,"récompense minière incorrecte");
  const supply=add(state.supply,subsidy);
  if(coinbase>0)utxos.set(mintRefV2(state.networkId,body.height)+":0",
    {to:body.coinbase.to,amount:coinbase});
  let total=0;
  for(const item of utxos.values())total=add(total,item.amount);
  check(total===supply,"invariant offre = UTXO violé");
  return {utxos,supply,stateRoot:stateRootV2(utxos),fees};
}
function bodyHash(body){
  return displayedHash(Buffer.from("SPK-V2/BODY\0"+stable(body),"utf8"));
}
export function candidateV2(state,{
  miner,transactions=[],timestamp=Math.floor(Date.now()/1000)
}={}){
  check(Number.isSafeInteger(timestamp)&&timestamp>=0&&timestamp<=0xffffffff,
    "horodatage invalide");
  check(timestamp>medianPast(state)&&timestamp>=state.timestamp,
    "temps antérieur à la médiane");
  const height=state.height+1;
  const draft={chainId:state.chainId,height,
    coinbase:{to:miner,amount:0},transactions,stateRoot:""};
  // Derive the precise reward and state without bypassing transition checks.
  // First calculate fees independently on a scratch UTXO map.
  const scratch=new Map(state.utxos);let fees=0;const ids=new Set();
  check(Array.isArray(transactions)&&transactions.length<=V2_POLICY.maxTransactions,
    "nombre transactions invalide");
  for(const tx of transactions){
    check(!ids.has(tx.id),"transaction répétée");
    ids.add(tx.id);fees=add(fees,applyTx(scratch,tx,state.chainId));
  }
  draft.coinbase.amount=add(subsidyV2(height),fees);
  const evaluation=computeNext(state,draft);
  draft.stateRoot=evaluation.stateRoot;
  const merkleRoot=powMerkle([bodyHash(draft),...transactions.map(x=>x.id)]);
  const header={version:1,previousHash:state.hash,merkleRoot,
    timestamp,bits:expectedBitsV2(state),nonce:0};
  return {header,body:draft};
}
export function acceptBlockV2(state,block,{now=Math.floor(Date.now()/1000)}={}){
  check(block&&block.header&&block.body,"bloc inexistant");
  const {header,body}=block;
  check(Number.isSafeInteger(header.timestamp)&&header.timestamp<=now+V2_POLICY.maxFutureSeconds,
    "bloc du futur");
  check(header.timestamp>medianPast(state)&&header.timestamp>=state.timestamp,
    "timestamp sous médiane ou temps régressif");
  check(header.previousHash===state.hash&&body.chainId===state.chainId&&
    body.height===state.height+1,"mauvaise chaîne, hauteur ou réseau");
  check(header.bits===expectedBitsV2(state),"difficulté incorrecte pour cette hauteur");
  const target=decodeCanonicalTarget(header.bits);
  const calculated=computeNext(state,body);
  check(body.stateRoot===calculated.stateRoot,"racine UTXO invalide");
  const merkle=powMerkle([bodyHash(body),...body.transactions.map(x=>x.id)]);
  check(header.merkleRoot===merkle,"racine Merkle invalide");
  const hash=displayedHash(serializeHeader80(header));
  check(BigInt("0x"+hash)<=target,"preuve de travail insuffisante");
  if(block.hash!==undefined)check(block.hash===hash,"empreinte déclarée différente");
  const work=TOTAL/(target+1n);
  return {networkId:state.networkId,chainId:state.chainId,height:body.height,
    hash,timestamp:header.timestamp,supply:calculated.supply,utxos:calculated.utxos,
    cumulativeWork:state.cumulativeWork+work,
    chain:[...state.chain,{header,body,hash}]};
}
export function replayV2(chain,{now=Math.floor(Date.now()/1000)}={}){
  check(Array.isArray(chain)&&chain.length>=1&&
    chain.length<=V2_POLICY.maxChainLength,"taille de chaîne hors limites");
  let state=initialV2State(chain[0]);
  for(const block of chain.slice(1))state=acceptBlockV2(state,block,{now});
  return state;
}
export function chooseChainV2(existing,candidate,{now=Math.floor(Date.now()/1000)}={}){
  const a=replayV2(existing,{now}),b=replayV2(candidate,{now});
  check(a.chainId===b.chainId,"chaîne d'un autre réseau rejetée");
  const better=b.cumulativeWork>a.cumulativeWork;
  return {selected:better?"candidate":"current",
    work:(better?b:a).cumulativeWork.toString(),height:(better?b:a).height,
    tip:(better?b:a).hash,chainId:a.chainId,
    currentWork:a.cumulativeWork.toString(),candidateWork:b.cumulativeWork.toString(),
    tie:a.cumulativeWork===b.cumulativeWork};
}
export function balanceV2(state,owner){
  return Array.from(state.utxos.values()).filter(x=>x.to===owner)
    .reduce((sum,x)=>add(sum,x.amount),0);
}
