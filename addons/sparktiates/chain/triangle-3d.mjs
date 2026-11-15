/**
 * SPARKTIATES TRIANGLE 3D — 3 real mining vertices, full-mesh P2P.
 * Coordinates embed a planar triangle in 3D; they NEVER represent CPU
 * positions, mining power, physical network distance or extra processors.
 */
import {chainIdFor} from "./pow-v2.mjs";

export const TRIANGLE_VERTICES=Object.freeze([
  Object.freeze({id:"A",label:"Alpha",position:Object.freeze({x:0,y:0,z:0})}),
  Object.freeze({id:"B",label:"Bêta",position:Object.freeze({x:6,y:0,z:0})}),
  Object.freeze({id:"C",label:"Gamma",position:Object.freeze({x:3,y:4,z:5})})
]);
export const TRIANGLE_EDGES=Object.freeze([
  Object.freeze({from:"A",to:"B"}),
  Object.freeze({from:"B",to:"C"}),
  Object.freeze({from:"C",to:"A"})
]);
const subtract=(b,a)=>({x:b.x-a.x,y:b.y-a.y,z:b.z-a.z});
const cross=(a,b)=>({
  x:a.y*b.z-a.z*b.y,
  y:a.z*b.x-a.x*b.z,
  z:a.x*b.y-a.y*b.x
});
const norm=x=>Math.hypot(x.x,x.y,x.z);
export function triangle3D(networkId="spk-net-0001"){
  const chainId=chainIdFor(networkId);
  const lookup=new Map(TRIANGLE_VERTICES.map(x=>[x.id,x.position]));
  const edges=TRIANGLE_EDGES.map(({from,to})=>{
    const segment=subtract(lookup.get(to),lookup.get(from));
    return {from,to,fullDuplex:true,lengthVirtualUnits:norm(segment),
      transport:"TCP_LOOPBACK_PRIVATE"};
  });
  const a=lookup.get("A"),b=lookup.get("B"),c=lookup.get("C");
  const normal=cross(subtract(b,a),subtract(c,a));
  const area=norm(normal)/2;
  if(area<=0||!Number.isFinite(area))throw Error("Triangle 3D dégénéré");
  if(new Set(TRIANGLE_VERTICES.map(x=>x.id)).size!==3 ||
     TRIANGLE_EDGES.length!==3)throw Error("Triangle 3D incohérent");
  const degrees=Object.fromEntries(TRIANGLE_VERTICES.map(x=>[
    x.id,edges.filter(e=>e.from===x.id||e.to===x.id).length]));
  if(Object.values(degrees).some(degree=>degree!==2))
    throw Error("Les trois sommets doivent avoir exactement deux voisins");
  return {
    topology:"SPARKTIATES_TRIANGLE_3D_FULL_DUPLEX_V1",
    chainId,networkId,
    vertices:TRIANGLE_VERTICES.map(v=>({...v,
      emitsRealSha256dBlock:true,isolatedProcess:true})),
    edges,normal,
    areaVirtualSquareUnits:area,
    degrees,planarEmbeddingIn3D:true,
    timeModel:"REAL_CPU_MINING",
    consensus:"MOST_VALIDATED_CUMULATIVE_SHA256D_WORK",
    schedule:TRIANGLE_VERTICES.map((v,i)=>({
      order:i+1,minerVertex:v.id,
      blockHeight:i+1,requiredAcknowledgementsFromOthers:2
    })),
    caution:"Coordinates are virtual. Each real process uses real CPU and its own verified PoW state."
  };
}
