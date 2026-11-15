/**
 * SPARKTIATES POW REGTEST v1 — independent experimental chain.
 * 80-byte Bitcoin-shaped header and real SHA256d, NOT Bitcoin mainnet.
 * No automatic conversion between signed-quorum SPK and mined SPK.
 */
import {createHash} from "node:crypto";
import {address,validAddress,signData,verifyData,stable,digest} from "./chain-core.mjs";

export const POW_POLICY=Object.freeze({
  version:1,chainId:"sparktiates-pow-regtest-v1",symbol:"SPK-POW",
  bits:0x1f0fffff,powLimit:0x207fffff,
  unit:100_000_000,maxSupply:2_100_000_000_000_000,
  firstReward:5_000_000_000,halvingInterval:210_000,
  targetSeconds:30,retarget:false,maxTransactions:40,maxInputs:32,maxOutputs:32
});
const HASH=/^[a-f0-9]{64}$/;
const goodInt=(n,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
const requireValid=(condition,why)=>{if(!condition)throw Error("SPK-POW: "+why);};
const hexBytes=s=>Buffer.from(s,"hex");
const reverse=buffer=>Buffer.from(buffer).reverse();
export function sha256d(input){
  const first=createHash("sha256").update(input).digest();
  return createHash("sha256").update(first).digest();
}
export const displayedHash=input=>reverse(sha256d(input)).toString("hex");
export function targetFromBits(bits){
  requireValid(goodInt(bits,0xffffffff),"bits non uint32");
  const exp=bits>>>24,word=bits&0x007fffff;
  requireValid((bits&0x00800000)===0&&word!==0&&exp>0&&exp<=32,
    "target compact signe, nul ou hors 256 bits");
  const target=exp<=3?BigInt(word)>>(8n*BigInt(3-exp)):
    BigInt(word)<<(8n*BigInt(exp-3));
  requireValid(target>0n&&target<(1n<<256n),"target hors plage");
  return target;
}
export const powLimit=targetFromBits(POW_POLICY.powLimit);
export function validateBits(bits){
  const target=targetFromBits(bits);
  requireValid(target<=powLimit,"difficulté sous le minimum autorisé");
  requireValid(bits===POW_POLICY.bits,"difficulté non conforme à ce regtest fixe");
  return target;
}
export function powDifficultyReport(){
  const target=validateBits(POW_POLICY.bits);
  const range=(1n<<256n);
  return {
    chainId:POW_POLICY.chainId,
    mode:"FIXED_DIFFICULTY_PRIVATE_REGTEST",
    retargetEnabled:POW_POLICY.retarget,
    targetBits:"0x"+POW_POLICY.bits.toString(16),
    powLimitBits:"0x"+POW_POLICY.powLimit.toString(16),
    targetHex:target.toString(16).padStart(64,"0"),
    relativeDifficultyToLimit:(powLimit/target).toString(),
    expectedHashesApprox:(range/(target+1n)).toString(),
    expectedBlockIntervalSeconds:POW_POLICY.targetSeconds,
    observedBlockIntervalSeconds:null,
    physicalCpuGHz:null,
    explanation:"Expected hashes are theoretical; the 30-second target is NOT enforced in this fixed regtest."
  };
}
export function serializeHeader80(h){
  requireValid(h&&h.version===1&&HASH.test(h.previousHash)&&
    HASH.test(h.merkleRoot)&&goodInt(h.timestamp,0xffffffff)&&
    goodInt(h.bits,0xffffffff)&&goodInt(h.nonce,0xffffffff),
    "en-tête invalide");
  const b=Buffer.alloc(80);
  b.writeUInt32LE(h.version,0);
  reverse(hexBytes(h.previousHash)).copy(b,4);
  reverse(hexBytes(h.merkleRoot)).copy(b,36);
  b.writeUInt32LE(h.timestamp,68);
  b.writeUInt32LE(h.bits,72);
  b.writeUInt32LE(h.nonce,76);
  return b;
}
export const headerHash=h=>displayedHash(serializeHeader80(h));
export function proofAccepted(header){
  if(!header||header.bits!==POW_POLICY.bits)return false;
  try{
    const target=validateBits(header.bits);
    return BigInt("0x"+headerHash(header))<=target;
  }catch{return false;}
}
export function searchNonce(header,{start=0,stride=1,maxAttempts=200000}={}){
  requireValid(goodInt(start,0xffffffff)&&goodInt(stride,0xffffffff)&&stride>0&&
    goodInt(maxAttempts,1_000_000)&&maxAttempts>0,"plage de minage invalide");
  const target=validateBits(header.bits);
  const raw=serializeHeader80({...header,nonce:0});
  let attempts=0;
  for(let n=start;n<=0xffffffff&&attempts<maxAttempts;n+=stride){
    raw.writeUInt32LE(n,76);
    const hash=displayedHash(raw);
    attempts++;
    if(BigInt("0x"+hash)<=target)return {found:true,nonce:n,hash,attempts};
  }
  return {found:false,attempts};
}
export function powGenesis(){
  const root=digest("SPK-POW/genesis-policy",POW_POLICY);
  return {kind:"SPK_POW_GENESIS",height:0,
    chainId:POW_POLICY.chainId,policy:POW_POLICY,
    hash:digest("SPK-POW/genesis-v1",{
      policy:POW_POLICY,root,tag:"PRIVATE EXPERIMENT ZERO MARKET VALUE"
    })};
}
export function initialPowState(gen=powGenesis()){
  requireValid(stable(gen)===stable(powGenesis()),"genèse ou politique de chaîne incompatible");
  return {height:0,hash:gen.hash,timestamp:0,
    supply:0,utxos:new Map(),chain:[gen],cumulativeWork:0n};
}
export function powBlockReward(height){
  requireValid(goodInt(height)&&height>0,"hauteur de récompense incorrecte");
  const halves=Math.floor(height/POW_POLICY.halvingInterval);
  return halves>=64?0:Math.floor(POW_POLICY.firstReward/2**halves);
}
export const powMintId=h=>digest("SPK-POW/mint",{
  chainId:POW_POLICY.chainId,height:h
});
export const txUnsigned=tx=>({
  version:tx.version,chainId:tx.chainId,
  inputs:tx.inputs.map(i=>({txid:i.txid,index:i.index,pubKey:i.pubKey})),
  outputs:tx.outputs.map(o=>({to:o.to,amount:o.amount}))
});
const txPayload=tx=>digest("SPK-POW/tx-unsigned-v1",txUnsigned(tx));
export function powTxId(tx){
  return digest("SPK-POW/transaction-v1",{
    ...txUnsigned(tx),witnesses:tx.inputs.map(i=>i.signature)
  });
}
export function signPowTx(unsigned,privateKeys){
  requireValid(unsigned&&Array.isArray(unsigned.inputs)&&Array.isArray(unsigned.outputs)&&
    Array.isArray(privateKeys)&&privateKeys.length===unsigned.inputs.length,
    "transaction sans clés ou entrée");
  const payload=txPayload(unsigned);
  const tx={
    ...txUnsigned(unsigned),
    inputs:unsigned.inputs.map((i,index)=>({
      ...i,signature:signData(privateKeys[index],"SPK-POW/input-v1",{
        chainId:POW_POLICY.chainId,payload,inputIndex:index
      })
    }))
  };
  return {...tx,id:powTxId(tx)};
}
function safeAdd(a,b){
  requireValid(goodInt(a,POW_POLICY.maxSupply)&&goodInt(b,POW_POLICY.maxSupply)&&
    goodInt(a+b,POW_POLICY.maxSupply),"dépassement monétaire");
  return a+b;
}
export function powBalance(state,to){
  return [...state.utxos.values()].filter(u=>u.to===to)
    .reduce((sum,u)=>safeAdd(sum,u.amount),0);
}
function consumeTransaction(map,tx){
  requireValid(tx&&tx.version===1&&tx.chainId===POW_POLICY.chainId&&
    Array.isArray(tx.inputs)&&tx.inputs.length>0&&tx.inputs.length<=POW_POLICY.maxInputs&&
    Array.isArray(tx.outputs)&&tx.outputs.length>0&&tx.outputs.length<=POW_POLICY.maxOutputs,
    "format de transaction incorrect");
  requireValid(HASH.test(tx.id)&&tx.id===powTxId(tx),"empreinte transaction incorrecte");
  const payload=txPayload(tx),spent=new Set();
  let incoming=0,outgoing=0;
  for(let index=0;index<tx.inputs.length;index++){
    const input=tx.inputs[index];
    requireValid(input&&HASH.test(input.txid)&&goodInt(input.index,31),
      "référence d'entrée incorrecte");
    const ref=input.txid+":"+input.index;
    requireValid(!spent.has(ref),"double emploi d'une entrée");
    spent.add(ref);
    const utxo=map.get(ref);
    requireValid(utxo,"double dépense ou UTXO inconnu");
    requireValid(address(input.pubKey)===utxo.to,"signature de mauvais propriétaire");
    requireValid(verifyData(input.pubKey,input.signature,"SPK-POW/input-v1",{
      chainId:POW_POLICY.chainId,payload,inputIndex:index
    }),"signature Ed25519 incorrecte");
    incoming=safeAdd(incoming,utxo.amount);
  }
  for(const output of tx.outputs){
    requireValid(output&&validAddress(output.to)&&
      goodInt(output.amount,POW_POLICY.maxSupply)&&output.amount>0,
      "sortie de transaction incorrecte");
    outgoing=safeAdd(outgoing,output.amount);
  }
  requireValid(outgoing<=incoming,"transactions créent de la monnaie");
  for(const ref of spent)map.delete(ref);
  tx.outputs.forEach((o,index)=>map.set(tx.id+":"+index,{
    to:o.to,amount:o.amount
  }));
  return incoming-outgoing;
}
export const powStateRoot=map=>digest("SPK-POW/utxo-state-v1",
  [...map.entries()].sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0)
    .map(([ref,u])=>({ref,to:u.to,amount:u.amount}))
);
function evaluate(state,height,miner,transactions){
  requireValid(goodInt(height)&&height===state.height+1,"hauteur de bloc incorrecte");
  requireValid(validAddress(miner),"adresse de mineur invalide");
  requireValid(Array.isArray(transactions)&&transactions.length<=POW_POLICY.maxTransactions,
    "nombre de transactions invalide");
  const map=new Map(state.utxos),ids=new Set();
  let fees=0;
  for(const tx of transactions){
    requireValid(!ids.has(tx.id),"transaction dupliquée");
    ids.add(tx.id);
    fees=safeAdd(fees,consumeTransaction(map,tx));
  }
  const reward=powBlockReward(height);
  requireValid(state.supply+reward<=POW_POLICY.maxSupply,"offre maximale atteinte");
  const coinbaseAmount=safeAdd(reward,fees);
  if(coinbaseAmount)map.set(powMintId(height)+":0",{to:miner,amount:coinbaseAmount});
  const supply=safeAdd(state.supply,reward);
  let total=0;
  for(const u of map.values())total=safeAdd(total,u.amount);
  requireValid(total===supply,"invariant UTXO = offre émise violé");
  return {map,fees,reward,coinbaseAmount,supply,stateRoot:powStateRoot(map)};
}
export function powMerkle(leaves){
  requireValid(Array.isArray(leaves)&&leaves.length>0&&
    leaves.every(h=>HASH.test(h)),"feuilles Merkle invalides");
  let layer=[...leaves];
  while(layer.length>1){
    const next=[];
    for(let i=0;i<layer.length;i+=2){
      const first=reverse(hexBytes(layer[i]));
      const second=reverse(hexBytes(layer[i+1]??layer[i]));
      next.push(displayedHash(Buffer.concat([first,second])));
    }
    layer=next;
  }
  return layer[0];
}
function bodyCommitment(body){
  return displayedHash(Buffer.from("SPK-POW/BODY-V1\0"+stable(body),"utf8"));
}
export function makePowCandidate(state,{miner,transactions=[],timestamp=Math.floor(Date.now()/1000)}={}){
  requireValid(goodInt(timestamp,0xffffffff)&&timestamp>=state.timestamp,
    "horodatage incorrect");
  const height=state.height+1;
  const computed=evaluate(state,height,miner,transactions);
  const body={chainId:POW_POLICY.chainId,height,
    coinbase:{to:miner,amount:computed.coinbaseAmount},
    transactions,stateRoot:computed.stateRoot};
  const root=powMerkle([bodyCommitment(body),...transactions.map(tx=>tx.id)]);
  const header={version:1,previousHash:state.hash,merkleRoot:root,
    timestamp,bits:POW_POLICY.bits,nonce:0};
  return {body,header};
}
export function validateMinedBlock(state,block,{now=Math.floor(Date.now()/1000)}={}){
  requireValid(block&&block.body&&block.header,"bloc incomplet");
  const {body,header}=block;
  requireValid(body.chainId===POW_POLICY.chainId&&body.height===state.height+1&&
    header.previousHash===state.hash,"chaîne ou hauteur incompatible");
  requireValid(goodInt(header.timestamp,0xffffffff)&&
    header.timestamp>=state.timestamp&&header.timestamp<=now+120,
    "timestamp de bloc invalide");
  const expected=evaluate(state,body.height,body.coinbase?.to,body.transactions);
  requireValid(body.coinbase.amount===expected.coinbaseAmount,"récompense minée incorrecte");
  requireValid(body.stateRoot===expected.stateRoot,"racine UTXO modifiée");
  const root=powMerkle([bodyCommitment(body),
    ...body.transactions.map(tx=>tx.id)]);
  requireValid(header.merkleRoot===root,"racine de bloc invalide");
  const hash=headerHash(header);
  requireValid(proofAccepted(header),"preuve de travail insuffisante");
  const work=((1n<<256n)/(validateBits(header.bits)+1n));
  return {
    height:body.height,hash,timestamp:header.timestamp,
    supply:expected.supply,utxos:expected.map,
    cumulativeWork:state.cumulativeWork+work,
    chain:[...state.chain,{header,body,hash}]
  };
}
/**
 * Deterministic most-chainwork selection for candidate PRIVATE PoW branches.
 * Re-validates every header, transaction, UTXO and state transition from genesis.
 * On equal work keep the existing chain to prevent unnecessary reorgs.
 * This single-machine regtest has no automatic peer discovery or networking.
 */
export function chooseMostWorkPowChain(currentChain,candidateChain){
  const replay=chain=>{
    requireValid(Array.isArray(chain)&&chain.length>=1&&chain.length<=10001,
      "chaîne PoW candidate invalide");
    let state=initialPowState(chain[0]);
    for(const entry of chain.slice(1)){
      requireValid(entry?.header&&entry?.body,"bloc PoW manquant");
      const verified=validateMinedBlock(state,entry);
      if(entry.hash!==undefined)
        requireValid(entry.hash===verified.hash,"hash de bloc déclaré différent");
      state=verified;
    }
    return state;
  };
  const existing=replay(currentChain);
  const contender=replay(candidateChain);
  const replace=contender.cumulativeWork>existing.cumulativeWork;
  return {
    selected:replace?"candidate":"current",
    tip:replace?contender.hash:existing.hash,
    height:replace?contender.height:existing.height,
    work: (replace?contender:existing).cumulativeWork.toString(),
    currentWork:existing.cumulativeWork.toString(),
    candidateWork:contender.cumulativeWork.toString(),
    tie:existing.cumulativeWork===contender.cumulativeWork,
    bothValid:true,reason:"WORK_CUMULATIF_VALIDÉ"
  };
}
export function minedCorrespondence(state,block){
  const hash=headerHash(block.header),body=block.body;
  const output=validateMinedBlock(state,block);
  return {
    protocol:"SPARKTIATES-POW-REGTEST-V1",
    chainId:POW_POLICY.chainId,height:body.height,headerBytes:80,
    nonce:block.header.nonce,nBits:"0x"+block.header.bits.toString(16),
    targetHex:validateBits(block.header.bits).toString(16).padStart(64,"0"),
    hash,proofValid:proofAccepted(block.header),
    merkleRoot:block.header.merkleRoot,utxoRoot:body.stateRoot,
    blockReward:body.coinbase.amount,
    stateAfter:output.hash,supplyAfter:output.supply,
    comparedToBitcoin:"Header serialization and SHA256d only; transaction and consensus formats differ",
    bitcoinMainnetCompatible:false
  };
}
