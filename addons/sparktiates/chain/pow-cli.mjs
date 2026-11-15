/**
 * SPARKTIATES POW command line: bounded proof-of-work blocks, persistent
 * regtest ledger outside the public repository. No Bitcoin mainnet, no wallet
 * import or pool connection. Node.js CPU physical SHA256d.
 */
import {mkdir,readFile,writeFile,rename,open,unlink} from "node:fs/promises";
import {join,dirname} from "node:path";
import {homedir} from "node:os";
import {randomBytes} from "node:crypto";
import {newIdentity,address,stable} from "./chain-core.mjs";
import {
  POW_POLICY,powGenesis,initialPowState,
  makePowCandidate,validateMinedBlock,powBalance,minedCorrespondence
} from "./pow-core.mjs";
import {mineCandidate,benchmarkSha256d} from "./pow-miner.mjs";
import {demonstratePow} from "./pow-demo.mjs";

export const DEFAULT_POW_DIRECTORY=join(
  homedir(),".sparktiates","chain","pow-private-v1"
);
function pathOf(dir,name){return join(dir,name);}
async function atomicJSON(file,data){
  await mkdir(dirname(file),{recursive:true,mode:0o700});
  const tmp=file+"."+randomBytes(8).toString("hex")+".tmp";
  try{
    await writeFile(tmp,JSON.stringify(data,null,2)+"\n",{mode:0o600,flag:"wx"});
    await rename(tmp,file);
  }catch(e){
    await unlink(tmp).catch(()=>{});
    throw e;
  }
}
async function loadWallet(dir,{create=false}={}){
  const file=pathOf(dir,"miner-wallet-private.json");
  try{
    const data=JSON.parse(await readFile(file,"utf8"));
    if(!data||typeof data.publicKey!=="string"||typeof data.privateKey!=="string")
      throw Error("Portefeuille expérimental corrompu");
    const owner=address(data.publicKey);
    return {...data,address:owner};
  }catch(e){
    if(e.code!=="ENOENT"||!create)throw e;
    const data=newIdentity();
    await atomicJSON(file,data);
    return {...data,address:address(data.publicKey)};
  }
}
export async function loadPowLedger(dir){
  const file=pathOf(dir,"ledger.json");
  const genesis=powGenesis();
  let state=initialPowState(genesis),hasFile=false;
  try{
    const saved=JSON.parse(await readFile(file,"utf8"));
    hasFile=true;
    if(saved.schema!==1||saved.genesisHash!==genesis.hash||
       !Array.isArray(saved.blocks)||saved.blocks.length>10000)
      throw Error("SPK POW: fichier ou genèse incompatibles");
    for(const block of saved.blocks){
      state=validateMinedBlock(state,block);
    }
    if(saved.height!==state.height||saved.tip!==state.hash||
       saved.supply!==state.supply||
       saved.cumulativeWork!==state.cumulativeWork.toString())
      throw Error("SPK POW: divergence de la preuve cumulée ou de l'état sauvegardé");
  }catch(e){
    if(e.code!=="ENOENT")throw e;
  }
  return {state,genesis,hasFile,file};
}
async function persistPowLedger(file,state,genesis){
  await atomicJSON(file,{
    schema:1,network:POW_POLICY.chainId,
    genesisHash:genesis.hash,
    height:state.height,tip:state.hash,
    supply:state.supply,cumulativeWork:state.cumulativeWork.toString(),
    blocks:state.chain.slice(1)
  });
}
async function withLock(dir,work){
  await mkdir(dir,{recursive:true,mode:0o700});
  const file=pathOf(dir,"mining.lock");
  let handle;
  try{
    handle=await open(file,"wx",0o600);
    await handle.writeFile("Exclusive SPARKTIATES POW mining lock\n");
    return await work();
  }catch(e){
    if(e.code==="EEXIST")
      throw Error("Un calcul minier est déjà verrouillé : vérifier le processus et le lock.");
    throw e;
  }finally{
    if(handle){await handle.close();await unlink(file).catch(()=>{});}
  }
}
export async function minePersistent({dir=DEFAULT_POW_DIRECTORY,blocks=1,
  workers=2,maxAttempts=200000}={}){
  if(!Number.isSafeInteger(blocks)||blocks<1||blocks>8)
    throw Error("SPK POW: 1 à 8 blocs par invocation");
  return withLock(dir,async()=>{
    const {state:starting,genesis,file}=await loadPowLedger(dir);
    const miner=await loadWallet(dir,{create:true});
    let state=starting;
    const report=[];
    for(let i=0;i<blocks;i++){
      const candidate=makePowCandidate(state,{miner:miner.address,
        timestamp:Math.max(Math.floor(Date.now()/1000),state.timestamp)});
      const mined=await mineCandidate(candidate,{workers,maxAttempts});
      const previous=state;
      state=validateMinedBlock(state,mined.block);
      const correspondence=minedCorrespondence(previous,mined.block);
      await persistPowLedger(file,state,genesis);
      report.push({
        height:state.height,hash:state.hash,nonce:mined.report.nonce,
        hashesExecuted:mined.report.attempts,
        elapsedMs:mined.report.elapsedMs,
        realHashPerSecond:mined.report.realHashPerSecond,
        targetHex:correspondence.targetHex,
        proofValid:correspondence.proofValid,
        minerRewardAtomic:mined.block.body.coinbase.amount
      });
    }
    return {
      status:"PASS",network:POW_POLICY.chainId,genesisHash:genesis.hash,
      height:state.height,tip:state.hash,
      supplyAtomic:state.supply,minerAddress:miner.address,
      minerBalanceAtomic:powBalance(state,miner.address),
      cumulativeWork:state.cumulativeWork.toString(),
      blocks:report,persisted:true,realBitcoinBTC:0,
      physical110GHz:false,backend:"Node.js CPU worker_threads"
    };
  });
}
export async function powStatus(dir=DEFAULT_POW_DIRECTORY){
  const {state,genesis,hasFile}=await loadPowLedger(dir);
  let owner=null,balanceAtomic=null;
  try{
    const wallet=await loadWallet(dir);
    owner=wallet.address;balanceAtomic=powBalance(state,owner);
  }catch(e){if(e.code!=="ENOENT")throw e;}
  return {network:POW_POLICY.chainId,genesisHash:genesis.hash,
    height:state.height,hash:state.hash,
    supplyAtomic:state.supply,cumulativeWork:state.cumulativeWork.toString(),
    persisted:hasFile,minerAddress:owner,minerBalanceAtomic:balanceAtomic,
    bitcoinMainnet:false,marketValue:"NONE",physical110GHz:false};
}
async function main(){
  const [action="status",raw]=process.argv.slice(2);
  if(action==="demo"){
    const result=await demonstratePow();
    if(result.status!=="PASS")throw Error("Demo minage non concluant");
    console.log("SPARKTIATES_POW_DEMO_PASS",JSON.stringify(result,null,2));
  }else if(action==="mine"){
    const count=raw===undefined?2:Number(raw);
    console.log("SPARKTIATES_POW_MINING_PASS",JSON.stringify(
      await minePersistent({blocks:count}),null,2));
  }else if(action==="status"){
    console.log("SPARKTIATES_POW_STATUS",JSON.stringify(await powStatus(),null,2));
  }else if(action==="benchmark"){
    console.log("SPARKTIATES_POW_SHA256D_BENCH",JSON.stringify(
      benchmarkSha256d({iterations:10000}),null,2));
  }else if(action==="correspondence"){
    const {state}=await loadPowLedger(DEFAULT_POW_DIRECTORY);
    if(state.height===0)throw Error("Aucun bloc miné : commence par mine 2");
    const prev=initialPowState(powGenesis());
    const reports=[];
    let prior=prev;
    for(const block of state.chain.slice(1)){
      reports.push(minedCorrespondence(prior,block));
      prior=validateMinedBlock(prior,block);
    }
    console.log("SPARKTIATES_POW_CORRESPONDENCE",JSON.stringify({
      network:POW_POLICY.chainId,
      mainnetBitcoinCompatible:false,
      validatedBlocks:reports.length,proofs:reports
    },null,2));
  }else{
    throw Error("Commande: demo | benchmark | mine [1..8] | status | correspondence");
  }
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href){
  main().catch(e=>{
    console.error("SPARKTIATES_POW_ERROR",String(e?.stack||e));
    process.exitCode=1;
  });
}
