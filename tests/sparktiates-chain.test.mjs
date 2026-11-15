import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,rm,readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  POLICY,newIdentity,genesis,initialState,address,proposeBody,transition,
  blockReward,mintTxid,txId,signTransaction,signVote,verifyCertificate,
  commitBlock,utxoRoot,balance,spendables,stable
} from "../addons/sparktiates/chain/chain-core.mjs";
import {runDemonstration,startPrivateCluster} from "../addons/sparktiates/chain/private-cluster.mjs";
import {rpc} from "../addons/sparktiates/chain/validator-node.mjs";

const identities=["alpha","beta","gamma"].map(id=>({id,...newIdentity()}));
const validators=identities.map(({id,publicKey})=>({id,publicKey}));
const firstGenesis=genesis(validators);
const owners=identities.map(x=>address(x.publicKey));
const firstBlock=()=>{
  const state=initialState(firstGenesis);
  const body=proposeBody(state,{
    validators,proposer:"alpha",coinbaseTo:owners[0],timestamp:1
  });
  return {state,body};
};
const signedCertificate=(body,hash)=>identities.slice(0,2).map(k=>({
  validator:k.id,signature:signVote(k.privateKey,body.height,hash)
}));

test("Monnaie expérimentale, émission entière et réduction des récompenses",()=>{
  assert.equal(POLICY.maxSupply,21_000_000*100_000_000);
  assert.equal(POLICY.firstReward,5_000_000_000);
  assert.equal(blockReward(1),5_000_000_000);
  assert.equal(blockReward(209_999),5_000_000_000);
  assert.equal(blockReward(210_000),2_500_000_000);
  assert.equal(blockReward(420_000),1_250_000_000);
  assert.equal(blockReward(7_000_000),0);
  assert.throws(()=>stable({bad:0.1}),/entier/);
});

test("Genèse reproductible et indépendante du réseau Bitcoin",()=>{
  assert.match(firstGenesis.hash,/^[0-9a-f]{64}$/);
  assert.equal(genesis([...validators].reverse()).hash,firstGenesis.hash);
  assert.equal(initialState(firstGenesis).supply,0);
  assert.equal(firstGenesis.chainId,"sparktiates-regtest-v1");
  const alternative=validators.map(v=>({...v,publicKey:newIdentity().publicKey}));
  assert.notEqual(genesis(alternative).hash,firstGenesis.hash);
});

test("Quorum signé et récompense du premier bloc",()=>{
  const {state,body}=firstBlock();
  const hash=transition(state,body,validators).state.hash;
  const cert=signedCertificate(body,hash);
  assert.equal(verifyCertificate(body,cert,validators),hash);
  assert.throws(()=>verifyCertificate(body,cert.slice(0,1),validators),/quorum/);
  assert.throws(()=>verifyCertificate(body,[cert[0],cert[0]],validators),/double vote/);
  assert.throws(()=>verifyCertificate(body,[cert[0],{...cert[1],signature:cert[0].signature}],validators),/signature/);
  const committed=commitBlock(state,body,cert,validators);
  assert.equal(committed.height,1);
  assert.equal(committed.supply,5_000_000_000);
  assert.equal(balance(committed,owners[0]),5_000_000_000);
  assert.equal(spendables(committed,owners[0])[0].txid,mintTxid(1));
});

test("Transaction signée, conservation des fonds et impossibilité de double dépense",()=>{
  const {state,body}=firstBlock();
  const hash=transition(state,body,validators).state.hash;
  const afterOne=commitBlock(state,body,signedCertificate(body,hash),validators);
  const unsigned={
    version:1,chainId:POLICY.chainId,
    inputs:[{txid:mintTxid(1),index:0,pubKey:identities[0].publicKey}],
    outputs:[
      {to:owners[1],amount:1_250_000_000},
      {to:owners[0],amount:3_749_999_000}
    ]
  };
  const tx=signTransaction(unsigned,[identities[0].privateKey]);
  assert.match(txId(tx),/^[a-f0-9]{64}$/);
  assert.equal(txId(tx),tx.id);
  const modified={...tx,outputs:[{to:owners[1],amount:5_000_000_000}]};
  assert.throws(()=>proposeBody(afterOne,{
    validators,proposer:"beta",timestamp:2,coinbaseTo:owners[1],
    transactions:[modified]
  }),/identifiant|signature|monétaire/);
  const second=proposeBody(afterOne,{
    validators,proposer:"beta",timestamp:2,coinbaseTo:owners[1],
    transactions:[tx]
  });
  assert.equal(second.coinbase.amount,5_000_001_000);
  const secondHash=transition(afterOne,second,validators).state.hash;
  const afterTwo=commitBlock(afterOne,second,signedCertificate(second,secondHash),validators);
  assert.equal(afterTwo.height,2);
  assert.equal(afterTwo.supply,10_000_000_000);
  assert.equal(balance(afterTwo,owners[0]),3_749_999_000);
  assert.equal(balance(afterTwo,owners[1]),6_250_001_000);
  assert.equal(utxoRoot(afterTwo.utxos),second.stateRoot);
  assert.throws(()=>proposeBody(afterTwo,{
    validators,proposer:"gamma",timestamp:3,coinbaseTo:owners[2],transactions:[tx]
  }),/déjà dépensé|inexistant/);
});

test("Refus des faux blocs, du dépassement de récompense et des mauvais proposeurs",()=>{
  const {state,body}=firstBlock();
  assert.throws(()=>proposeBody(state,{
    validators,proposer:"gamma",timestamp:1,coinbaseTo:owners[0]
  }),/hors tour/);
  assert.throws(()=>transition(state,{...body,stateRoot:"0".repeat(64)},validators),/racine d'état/);
  assert.throws(()=>transition(state,{...body,coinbase:{
    ...body.coinbase,amount:body.coinbase.amount+1
  }},validators),/récompense/);
  assert.throws(()=>transition(state,{...body,previousHash:"a".repeat(64)},validators),/hors chaîne/);
});

test("Trois véritables API loopback : deux blocs, transaction et même empreinte",async()=>{
  const report=await runDemonstration();
  assert.equal(report.status,"PASS");
  assert.equal(report.height,2);
  assert.equal(report.realLocalNodes,3);
  assert.equal(report.supply,10_000_000_000);
  assert.equal(report.quorum,3);
  assert.equal(report.doubleSpendRejected,true);
  assert.equal(report.allNodesConverged,true);
  assert.equal(report.balances.alpha+report.balances.beta,report.supply);
});

test("Redémarrage : persistance du grand livre et des verrous anti-double-signature",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"spk-chain-"));
  let cluster;
  try{
    cluster=await startPrivateCluster({dir,ports:[0,0,0]});
    await cluster.proposeAndCommit();
    const tip=cluster.nodes[0].state.hash;
    const leader=cluster.validators[1];
    const owner=cluster.identities.find(x=>x.id===leader.id);
    const body=proposeBody(cluster.nodes[0].state,{
      validators:cluster.validators,proposer:leader.id,
      timestamp:Date.now(),coinbaseTo:address(owner.publicKey)
    });
    const oneVote=await rpc(cluster.ports[0],"/vote",cluster.token,{body});
    assert.equal(oneVote.validator,"alpha");
    const alternate={...body,timestamp:body.timestamp+1};
    await assert.rejects(rpc(cluster.ports[0],"/vote",cluster.token,{body:alternate}),/verrou/);
    const denied=await fetch("http://127.0.0.1:"+cluster.ports[0]+"/status");
    assert.equal(denied.status,401);
    await cluster.close();
    cluster=await startPrivateCluster({dir,ports:[0,0,0]});
    assert.equal(cluster.nodes[0].state.height,1);
    assert.equal(cluster.nodes[0].state.hash,tip);
    assert.match(cluster.nodes[0].locks["2"],/^[a-f0-9]{64}$/);
    await assert.rejects(rpc(cluster.ports[0],"/vote",cluster.token,{body:alternate}),/verrou/);
    const snapshot=JSON.parse(await readFile(join(dir,"alpha","state.json"),"utf8"));
    assert.equal(snapshot.height,1);
    assert.equal(snapshot.genesisHash,cluster.nodes[0].genesis.hash);
  }finally{
    await cluster?.close();
    await rm(dir,{recursive:true,force:true});
  }
});
