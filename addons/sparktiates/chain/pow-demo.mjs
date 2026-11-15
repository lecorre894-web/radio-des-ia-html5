/**
 * SPARKTIATES-POW demonstration (fresh temporary chain, no real-world coins).
 * Two real mined blocks, Ed25519-signed payment, double-spend rejection,
 * exact correspondence between block header, proof and UTXO state.
 */
import {newIdentity,address,stable} from "./chain-core.mjs";
import {
  POW_POLICY,powGenesis,initialPowState,makePowCandidate,validateMinedBlock,
  powBalance,powMintId,signPowTx,minedCorrespondence,proofAccepted
} from "./pow-core.mjs";
import {mineCandidate,benchmarkSha256d} from "./pow-miner.mjs";

export async function demonstratePow({workers=2,maxAttempts=200000}={}){
  const alice=newIdentity(),bob=newIdentity();
  const aliceAddress=address(alice.publicKey),bobAddress=address(bob.publicKey);
  const genesis=powGenesis();
  let state=initialPowState(genesis);
  const timestamp=Math.floor(Date.now()/1000);
  const firstCandidate=makePowCandidate(state,{
    miner:aliceAddress,timestamp
  });
  const first=await mineCandidate(firstCandidate,{workers,maxAttempts});
  const initialState=state;
  state=validateMinedBlock(state,first.block);
  const firstProof=minedCorrespondence(initialState,first.block);
  const amount=1_250_000_000,fee=1000;
  const tx=signPowTx({
    version:1,chainId:POW_POLICY.chainId,
    inputs:[{txid:powMintId(1),index:0,pubKey:alice.publicKey}],
    outputs:[
      {to:bobAddress,amount},
      {to:aliceAddress,amount:5_000_000_000-amount-fee}
    ]
  },[alice.privateKey]);
  const previous=state;
  const secondCandidate=makePowCandidate(state,{
    miner:bobAddress,timestamp:timestamp+1,transactions:[tx]
  });
  const second=await mineCandidate(secondCandidate,{workers,maxAttempts});
  state=validateMinedBlock(state,second.block,{
    now:Math.floor(Date.now()/1000)+1
  });
  const secondProof=minedCorrespondence(previous,second.block);
  let doubleSpendRejected=false;
  try{
    makePowCandidate(state,{miner:bobAddress,timestamp:timestamp+2,transactions:[tx]});
  }catch(e){
    doubleSpendRejected=/double dépense|UTXO inconnu/i.test(String(e.message||e));
  }
  if(!doubleSpendRejected)throw Error("SPK-POW: double dépense non rejetée");
  const balances={
    alice:powBalance(state,aliceAddress),
    bob:powBalance(state,bobAddress)
  };
  if(balances.alice+balances.bob!==state.supply)
    throw Error("SPK-POW: équilibre monétaire violé");
  if(!proofAccepted(first.block.header)||!proofAccepted(second.block.header))
    throw Error("SPK-POW: preuve absente");
  const benchmark=benchmarkSha256d({iterations:3000});
  return {
    status:"PASS",network:POW_POLICY.chainId,algorithm:"SHA256d",
    distinctFromQuorumChain:true,genesisHash:genesis.hash,
    height:state.height,tip:state.hash,
    blocks:[
      {height:1,hash:first.block.hash,
        actualHashes:first.report.attempts,nonce:first.report.nonce,
        elapsedMs:first.report.elapsedMs,hashesPerSecond:first.report.realHashPerSecond},
      {height:2,hash:second.block.hash,
        actualHashes:second.report.attempts,nonce:second.report.nonce,
        elapsedMs:second.report.elapsedMs,hashesPerSecond:second.report.realHashPerSecond}
    ],
    transactionId:tx.id,feeAtomic:fee,transferAtomic:amount,
    issuedAtomic:state.supply,balances,doubleSpendRejected,
    correspondence:[firstProof,secondProof],
    benchmark,bitcoinMainnetHashrate:0,
    measuredPhysical110GHz:false,
    note:"MINAGE EXPERIMENTAL SPK-POW SEULEMENT; AUCUN BTC NI VALEUR FINANCIÈRE"
  };
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href){
  try{console.log("SPARTKIATES_POW_DEMO",JSON.stringify(
    await demonstratePow(),null,2));}
  catch(e){console.error("SPARKTIATES_POW_FAILED",String(e?.stack||e));process.exitCode=1;}
}
