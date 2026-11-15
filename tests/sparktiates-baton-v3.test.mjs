import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm,readFile,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {newIdentity,address} from "../addons/sparktiates/chain/chain-core.mjs";
import {
  BATON_V3,batonGenesis,initialBatonState,
  routeForHeight,expectedRoute,makeBatonCandidate,acceptBatonBlock,
  replayBatonChain,chooseBatonChain,planRelayContinuity,batonCorrespondence
} from "../addons/sparktiates/chain/baton-v3.mjs";
import {
  createBatonLedger,createOrLoadBatonWallet,
  verifiedBatonSnapshot,readVerifiedBatonSnapshot
} from "../addons/sparktiates/chain/baton-v3-ledger.mjs";
import {mineV2Sequential} from "../addons/sparktiates/chain/pow-v2-miner.mjs";
import {
  BTC_REGTEST,verifyBitcoinRegtestGenesis,syntheticBitcoinHeaderExperiment
} from "../addons/sparktiates/chain/bitcoin-regtest-reference.mjs";
import {demonstrateBatonV3} from "../addons/sparktiates/chain/baton-v3-demo.mjs";

const anchor=Math.floor(Date.now()/1000)-1800;
const owner=address(newIdentity().publicKey);
function mine(state,timestamp=anchor+state.height*30+30){
  const block=makeBatonCandidate(state,{miner:owner,timestamp});
  return mineV2Sequential(block,{maxAttempts:500000}).block;
}
test("A: 2048 relais dans un seul calendrier de blocs et une seule genèse",()=>{
  const plan=planRelayContinuity();
  assert.equal(plan.length,2048);
  assert.equal(new Set(plan.map(x=>x.relayId)).size,2048);
  assert.ok(plan.every(x=>x.sharedChain&&!x.separateGenesis&&!x.mined));
  assert.deepEqual(plan.slice(0,4).map(x=>[x.relayId,x.triangleVertex]),[
    ["spk-net-0001","A"],
    ["spk-net-0002","B"],
    ["spk-net-0003","C"],
    ["spk-net-0004","A"]
  ]);
  assert.deepEqual(routeForHeight(2048),{
    relayId:"spk-net-2048",relayIndex:2048,triangleVertex:"C",cycle:1
  });
  assert.deepEqual(routeForHeight(2049),{
    relayId:"spk-net-0001",relayIndex:1,triangleVertex:"A",cycle:2
  });
  assert.equal(initialBatonState().hash,batonGenesis().hash);
  assert.equal(BATON_V3.logicalRelays,2048);
});
test("B: 80 octets et SHA256d réels, le relais est engagé dans le hash",()=>{
  let s=initialBatonState();
  const candidate=makeBatonCandidate(s,{miner:owner,timestamp:anchor+30});
  assert.equal(candidate.body.route.relayId,"spk-net-0001");
  const block=mineV2Sequential(candidate,{maxAttempts:500000}).block;
  const corresponding=batonCorrespondence(s,block);
  assert.equal(corresponding.proofValid,true);
  assert.equal(corresponding.singleGlobalChain,true);
  assert.equal(corresponding.previousBlockHash,batonGenesis().hash);
  assert.equal(corresponding.committedRelay,"spk-net-0001");
  s=acceptBatonBlock(s,block);
  assert.equal(s.height,1);
  assert.equal(s.supply,5_000_000_000);
  assert.throws(()=>acceptBatonBlock(initialBatonState(),{
    ...block,body:{...block.body,route:{
      ...block.body.route,relayId:"spk-net-0002"
    }}
  }),/incorrect relay/);
});
test("C-D: 3 blocs ABC se suivent exactement avec le même parent et la même émission",()=>{
  let state=initialBatonState();
  const proofs=[];
  for(let height=1;height<=3;height++){
    const block=mine(state,anchor+height*30);
    const p=batonCorrespondence(state,block);
    assert.equal(p.committedRelay,"spk-net-"+String(height).padStart(4,"0"));
    assert.equal(p.triangleVertex,["A","B","C"][height-1]);
    assert.equal(p.parentContinued,true);
    assert.equal(p.previousBlockHash,state.hash);
    state=acceptBatonBlock(state,block);
    proofs.push(block.hash);
  }
  assert.equal(state.height,3);
  assert.equal(state.supply,15_000_000_000);
  assert.equal(new Set(proofs).size,3);
  assert.equal(replayBatonChain(state.chain).hash,state.hash);
  assert.equal(chooseBatonChain(initialBatonState().chain,state.chain).selected,
    "candidate");
});
test("D: registre unique, trois copies exactes, rejeu au redémarrage",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"baton-ledger-unit-"));
  try{
    const ledgers=["A","B","C"].map(vertex=>
      createBatonLedger({directory:dir,vertex}));
    let state=initialBatonState();
    for(let height=1;height<=3;height++){
      state=acceptBatonBlock(state,mine(state,anchor+height*30));
      for(const ledger of ledgers)ledger.persist(state);
    }
    for(const vertex of ["A","B","C"]){
      const restored=createBatonLedger({directory:dir,vertex});
      assert.equal(restored.state.height,3);
      assert.equal(restored.state.hash,state.hash);
      const snapshot=restored.verify();
      assert.equal(snapshot.entries.length,3);
      assert.deepEqual(snapshot.entries.map(x=>x.relayId),[
        "spk-net-0001","spk-net-0002","spk-net-0003"]);
      assert.deepEqual(snapshot.entries.map(x=>x.triangleVertex),["A","B","C"]);
      assert.equal(snapshot.entries[0].previousHash,batonGenesis().hash);
      assert.equal(snapshot.entries[2].hash,state.hash);
      assert.equal(readVerifiedBatonSnapshot(snapshot).hash,state.hash);
    }
    const wallet1=createOrLoadBatonWallet({directory:dir,vertex:"A"});
    const wallet2=createOrLoadBatonWallet({directory:dir,vertex:"A"});
    assert.equal(wallet1.owner,wallet2.owner);
    assert.equal(wallet1.privateKey,wallet2.privateKey);
    assert.ok(wallet1.privateKey.length>30);
    const file=join(dir,"ledger-B.json");
    const wrong=JSON.parse(await readFile(file,"utf8"));
    wrong.entries[1].previousHash="f".repeat(64);
    await writeFile(file,JSON.stringify(wrong));
    assert.throws(()=>createBatonLedger({directory:dir,vertex:"B"}),
      /empreinte|concordance/);
    // Even if an attacker recomputes the unkeyed checksum, replay catches
    // invalid parent/route/UTXO chains.
    const altered=verifiedBatonSnapshot(state);
    altered.entries[1].relayId="spk-net-2020";
    assert.throws(()=>readVerifiedBatonSnapshot(altered),/empreinte|concordance/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test("D: tentative de chaîner 2048 genèses séparées interdite",()=>{
  const chain=initialBatonState().chain;
  const fake=[{...chain[0],networkId:"spk-net-0002"}];
  assert.throws(()=>replayBatonChain(fake),/independent genesis forbidden/);
});
test("Mode Bitcoin: contrôle référence officielle du hash regtest et preuve en-tête",()=>{
  const g=verifyBitcoinRegtestGenesis();
  assert.equal(g.genesisHash,BTC_REGTEST.genesisHash);
  assert.equal(g.hashMatches,true);
  assert.equal(g.headerBytes,80);
  assert.equal(g.fullBlockValidatedByBitcoinCore,false);
  const proof=syntheticBitcoinHeaderExperiment({maxAttempts:50});
  assert.equal(proof.proofValid,true);
  assert.equal(proof.priorHash,g.genesisHash);
  assert.equal(proof.acceptedByBitcoinCore,false);
  assert.equal(proof.createsBitcoinBTC,0);
  assert.equal(proof.merkleRootIsNotARealCoinbase,true);
});
test("D-E-F: 3 vrais processus, 9 blocs PoW, réajustement, restauration de registre",async()=>{
  const result=await demonstrateBatonV3({blockCount:9});
  assert.equal(result.status,"PASS");
  assert.equal(result.logicalRelays,2048);
  assert.equal(result.logicalIndependentBlockchains,0);
  assert.equal(result.relayScheduleVerified,2048);
  assert.equal(result.relaysActuallyMined,9);
  assert.equal(result.triangle.independentNodeProcesses,3);
  assert.equal(result.triangle.links.length,3);
  assert.equal(result.finalHeight,9);
  assert.equal(result.blocks.length,9);
  assert.deepEqual(result.blocks.map(x=>x.vertex),["A","B","C","A","B","C","A","B","C"]);
  assert.ok(result.blocks.every(x=>x.confirmations===3&&x.persistedCopies===3));
  assert.equal(result.allVerticesConverged,true);
  assert.equal(result.restartRestored,true);
  assert.equal(result.sameGenesis,true);
  assert.equal(result.retargetOccurred,true);
  assert.equal(new Set(result.ledgerCopies.map(x=>x.tip)).size,1);
  assert.ok(result.blocks.every(x=>x.actualSha256dHashes>0));
});
