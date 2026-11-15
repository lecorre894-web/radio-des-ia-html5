/**
 * Regression order: A protocols -> B verified SHA256d -> C mining ->
 * D correspondence -> E retarget tests -> F private full-duplex overlay.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {newIdentity,address} from "../addons/sparktiates/chain/chain-core.mjs";
import {serializeHeader80,displayedHash} from "../addons/sparktiates/chain/pow-core.mjs";
import {
  V2_POLICY,genesisV2,initialV2State,chainIdFor,
  validNetworkId,expectedBitsV2,decodeCanonicalTarget,
  compactFromTarget,difficultyV2,candidateV2,
  acceptBlockV2,replayV2,chooseChainV2,signTransactionV2,
  balanceV2,mintRefV2
} from "../addons/sparktiates/chain/pow-v2.mjs";
import {
  networkIdAt,createNetworkCatalog,deriveNetworkSecret
} from "../addons/sparktiates/chain/pow-networks.mjs";
import {mineV2Sequential,mineV2Parallel} from "../addons/sparktiates/chain/pow-v2-miner.mjs";
import {createFullDuplexOverlay} from "../addons/sparktiates/chain/pow-overlay-duplex.mjs";

const secret="SPARKTIATES_TEST_SECRET_abcdefghijklmnopqrstuvwxyz_2026";
const base=Math.floor(Date.now()/1000)-7200;
function nextBlock(state,owner,timestamp,transactions=[]){
  const draft=candidateV2(state,{miner:owner,timestamp,transactions});
  const mined=mineV2Sequential(draft,{maxAttempts:1_000_000});
  return mined.block;
}
async function waitUntil(fn,{ms=5000}={}){
  const start=Date.now();
  while(Date.now()-start<ms){
    if(fn())return;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  throw Error("SPK overlay test timeout");
}
test("A: 2 048 réseaux déterministes ont des genèses distinctes et aucune machine imaginée",()=>{
  const catalog=createNetworkCatalog();
  assert.equal(catalog.count,2048);
  assert.equal(catalog.entries.length,2048);
  assert.equal(new Set(catalog.entries.map(n=>n.genesisHash)).size,2048);
  assert.equal(networkIdAt(1),"spk-net-0001");
  assert.equal(networkIdAt(2048),"spk-net-2048");
  assert.equal(validNetworkId("spk-net-2049"),false);
  assert.notEqual(genesisV2("spk-net-0001").hash,genesisV2("spk-net-0002").hash);
  assert.notEqual(deriveNetworkSecret(secret,"spk-net-0001"),
    deriveNetworkSecret(secret,"spk-net-0002"));
  assert.equal(catalog.entries.every(n=>n.private&&n.activated===false),true);
  assert.equal(V2_POLICY.targetSeconds,30);
  assert.equal(V2_POLICY.retargetInterval,8);
  assert.equal(V2_POLICY.networkCount,2048);
});
test("B: en-tête 80 octets et preuve réelle SHA256d, non simulée",()=>{
  const miner=newIdentity();
  const initial=initialV2State(genesisV2("spk-net-0001"));
  const candidate=candidateV2(initial,{miner:address(miner.publicKey),timestamp:base+1});
  const bytes=serializeHeader80(candidate.header);
  assert.equal(bytes.length,80);
  const mined=mineV2Sequential(candidate);
  assert.equal(displayedHash(serializeHeader80(mined.block.header)),mined.block.hash);
  assert.ok(BigInt("0x"+mined.block.hash)<=decodeCanonicalTarget(mined.block.header.bits));
  assert.equal(acceptBlockV2(initial,mined.block).height,1);
  assert.ok(mined.report.realHashPerSecond>0);
});
test("C: CPU multi-worker atteint un nonce prouvé avec difficulté V2",async()=>{
  const miner=newIdentity(),state=initialV2State();
  const candidate=candidateV2(state,{miner:address(miner.publicKey),timestamp:base+1});
  const mined=await mineV2Parallel(candidate,{workers:2,maxAttempts:1_000_000});
  assert.equal(mined.report.proofValid,true);
  assert.equal(mined.report.virtual110GHz,false);
  assert.equal(mined.report.workers,2);
  assert.ok(mined.report.realHashPerSecond>0);
  assert.equal(acceptBlockV2(state,mined.block).hash,mined.report.hash);
});
test("D: concordance entre émission, transaction signée, stateRoot et PoW",()=>{
  const alice=newIdentity(),bob=newIdentity();
  const walletA=address(alice.publicKey),walletB=address(bob.publicKey);
  const initial=initialV2State(genesisV2("spk-net-0007"));
  const first=nextBlock(initial,walletA,base+1);
  const after=acceptBlockV2(initial,first);
  assert.equal(balanceV2(after,walletA),5_000_000_000);
  const tx=signTransactionV2({
    version:1,chainId:after.chainId,
    inputs:[{txid:mintRefV2(after.networkId,1),index:0,pubKey:alice.publicKey}],
    outputs:[{to:walletB,amount:1_250_000_000},
      {to:walletA,amount:3_749_999_000}]
  },[alice.privateKey]);
  const second=nextBlock(after,walletB,base+2,[tx]);
  const next=acceptBlockV2(after,second);
  assert.equal(next.height,2);
  assert.equal(next.supply,10_000_000_000);
  assert.equal(balanceV2(next,walletA),3_749_999_000);
  assert.equal(balanceV2(next,walletB),6_250_001_000);
  assert.equal(balanceV2(next,walletA)+balanceV2(next,walletB),next.supply);
  assert.equal(replayV2(next.chain).hash,next.hash);
  assert.throws(()=>candidateV2(next,{
    miner:walletA,timestamp:base+3,transactions:[tx]
  }),/double dépense|UTXO/);
  assert.throws(()=>acceptBlockV2(after,{...second,
    body:{...second.body,stateRoot:"f".repeat(64)}}),/racine/);
  const foreign=initialV2State(genesisV2("spk-net-0008"));
  assert.throws(()=>acceptBlockV2(foreign,first),/chaîne|réseau/);
  assert.throws(()=>chooseChainV2(next.chain,foreign.chain),/autre réseau/);
});
// E = explicitly AFTER D. Simulates 8 valid blocks with 1s and 120s intervals.
test("E: retarget accélère si blocs trop rapides, et rejette nBits falsifiés",()=>{
  const miner=newIdentity(),owner=address(miner.publicKey);
  let state=initialV2State(genesisV2("spk-net-0002"));
  for(let i=1;i<=8;i++){
    const block=nextBlock(state,owner,base+i);
    state=acceptBlockV2(state,block);
  }
  assert.equal(state.height,8);
  const nextBits=expectedBitsV2(state);
  assert.notEqual(nextBits,V2_POLICY.genesisBits);
  assert.ok(decodeCanonicalTarget(nextBits)<decodeCanonicalTarget(V2_POLICY.genesisBits));
  assert.equal(difficultyV2(state).retargetAtNext,true);
  const wanted=candidateV2(state,{miner:owner,timestamp:base+9});
  assert.equal(wanted.header.bits,nextBits);
  const solved=mineV2Sequential(wanted,{maxAttempts:1_000_000}).block;
  const validated=acceptBlockV2(state,solved);
  assert.equal(validated.height,9);
  assert.throws(()=>acceptBlockV2(state,{
    ...solved,header:{...solved.header,bits:V2_POLICY.genesisBits}
  }),/difficulté/);
  assert.ok(validated.cumulativeWork>state.cumulativeWork);
});
test("E: retarget relâche difficulté si blocs trop lents, avec bornes x4",()=>{
  const miner=newIdentity(),owner=address(miner.publicKey);
  let state=initialV2State(genesisV2("spk-net-0003"));
  for(let i=1;i<=8;i++){
    const block=nextBlock(state,owner,base+i*120);
    state=acceptBlockV2(state,block);
  }
  const target=decodeCanonicalTarget(expectedBitsV2(state));
  const before=decodeCanonicalTarget(V2_POLICY.genesisBits);
  assert.ok(target>before);
  assert.ok(target<=before*4n);
  const info=difficultyV2(state);
  assert.equal(info.nextHeight,9);
  assert.ok(BigInt(info.expectedHashesApprox)>0n);
  assert.ok(BigInt(info.expectedHashesApprox)<(1n<<256n));
  const sample=1n<<248n;
  assert.equal(decodeCanonicalTarget(compactFromTarget(sample))<=sample,true);
});
test("E: sélection de chaîne par preuve cumulée après concordance",()=>{
  const miner=newIdentity(),owner=address(miner.publicKey);
  const a=initialV2State(genesisV2("spk-net-0004"));
  const b1=acceptBlockV2(a,nextBlock(a,owner,base+1));
  const alternate=acceptBlockV2(a,nextBlock(a,owner,base+2));
  assert.equal(chooseChainV2(b1.chain,alternate.chain).tie,true);
  const b2=acceptBlockV2(alternate,nextBlock(alternate,owner,base+3));
  const selected=chooseChainV2(b1.chain,b2.chain);
  assert.equal(selected.selected,"candidate");
  assert.ok(BigInt(selected.candidateWork)>BigInt(selected.currentWork));
});
test("F: overlay TCP Full Duplex : synchronization A→B puis B→A",async()=>{
  const id="spk-net-0037";
  const a=createFullDuplexOverlay({networkId:id,masterSecret:secret});
  const b=createFullDuplexOverlay({networkId:id,masterSecret:secret});
  try{
    await a.listen();
    const endpoint=await b.listen();
    await a.connect(endpoint.port);
    await waitUntil(()=>a.stats.peers===1&&b.stats.peers===1);
    const miner=newIdentity(),owner=address(miner.publicKey);
    const block1=nextBlock(a.state,owner,base+1);
    a.acceptLocalBlock(block1);
    await waitUntil(()=>b.state.height===1);
    assert.equal(a.state.hash,b.state.hash);
    const block2=nextBlock(b.state,owner,base+2);
    b.acceptLocalBlock(block2);
    await waitUntil(()=>a.state.height===2);
    assert.equal(a.state.hash,b.state.hash);
    assert.ok(a.stats.sent>=3&&a.stats.received>=3);
    assert.ok(b.stats.sent>=3&&b.stats.received>=3);
    assert.equal(b.state.supply,10_000_000_000);
    assert.ok(a.stats.syncs>0&&b.stats.syncs>0);
  }finally{await Promise.allSettled([a.close(),b.close()]);}
});
test("F: isolation : une connexion d'un autre réseau est rejetée",async()=>{
  const a=createFullDuplexOverlay({networkId:"spk-net-0100",masterSecret:secret});
  const foreign=createFullDuplexOverlay({networkId:"spk-net-0101",masterSecret:secret});
  try{
    const server=await a.listen();
    await foreign.listen();
    await assert.rejects(foreign.connect(server.port));
    await waitUntil(()=>a.stats.rejectedPeers>=1||foreign.stats.rejectedPeers>=1);
    assert.equal(a.stats.peers,0);
    assert.equal(foreign.stats.peers,0);
    assert.notEqual(a.genesis.hash,foreign.genesis.hash);
  }finally{await Promise.allSettled([a.close(),foreign.close()]);}
});
test("F: pair avec secret différent est rejeté avant toute synchronisation",async()=>{
  const a=createFullDuplexOverlay({networkId:"spk-net-0123",masterSecret:secret});
  const outsider=createFullDuplexOverlay({networkId:"spk-net-0123",
    masterSecret:"EXTERNAL_WRONG_SECRET_1234567890_0123456789"});
  try{
    const endpoint=await a.listen();await outsider.listen();
    await assert.rejects(outsider.connect(endpoint.port));
    assert.equal(a.state.height,0);
    assert.equal(outsider.state.height,0);
    assert.equal(a.stats.peers,0);
  }finally{await Promise.allSettled([a.close(),outsider.close()]);}
});
