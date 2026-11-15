/**
 * Private 3-validator cluster. Real Node.js TCP on 127.0.0.1 ONLY.
 * Keys stay on the executing machine. No default outside connections.
 */
import {mkdtemp,mkdir,readFile,writeFile,stat} from "node:fs/promises";
import {join} from "node:path";
import {homedir,tmpdir} from "node:os";
import {randomBytes} from "node:crypto";
import {
  POLICY,newIdentity,genesis,address,proposeBody,signTransaction,
  mintTxid,balance,validatorList
} from "./chain-core.mjs";
import {createValidatorNode,rpc} from "./validator-node.mjs";

const IDS=["alpha","beta","gamma"];
export const DEFAULT_DIRECTORY=join(homedir(),".sparktiates","chain","private-regtest-v1");
const encode=data=>JSON.stringify(data,null,2)+"\n";
async function savePrivate(path,data){
  await writeFile(path,encode(data),{mode:0o600,flag:"wx"});
}
export async function loadOrCreateNetwork(dir){
  if(typeof dir!=="string"||!dir)throw Error("Répertoire de réseau requis");
  await mkdir(dir,{recursive:true,mode:0o700});
  const configPath=join(dir,"network.json");
  let config;
  try{
    config=JSON.parse(await readFile(configPath,"utf8"));
  }catch(e){
    if(e.code!=="ENOENT")throw e;
    const identities=IDS.map(id=>({id,...newIdentity()}));
    const validators=validatorList(identities);
    const publicConfig={protocol:1,policy:POLICY,validators,genesisHash:genesis(validators).hash};
    const token=randomBytes(32).toString("hex");
    for(const v of identities){
      await savePrivate(join(dir,"key-"+v.id+".json"),v);
    }
    await savePrivate(join(dir,"private-token.json"),{token});
    await savePrivate(configPath,publicConfig);
    config=publicConfig;
  }
  const identities=[];
  for(const id of IDS){
    const item=JSON.parse(await readFile(join(dir,"key-"+id+".json"),"utf8"));
    if(item.id!==id||!item.privateKey||!item.publicKey)
      throw Error("Clé réseau invalide : "+id);
    identities.push(item);
  }
  const validators=validatorList(identities);
  const token=JSON.parse(await readFile(join(dir,"private-token.json"),"utf8")).token;
  if(config.protocol!==1||config.genesisHash!==genesis(validators).hash||
     JSON.stringify(config.validators)!==JSON.stringify(validators))
    throw Error("Genèse incompatible avec les clés privées. Arrêt sans écriture.");
  return {config,identities,validators,token};
}
export async function startPrivateCluster({dir=DEFAULT_DIRECTORY,ports=[19401,19402,19403]}={}){
  if(!Array.isArray(ports)||ports.length!==3||
     !ports.every(p=>Number.isSafeInteger(p)&&p>=0&&p<=65535)||
     new Set(ports.filter(Boolean)).size!==ports.filter(Boolean).length)
    throw Error("3 ports loopback distincts requis");
  const network=await loadOrCreateNetwork(dir);
  const nodes=[],actualPorts=[];
  try{
    for(let i=0;i<network.identities.length;i++){
      const node=await createValidatorNode({
        identity:network.identities[i],validators:network.validators,
        dataDir:dir,port:ports[i],token:network.token
      });
      nodes.push(node);
      const listening=await node.listen();
      actualPorts.push(listening.port);
    }
    const heads=nodes.map(n=>n.state.hash);
    if(new Set(heads).size!==1||new Set(nodes.map(n=>n.state.height)).size!==1)
      throw Error("Nœuds désynchronisés : blocage par sécurité");
  }catch(e){
    await Promise.allSettled(nodes.map(n=>n.close()));
    throw e;
  }
  let closed=false;
  return {
    ...network,dir,nodes,ports:actualPorts,
    async statuses(){return Promise.all(actualPorts.map(port=>rpc(port,"/status",network.token)));},
    async proposeAndCommit(transactions=[]){
      if(closed)throw Error("Cluster arrêté");
      const heads=nodes.map(n=>n.state.hash);
      if(new Set(heads).size!==1||
         new Set(nodes.map(n=>n.state.height)).size!==1)
        throw Error("Nœuds désynchronisés : aucun nouveau bloc");
      const prior=nodes[0].state;
      const leader=network.validators[prior.height%3];
      const proposer=network.identities.find(x=>x.id===leader.id);
      const body=proposeBody(prior,{
        validators:network.validators,proposer:leader.id,
        timestamp:Math.max(Date.now(),prior.timestamp+1),
        transactions,coinbaseTo:address(proposer.publicKey)
      });
      const certificate=[];
      for(const port of actualPorts){
        const vote=await rpc(port,"/vote",network.token,{body});
        certificate.push(vote);
      }
      if(certificate.length<POLICY.quorum)throw Error("Quorum indisponible");
      const commits=await Promise.all(actualPorts.map(port=>
        rpc(port,"/commit",network.token,{body,certificate})));
      if(commits.some(x=>x.hash!==commits[0].hash))
        throw Error("Divergence détectée après commit");
      return {body,certificate,commits,hash:commits[0].hash};
    },
    async close(){
      if(closed)return;closed=true;
      await Promise.allSettled(nodes.map(n=>n.close()));
    }
  };
}
export async function runDemonstration({dir,ports=[0,0,0],cleanup=true}={}){
  const ownDir=!dir;
  let temp;
  if(ownDir)temp=await mkdtemp(join(tmpdir(),"sparktiates-chain-"));
  const where=dir||temp;
  let cluster;
  try{
    cluster=await startPrivateCluster({dir:where,ports});
    const initial=await cluster.statuses();
    if(initial[0].height===0){
      const first=await cluster.proposeAndCommit();
      const alpha=cluster.identities.find(x=>x.id==="alpha");
      const beta=cluster.identities.find(x=>x.id==="beta");
      const alphaAddress=address(alpha.publicKey);
      const betaAddress=address(beta.publicKey);
      const fee=1000,sendAmount=1_250_000_000;
      const input=cluster.nodes[0].state.utxos.get(mintTxid(1)+":0");
      if(!input||input.amount!==POLICY.firstReward)
        throw Error("Récompense initiale non enregistrée");
      const tx=signTransaction({
        version:1,chainId:POLICY.chainId,
        inputs:[{txid:mintTxid(1),index:0,pubKey:alpha.publicKey}],
        outputs:[
          {to:betaAddress,amount:sendAmount},
          {to:alphaAddress,amount:input.amount-sendAmount-fee}
        ]
      },[alpha.privateKey]);
      const second=await cluster.proposeAndCommit([tx]);
      const balances={
        alpha:balance(cluster.nodes[0].state,alphaAddress),
        beta:balance(cluster.nodes[0].state,betaAddress)
      };
      let rejectedDoubleSpend=false;
      try{await cluster.proposeAndCommit([tx]);}
      catch(e){rejectedDoubleSpend=/déjà dépensé|inexistant/i.test(String(e.message));}
      if(!rejectedDoubleSpend)throw Error("Test de double dépense non concluant");
      const final=await cluster.statuses();
      if(final.some(s=>s.hash!==final[0].hash||s.height!==2))
        throw Error("Divergence entre les trois nœuds");
      return {
        status:"PASS",network:POLICY.chainId,temporary:ownDir,realLocalNodes:3,
        genesis:cluster.nodes[0].genesis.hash,
        height:final[0].height,tip:final[0].hash,
        supply:final[0].supply,
        transaction:tx.id,blocks:[first.hash,second.hash],
        balances,fee,quorum:second.certificate.length,
        doubleSpendRejected:rejectedDoubleSpend,
        allNodesConverged:true,ports:cluster.ports
      };
    }
    const final=await cluster.statuses();
    return {status:"PASS",network:POLICY.chainId,existing:true,
      height:final[0].height,tip:final[0].hash,
      supply:final[0].supply,allNodesConverged:true};
  }finally{
    await cluster?.close();
    if(ownDir&&cleanup){
      const {rm}=await import("node:fs/promises");
      await rm(temp,{recursive:true,force:true});
    }
  }
}
