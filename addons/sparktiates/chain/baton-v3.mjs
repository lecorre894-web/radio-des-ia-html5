/**
 * SPARKTIATES BATON V3 — ONE shared PoW blockchain across 2,048 logical
 * relay networks, not 2,048 independent ledgers.
 *
 * Reuses unchanged V2 PoW consensus validation and V2 genesis
 * "spk-net-0001". A V3 route commitment is included in the mined block
 * body and in its Merkle commitment. V3 validators *additionally* require
 * the exact deterministic relay/triangle assignment at every height.
 *
 * This is a NEW routed protocol (not backward-compatible with plain V2
 * blocks), with no BTC or market-valued assets.
 */
import {stable} from "./chain-core.mjs";
import {displayedHash,powMerkle} from "./pow-core.mjs";
import {
  V2_POLICY,genesisV2,initialV2State,candidateV2,
  acceptBlockV2,decodeCanonicalTarget,expectedBitsV2
} from "./pow-v2.mjs";
import {networkIdAt} from "./pow-networks.mjs";
import {triangle3D} from "./triangle-3d.mjs";

export const BATON_V3=Object.freeze({
  protocol:"SPARKTIATES-BATON-V3",
  baseNetworkId:"spk-net-0001",
  logicalRelays:2048,
  vertices:Object.freeze(["A","B","C"]),
  transport:"AUTHENTICATED_PRIVATE_TCP_FULL_DUPLEX",
  consensus:"SINGLE_SHA256D_CHAIN_WITH_ROUTING_COMMITMENT",
  isBitcoin:false,
  controlsRealCpuFrequency:false
});
const fail=what=>{throw Error("SPK BATON V3: "+what);};
const assert=(ok,what)=>{if(!ok)fail(what);};
const hashOK=x=>typeof x==="string"&&/^[0-9a-f]{64}$/.test(x);
const bodyHash=body=>displayedHash(
  Buffer.from("SPK-V2/BODY\0"+stable(body),"utf8"));

export function batonGenesis(){
  return genesisV2(BATON_V3.baseNetworkId);
}
export function initialBatonState(){
  return initialV2State(batonGenesis());
}
export function routeForHeight(height){
  assert(Number.isSafeInteger(height)&&height>=1&&height<=Number.MAX_SAFE_INTEGER,
    "hauteur invalide");
  const relayIndex=(height-1)%BATON_V3.logicalRelays;
  const vertexIndex=(height-1)%BATON_V3.vertices.length;
  return {
    relayId:networkIdAt(relayIndex+1),
    relayIndex:relayIndex+1,
    triangleVertex:BATON_V3.vertices[vertexIndex],
    cycle:Math.floor((height-1)/BATON_V3.logicalRelays)+1
  };
}
export function expectedRoute(state){
  assert(state&&state.chain?.[0]?.hash===batonGenesis().hash,
    "genèse partagée différente");
  const nextHeight=state.height+1;
  const r=routeForHeight(nextHeight);
  return {
    version:3,protocol:BATON_V3.protocol,
    height:nextHeight,
    relayId:r.relayId,
    triangleVertex:r.triangleVertex,
    previousBlockHash:state.hash,
    genesisHash:state.chain[0].hash,
    cycle:r.cycle
  };
}
export function makeBatonCandidate(state,{miner,transactions=[],
  timestamp=Math.floor(Date.now()/1000)}={}){
  const candidate=candidateV2(state,{miner,transactions,timestamp});
  // Commit the relay to the same PoW header as the block body.
  const body={...candidate.body,route:expectedRoute(state)};
  const merkleRoot=powMerkle([bodyHash(body),...transactions.map(tx=>tx.id)]);
  return {body,header:{...candidate.header,merkleRoot,nonce:0}};
}
export function acceptBatonBlock(state,block,opts={}){
  assert(state&&state.chain?.[0]?.hash===batonGenesis().hash,
    "incompatible genesis");
  assert(block&&block.body&&block.header&&
    block.body.route&&typeof block.body.route==="object",
    "missing routed block");
  const required=expectedRoute(state);
  assert(stable(block.body.route)===stable(required),
    "incorrect relay, vertex or previous-block baton");
  assert(block.header.previousHash===required.previousBlockHash,
    "block does not continue the preceding block");
  return acceptBlockV2(state,block,opts);
}
export function replayBatonChain(chain,opts={}){
  assert(Array.isArray(chain)&&chain.length>=1&&
    chain.length<=V2_POLICY.maxChainLength,
    "invalid chain length");
  assert(stable(chain[0])===stable(batonGenesis()),"independent genesis forbidden");
  let state=initialBatonState();
  for(const block of chain.slice(1)){
    state=acceptBatonBlock(state,block,opts);
  }
  return state;
}
export function chooseBatonChain(current,candidate,opts={}){
  const a=replayBatonChain(current,opts),b=replayBatonChain(candidate,opts);
  const replace=b.cumulativeWork>a.cumulativeWork;
  const picked=replace?b:a;
  return {
    selected:replace?"candidate":"current",
    height:picked.height,
    tip:picked.hash,
    cumulativeWork:picked.cumulativeWork.toString(),
    bothChainsValid:true,
    sameGenesis:true,
    tie:a.cumulativeWork===b.cumulativeWork,
    nextRelay:routeForHeight(picked.height+1).relayId,
    nextVertex:routeForHeight(picked.height+1).triangleVertex
  };
}
export function planRelayContinuity(count=BATON_V3.logicalRelays,{
  startingHeight=1
}={}){
  assert(Number.isSafeInteger(count)&&count>=1&&count<=BATON_V3.logicalRelays,
    "plan de relais hors limites");
  assert(Number.isSafeInteger(startingHeight)&&startingHeight>=1,
    "hauteur de départ invalide");
  return Array.from({length:count},(_,i)=>{
    const height=startingHeight+i;
    return {height,...routeForHeight(height),
      action:"EXTEND_PREVIOUS_VALIDATED_BLOCK",
      separateGenesis:false,
      sharedChain:true,
      mined:false};
  });
}
export function batonCorrespondence(state,block,opts={}){
  const next=acceptBatonBlock(state,block,opts);
  const target=decodeCanonicalTarget(block.header.bits);
  const chosen=expectedRoute(state);
  return {
    protocol:BATON_V3.protocol,
    height:next.height,previousBlockHash:state.hash,
    newBlockHash:next.hash,
    committedRelay:chosen.relayId,
    triangleVertex:chosen.triangleVertex,
    genesisHash:batonGenesis().hash,
    cumulativeWork:next.cumulativeWork.toString(),
    difficultyBits:"0x"+block.header.bits.toString(16),
    expectedDifficultyBits:"0x"+expectedBitsV2(state).toString(16),
    target:target.toString(16).padStart(64,"0"),
    proofValid:true,parentContinued:true,
    singleGlobalChain:true,bitcoin:false
  };
}
export function batonVisualTopology(){
  const graph=triangle3D(BATON_V3.baseNetworkId);
  return {
    ...graph,
    logicalRelayCount:BATON_V3.logicalRelays,
    sharedGenesisHash:batonGenesis().hash,
    independentChains:0,
    vertexOrder:BATON_V3.vertices,
    interpretation:"3D virtual coordinates represent the three physical-process roles; the 2048 relays form one sequential block lineage."
  };
}
