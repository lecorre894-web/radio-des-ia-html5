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
  powMintId,powBalance
} from "../addons/sparktiates/chain/pow-core.mjs";
import {benchmarkSha256d,mineCandidate,referenceNonceMine} from "../addons/sparktiates/chain/pow-miner.mjs";
import {demonstratePow} from "../addons/sparktiates/chain/pow-demo.mjs";
import {minePersistent,powStatus,loadPowLedger} from "../addons/sparktiates/chain/pow-cli.mjs";

test("A D: Bitcoin header genesis reference, exactly 80 bytes, true SHA256d",()=>{
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
  assert.equal(targetFromBits(0x207fffff).toString(16),"7fffff"+"00".repeat(29));
});

test("A: private full-PoW chain and consensus bits independent of quorum chain",()=>{
  assert.equal(POW_POLICY.chainId,"sparktiates-pow-regtest-v1");
  assert.notEqual(POW_POLICY.chainId,"sparktiates-regtest-v1");
  assert.equal(POW_POLICY.bits,0x1f0fffff);
  assert.ok(validateBits(POW_POLICY.bits)>0n);
  assert.throws(()=>targetFromBits(0x1f8fffff),/signe/);
  assert.throws(()=>targetFromBits(0),/target/);
  assert.throws(()=>validateBits(0x207fffff),/non conforme/);
  assert.equal(powGenesis().hash,initialPowState().hash);
  assert.throws(()=>initialPowState({...powGenesis(),hash:"a".repeat(64)}),/genèse/);
});

test("B: sequential mining and independently validated proof",()=>{
  const wallet=newIdentity(),state=initialPowState();
  const candidate=makePowCandidate(state,{miner:address(wallet.publicKey)});
  const result=searchNonce(candidate.header,{maxAttempts:200000});
  assert.equal(result.found,true);
  const block=referenceNonceMine(candidate,200000);
  assert.equal(block.header.nonce,result.nonce);
  assert.equal(proofAccepted(block.header),true);
  const after=validateMinedBlock(state,block);
  assert.equal(after.height,1);
  assert.equal(after.supply,5_000_000_000);
  assert.equal(powBalance(after,address(wallet.publicKey)),5_000_000_000);
  assert.ok(after.cumulativeWork>0n);
  assert.throws(()=>validateMinedBlock(state,{...block,
    body:{...block.body,stateRoot:"f".repeat(64)}}),/racine/);
  assert.throws(()=>validateMinedBlock(state,{...block,
    body:{...block.body,coinbase:{...block.body.coinbase,amount:5_000_000_001}}}),/récompense/);
});

test("B: real CPU worker mining and rate reported in SHA256d/s",async()=>{
  const wallet=newIdentity(),state=initialPowState();
  const candidate=makePowCandidate(state,{miner:address(wallet.publicKey)});
  const mined=await mineCandidate(candidate,{workers:2,maxAttempts:250000});
  assert.equal(mined.report.found,true);
  assert.equal(mined.report.proofValid,true);
  assert.equal(mined.report.headerBytes,80);
  assert.equal(mined.report.virtual110GHz,false);
  assert.equal(mined.report.bitcoinMainnetReward,0);
  assert.ok(mined.report.attempts>0);
  assert.ok(mined.report.realHashPerSecond>0);
  assert.equal(validateMinedBlock(state,mined.block).hash,mined.report.hash);
  const bench=benchmarkSha256d({iterations:1000});
  assert.equal(bench.iterations,1000);
  assert.equal(bench.verified,true);
});

test("C D: two PoW blocks with signed transaction and correspondence",async()=>{
  const result=await demonstratePow({workers:2,maxAttempts:250000});
  assert.equal(result.status,"PASS");
  assert.equal(result.height,2);
  assert.equal(result.issuedAtomic,10_000_000_000);
  assert.equal(result.feeAtomic,1000);
  assert.equal(result.transferAtomic,1_250_000_000);
  assert.equal(result.doubleSpendRejected,true);
  assert.equal(result.balances.alice+result.balances.bob,result.issuedAtomic);
  assert.ok(result.correspondence.every(x=>x.proofValid&&x.headerBytes===80));
  assert.ok(result.blocks.every(x=>x.actualHashes>0&&x.hashesPerSecond>0));
  assert.equal(result.bitcoinMainnetHashrate,0);
});

test("C D: persistent full-PoW ledger survives restart and rejects altered supply",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"spk-pow-"));
  try{
    const one=await minePersistent({dir,blocks:1,workers:2,maxAttempts:250000});
    assert.equal(one.height,1);
    const two=await minePersistent({dir,blocks:1,workers:2,maxAttempts:250000});
    assert.equal(two.height,2);
    assert.equal(two.supplyAtomic,10_000_000_000);
    assert.equal(one.genesisHash,two.genesisHash);
    assert.equal(one.minerAddress,two.minerAddress);
    const status=await powStatus(dir);
    assert.equal(status.height,2);
    assert.equal(status.minerBalanceAtomic,10_000_000_000);
    assert.equal((await loadPowLedger(dir)).state.hash,status.hash);
    const path=join(dir,"ledger.json"),bad=JSON.parse(await readFile(path,"utf8"));
    bad.supply=1;
    await writeFile(path,JSON.stringify(bad));
    await assert.rejects(loadPowLedger(dir),/divergence/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
