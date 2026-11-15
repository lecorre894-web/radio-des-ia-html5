/**
 * STRICT ORDER: A protocol > B SHA256d > C actual mining > D correspondence
 * > E difficulty and cumulative-work fork choice.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm,readFile,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {newIdentity,address} from "../addons/sparktiates/chain/chain-core.mjs";
import {
  POW_POLICY,sha256d,displayedHash,targetFromBits,validateBits,
  serializeHeader80,headerHash,powGenesis,initialPowState,
  searchNonce,makePowCandidate,proofAccepted,validateMinedBlock,
  powBalance,powBlockReward,chooseMostWorkPowChain,minedCorrespondence
} from "../addons/sparktiates/chain/pow-core.mjs";
import {
  benchmarkSha256d,mineCandidate,referenceNonceMine
} from "../addons/sparktiates/chain/pow-miner.mjs";
import {demonstratePow} from "../addons/sparktiates/chain/pow-demo.mjs";
import {minePersistent,powStatus,loadPowLedger} from "../addons/sparktiates/chain/pow-cli.mjs";

test("A: protocole PoW séparé du quorum, paramètres de genèse engagés",()=>{
  assert.equal(POW_POLICY.chainId,"sparktiates-pow-regtest-v1");
  assert.notEqual(POW_POLICY.chainId,"sparktiates-regtest-v1");
  assert.equal(POW_POLICY.bits,0x1f0fffff);
  assert.equal(POW_POLICY.retarget,false);
  assert.equal(POW_POLICY.firstReward,5_000_000_000);
  assert.equal(POW_POLICY.halvingInterval,210_000);
  assert.equal(powBlockReward(1),5_000_000_000);
  assert.equal(powBlockReward(210_000),2_500_000_000);
  assert.equal(powBlockReward(420_000),1_250_000_000);
  assert.equal(powGenesis().hash,initialPowState().hash);
  assert.throws(()=>initialPowState({...powGenesis(),hash:"a".repeat(64)}),/genèse/);
  assert.throws(()=>initialPowState({...powGenesis(),
    policy:{...POW_POLICY,maxSupply:12}}),/genèse/);
});

test("B: vecteur Bitcoin genesis 80 octets et vrai double SHA-256",()=>{
  const bitcoin={
    version:1,previousHash:"0".repeat(64),
    merkleRoot:"4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b",
    timestamp:1231006505,bits:0x1d00ffff,nonce:2083236893
  };
  const bytes=serializeHeader80(bitcoin);
  assert.equal(bytes.length,80);
  assert.equal(bytes.toString("hex"),
    "01000000"+"00".repeat(32)+
    "3ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a"+
    "29ab5f49ffff001d1dac2b7c");
  const expected="000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f";
  assert.equal(headerHash(bitcoin),expected);
  assert.equal(displayedHash(bytes),expected);
  assert.equal(Buffer.from(sha256d(bytes)).reverse().toString("hex"),expected);
  assert.notEqual(headerHash({...bitcoin,nonce:0}),expected);
});

test("B: débit SHA256d mesuré en hachages/s sans inventer 110 GHz matériel",()=>{
  const result=benchmarkSha256d({iterations:2000});
  assert.equal(result.algorithm,"SHA256(SHA256(header80))");
  assert.equal(result.verified,true);
  assert.equal(result.iterations,2000);
  assert.ok(result.realHashPerSecond>0);
  assert.equal(result.virtual110GHz,false);
  assert.equal(result.realCpuFrequencyGHz,null);
});

test("C: minage séquentiel vérifié et indépendance de la signature de quorum",()=>{
  const wallet=newIdentity(),state=initialPowState();
  const candidate=makePowCandidate(state,{miner:address(wallet.publicKey)});
  const hit=searchNonce(candidate.header,{maxAttempts:200000});
  assert.equal(hit.found,true);
  const block=referenceNonceMine(candidate,200000);
  assert.equal(block.header.nonce,hit.nonce);
  assert.equal(proofAccepted(block.header),true);
  const after=validateMinedBlock(state,block);
  assert.equal(after.height,1);
  assert.equal(after.supply,5_000_000_000);
  assert.equal(powBalance(after,address(wallet.publicKey)),5_000_000_000);
  assert.ok(after.cumulativeWork>0n);
});

test("C: minage CPU multi-thread réel sur des nonces disjoints",async()=>{
  const miner=newIdentity();
  const candidate=makePowCandidate(initialPowState(),{miner:address(miner.publicKey)});
  const mined=await mineCandidate(candidate,{workers:2,maxAttempts:250000});
  assert.equal(mined.report.found,true);
  assert.equal(mined.report.proofValid,true);
  assert.equal(mined.report.headerBytes,80);
  assert.equal(mined.report.virtual110GHz,false);
  assert.equal(mined.report.bitcoinMainnetReward,0);
  assert.ok(mined.report.attempts>0&&mined.report.realHashPerSecond>0);
  assert.equal(validateMinedBlock(initialPowState(),mined.block).hash,mined.report.hash);
});

test("D: concordance de deux blocs minés, transfert signé et rejet double dépense",async()=>{
  const result=await demonstratePow({workers:2,maxAttempts:250000});
  assert.equal(result.status,"PASS");
  assert.equal(result.height,2);
  assert.equal(result.issuedAtomic,10_000_000_000);
  assert.equal(result.feeAtomic,1000);
  assert.equal(result.transferAtomic,1_250_000_000);
  assert.equal(result.doubleSpendRejected,true);
  assert.equal(result.balances.alice+result.balances.bob,result.issuedAtomic);
  assert.ok(result.correspondence.every(x=>
    x.proofValid&&x.headerBytes===80&&x.stateAfter===x.hash));
  assert.ok(result.blocks.every(x=>x.actualHashes>0&&x.hashesPerSecond>0));
  assert.equal(result.bitcoinMainnetHashrate,0);
});

test("D: correspondance persistante après redémarrage et refus d'un solde falsifié",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"spk-pow-"));
  try{
    const one=await minePersistent({dir,blocks:1,workers:2,maxAttempts:250000});
    const two=await minePersistent({dir,blocks:1,workers:2,maxAttempts:250000});
    assert.equal(one.height,1);
    assert.equal(two.height,2);
    assert.equal(one.genesisHash,two.genesisHash);
    assert.equal(one.minerAddress,two.minerAddress);
    assert.equal(two.supplyAtomic,10_000_000_000);
    const state=await loadPowLedger(dir);
    const status=await powStatus(dir);
    assert.equal(status.height,2);
    assert.equal(status.hash,state.state.hash);
    assert.equal(status.minerBalanceAtomic,10_000_000_000);
    for(const block of state.state.chain.slice(1)){
      assert.equal(block.hash,headerHash(block.header));
    }
    const path=join(dir,"ledger.json");
    const tampered=JSON.parse(await readFile(path,"utf8"));
    tampered.supply=1;
    await writeFile(path,JSON.stringify(tampered));
    await assert.rejects(loadPowLedger(dir),/divergence/);
  }finally{await rm(dir,{recursive:true,force:true});}
});

// TESTS DE DIFFICULTÉ VOLONTAIREMENT PLACÉS APRÈS LA CONCORDANCE.
// Aucune mesure de performance ou validation D ne dépend du résultat de E.
test("E: difficulty nBits après concordance, cible, limites et refus d'un seuil altéré",()=>{
  assert.equal(targetFromBits(0x207fffff).toString(16),
    "7fffff"+"00".repeat(29));
  assert.ok(validateBits(POW_POLICY.bits)>0n);
  assert.throws(()=>targetFromBits(0x1f8fffff),/signe/);
  assert.throws(()=>targetFromBits(0),/target/);
  assert.throws(()=>validateBits(0x207fffff),/non conforme/);
  assert.throws(()=>validateBits(0x1d00ffff),/non conforme/);
  const miner=newIdentity();
  const candidate=makePowCandidate(initialPowState(),{
    miner:address(miner.publicKey)
  });
  const mined=referenceNonceMine(candidate,200000);
  assert.ok(proofAccepted(mined.header));
  assert.equal(proofAccepted({...mined.header,bits:0x207fffff}),false);
  assert.throws(()=>validateMinedBlock(initialPowState(),{
    ...mined,header:{...mined.header,bits:0x207fffff}
  }),/racine|preuve/);
});

test("E: recherche de chaîne FULL POW par travail cumulé, égalité et invalidation",()=>{
  const owner=newIdentity(),addr=address(owner.publicKey),start=initialPowState();
  const blockA=referenceNonceMine(makePowCandidate(start,{miner:addr,timestamp:100}),200000);
  const branchA=validateMinedBlock(start,blockA);
  const blockB=referenceNonceMine(makePowCandidate(start,{miner:addr,timestamp:101}),200000);
  const branchB=validateMinedBlock(start,blockB);
  assert.notEqual(branchA.hash,branchB.hash);
  const tie=chooseMostWorkPowChain(branchA.chain,branchB.chain);
  assert.equal(tie.selected,"current");
  assert.equal(tie.tie,true);
  const blockB2=referenceNonceMine(makePowCandidate(branchB,{miner:addr,timestamp:102}),200000);
  const branchB2=validateMinedBlock(branchB,blockB2);
  const selected=chooseMostWorkPowChain(branchA.chain,branchB2.chain);
  assert.equal(selected.selected,"candidate");
  assert.equal(selected.height,2);
  assert.equal(selected.bothValid,true);
  assert.ok(BigInt(selected.candidateWork)>BigInt(selected.currentWork));
  const forged=branchB2.chain.map((x,i)=>i===2?{
    ...x,header:{...x.header,nonce:x.header.nonce+1}
  }:x);
  assert.throws(()=>chooseMostWorkPowChain(branchA.chain,forged),
    /hash de bloc|preuve de travail|racine/);
});

test("E: la difficulté est FIXE en regtest, le réglage dynamique reste non réalisé",()=>{
  assert.equal(POW_POLICY.retarget,false);
  assert.equal(POW_POLICY.bits,0x1f0fffff);
  assert.equal(POW_POLICY.targetSeconds,30);
  const n1=targetFromBits(POW_POLICY.bits);
  const n2=validateBits(POW_POLICY.bits);
  assert.equal(n1,n2);
  const relativeDifficulty=Number(targetFromBits(POW_POLICY.powLimit)/n1);
  assert.ok(relativeDifficulty>=1);
  assert.ok(Number.isFinite(relativeDifficulty));
});
