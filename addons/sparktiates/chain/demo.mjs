import {runDemonstration} from "./private-cluster.mjs";
try{
  const report=await runDemonstration();
  console.log("SPARKTIATES_CHAIN_DEMO",JSON.stringify(report,null,2));
  if(report.status!=="PASS"||!report.allNodesConverged||
     !report.doubleSpendRejected)process.exitCode=1;
}catch(e){
  console.error("SPARKTIATES_CHAIN_FAILED",String(e?.stack||e));
  process.exitCode=1;
}
