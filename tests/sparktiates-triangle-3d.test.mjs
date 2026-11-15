import test from "node:test";
import assert from "node:assert/strict";
import {TRIANGLE_VERTICES,TRIANGLE_EDGES,triangle3D} from "../addons/sparktiates/chain/triangle-3d.mjs";
import {createNetworkCatalog} from "../addons/sparktiates/chain/pow-networks.mjs";

test("G: triangle inscrit dans l'espace 3D, non dégénéré",()=>{
  const triangle=triangle3D("spk-net-0001");
  assert.equal(triangle.vertices.length,3);
  assert.equal(TRIANGLE_VERTICES.length,3);
  assert.equal(TRIANGLE_EDGES.length,3);
  assert.equal(triangle.edges.length,3);
  assert.equal(triangle.areaVirtualSquareUnits>0,true);
  assert.ok(triangle.vertices.some(v=>v.position.z!==0));
  assert.equal(triangle.normal.x,0);
  assert.equal(triangle.normal.y,-30);
  assert.equal(triangle.normal.z,24);
  assert.deepEqual(triangle.degrees,{A:2,B:2,C:2});
  assert.ok(triangle.edges.every(x=>x.fullDuplex===true));
  assert.ok(triangle.vertices.every(v=>v.emitsRealSha256dBlock));
  assert.deepEqual(triangle.schedule.map(x=>x.minerVertex),["A","B","C"]);
  assert.deepEqual(triangle.schedule.map(x=>x.blockHeight),[1,2,3]);
  assert.ok(triangle.schedule.every(x=>x.requiredAcknowledgementsFromOthers===2));
});
test("G: géométrie indépendante de la genèse, réseau isolé parmi 2048",()=>{
  const first=triangle3D("spk-net-0001");
  const last=triangle3D("spk-net-2048");
  const catalog=createNetworkCatalog();
  assert.equal(catalog.count,2048);
  assert.notEqual(first.chainId,last.chainId);
  assert.deepEqual(first.edges,last.edges);
  assert.deepEqual(first.normal,last.normal);
  assert.equal(first.networkId,catalog.entries[0].id);
  assert.equal(last.networkId,catalog.entries.at(-1).id);
  assert.notEqual(catalog.entries[0].genesisHash,catalog.entries.at(-1).genesisHash);
  assert.throws(()=>triangle3D("spk-net-2049"),/identifiant réseau/);
});
