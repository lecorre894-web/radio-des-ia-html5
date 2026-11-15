/**
 * Run three loopback validators with persistent local keys and ledger.
 * Does not start a remote service; no public network is used.
 */
import {startPrivateCluster,DEFAULT_DIRECTORY} from "./private-cluster.mjs";
import {POLICY} from "./chain-core.mjs";
let cluster;
try{
  cluster=await startPrivateCluster({
    dir:DEFAULT_DIRECTORY,ports:[19401,19402,19403]
  });
  const statuses=await cluster.statuses();
  console.log("SPARKTIATES CHAIN — RESEAU PRIVE EXPERIMENTAL");
  console.log(JSON.stringify({
    network:POLICY.chainId,
    addresses:["127.0.0.1:19401","127.0.0.1:19402","127.0.0.1:19403"],
    directory:DEFAULT_DIRECTORY,
    height:statuses[0].height,
    genesisHash:statuses[0].genesisHash,
    tip:statuses[0].hash,
    validators:statuses.map(s=>s.id),
    privateKeyLocation:"fichiers locaux 0600, jamais imprimés",
    consensus:"Quorum signé expérimental ; pas un protocole BFT audité"
  },null,2));
  console.log("Arrêt : Ctrl+C. Les blocs et clés restent enregistrés.");
  const shutdown=async()=>{
    console.log("Fermeture du réseau privé...");
    await cluster.close();
    process.exit(0);
  };
  process.once("SIGINT",()=>void shutdown());
  process.once("SIGTERM",()=>void shutdown());
}catch(e){
  await cluster?.close();
  console.error("SPARKTIATES_CHAIN_START_FAILED",String(e?.stack||e));
  process.exitCode=1;
}
