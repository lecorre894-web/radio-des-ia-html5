/**
 * Bitcoin protocol REGTEST comparison, independent of SPARKTIATES CHAIN.
 * Reproduces the actual Bitcoin regtest genesis 80-byte header and checks
 * a synthetic subsequent HEADER PoW. A synthetic header is NOT a valid
 * Bitcoin Core block; acceptance needs bitcoind -regtest and full consensus.
 */
import {performance} from "node:perf_hooks";
import {
  headerHash,serializeHeader80,targetFromBits,displayedHash
} from "./pow-core.mjs";

export const BTC_REGTEST=Object.freeze({
  network:"bitcoin-regtest",
  genesisHash:"0f9188f13cb7b2c71f2a335e3a4fc328bf5beb436012afca590b1a11466e2206",
  genesisMerkleRoot:"4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b",
  genesisTime:1296688602,genesisNonce:2,
  regtestBits:0x207fffff,
  bitcoinMainnet:false,
  coinbaseMaturity:100,
  headerBytes:80
});
export function actualRegtestGenesisHeader(){
  return {
    version:1,previousHash:"0".repeat(64),
    merkleRoot:BTC_REGTEST.genesisMerkleRoot,
    timestamp:BTC_REGTEST.genesisTime,bits:BTC_REGTEST.regtestBits,
    nonce:BTC_REGTEST.genesisNonce
  };
}
export function verifyBitcoinRegtestGenesis(){
  const header=actualRegtestGenesisHeader();
  const raw=serializeHeader80(header);
  const found=headerHash(header);
  const target=targetFromBits(header.bits);
  if(raw.length!==80||found!==BTC_REGTEST.genesisHash||
     BigInt("0x"+found)>target)
    throw Error("BITCOIN REGTEST: vecteur de genèse non conforme");
  return {
    network:BTC_REGTEST.network,
    headerBytes:raw.length,
    genesisHash:found,referenceHash:BTC_REGTEST.genesisHash,
    nBits:"0x"+header.bits.toString(16),nonce:header.nonce,
    actualBitcoinCoreRegtestReference:true,
    hashMatches:true,proofValid:true,
    fullBlockValidatedByBitcoinCore:false
  };
}
export function syntheticBitcoinHeaderExperiment({
  maxAttempts=100,merkleRoot="1".repeat(64)
}={}){
  if(!Number.isSafeInteger(maxAttempts)||maxAttempts<1||maxAttempts>1000000||
     typeof merkleRoot!=="string"||!/^[a-f0-9]{64}$/.test(merkleRoot))
    throw Error("BITCOIN REGTEST: invalid header-only test");
  verifyBitcoinRegtestGenesis();
  const header={
    version:1,
    previousHash:BTC_REGTEST.genesisHash,
    merkleRoot,
    timestamp:BTC_REGTEST.genesisTime+60,
    bits:BTC_REGTEST.regtestBits,nonce:0
  };
  const bytes=serializeHeader80(header);
  const target=targetFromBits(header.bits);
  const start=performance.now();
  let attempts=0,hash=null,nonce=null;
  for(let i=0;i<maxAttempts;i++){
    bytes.writeUInt32LE(i,76);
    const found=displayedHash(bytes);
    attempts++;
    if(BigInt("0x"+found)<=target){hash=found;nonce=i;break;}
  }
  if(!hash)throw Error("BITCOIN REGTEST: no header proof in bounded search");
  const elapsedMs=Math.max(.001,performance.now()-start);
  return {
    mode:"BITCOIN_REGTEST_HEADER_ONLY",
    priorHash:BTC_REGTEST.genesisHash,
    headerBytes:80,
    bits:"0x"+header.bits.toString(16),
    nonce,hash,proofValid:true,
    sha256dAttempts:attempts,
    realHashPerSecond:attempts/(elapsedMs/1000),
    merkleRootIsNotARealCoinbase:true,
    acceptedByBitcoinCore:false,
    createsBitcoinBTC:0,
    correspondingSPK:false,
    caution:"Proof of work on a synthetic 80-byte header; not a complete Bitcoin consensus-valid block."
  };
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href){
  try{
    const reference=verifyBitcoinRegtestGenesis();
    const synthetic=syntheticBitcoinHeaderExperiment();
    console.log("BITCOIN_REGTEST_HEADER_REFERENCE_PASS",JSON.stringify({
      reference,synthetic
    },null,2));
  }catch(e){
    console.error("BITCOIN_REGTEST_HEADER_REFERENCE_FAIL",String(e.stack||e));
    process.exitCode=1;
  }
}
