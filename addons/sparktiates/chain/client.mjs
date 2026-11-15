/**
 * SPARKTIATES CHAIN local control CLI.
 * Read-only/status, create block, or signed payment between test validators.
 * Never connects to Bitcoin mainnet and never prints private keys.
 */
import {DEFAULT_DIRECTORY,loadOrCreateNetwork} from "./private-cluster.mjs";
import {rpc} from "./validator-node.mjs";
import {
  POLICY,genesis,initialState,commitBlock,validatorList,address,
  proposeBody,signTransaction,spendables,balance
} from "./chain-core.mjs";

const ports=[19401,19402,19403];
function parseSPK(text){
  const match=String(text||"").match(/^(\d{1,8})(?:\.(\d{1,8}))?$/);
  if(!match)throw Error("Montant SPK invalide (8 décimales maximum).");
  const units=Number(match[1])*100_000_000+
    Number((match[2]||"").padEnd(8,"0"));
  if(!Number.isSafeInteger(units)||units<=0||units>POLICY.maxSupply)
    throw Error("Montant SPK hors limites.");
  return units;
}
function displaySPK(sats){
  const n=BigInt(sats),base=100_000_000n;
  const integer=n/base,fraction=(n%base).toString().padStart(8,"0").replace(/0+$/,"");
  return integer.toString()+(fraction?"."+fraction:"")+" SPK";
}
function validateAlias(value){
  if(!["alpha","beta","gamma"].includes(value))
    throw Error("Portefeuille de test autorisé : alpha, beta ou gamma.");
  return value;
}
async function verifiedNetwork(net){
  const raw=await rpc(ports[0],"/chain",net.token);
  if(!Array.isArray(raw.chain)||raw.chain[0]?.hash!==net.config.genesisHash)
    throw Error("Genèse distante différente : arrêt.");
  let current=initialState(genesis(net.validators));
  for(const entry of raw.chain.slice(1))
    current=commitBlock(current,entry.body,entry.certificate,net.validators);
  const remote=await Promise.all(ports.map(port=>rpc(port,"/status",net.token)));
  if(remote.some(x=>x.hash!==current.hash||x.height!==current.height||
    x.supply!==current.supply||x.genesisHash!==net.config.genesisHash))
    throw Error("Nœuds non synchronisés : aucune signature.");
  return current;
}
async function commitNewBlock(net,state,transactions=[]){
  const validators=validatorList(net.validators);
  const leader=validators[state.height%validators.length];
  const body=proposeBody(state,{
    validators,proposer:leader.id,coinbaseTo:address(leader.publicKey),
    timestamp:Math.max(Date.now(),state.timestamp+1),transactions
  });
  const votes=[];
  for(const port of ports)
    votes.push(await rpc(port,"/vote",net.token,{body}));
  if(votes.length<POLICY.quorum)throw Error("Certificat de consensus manquant.");
  const replies=[];
  for(const port of ports)
    replies.push(await rpc(port,"/commit",net.token,{body,certificate:votes}));
  if(replies.some(x=>x.hash!==replies[0].hash))
    throw Error("Divergence de consensus détectée.");
  return {height:body.height,blockHash:replies[0].hash,
    proposer:leader.id,transactions:transactions.length,
    rewardAtomic:body.coinbase.amount,quorum:votes.length};
}
async function main(){
  const cmd=process.argv[2]||"status";
  if(!["status","forge","transfer"].includes(cmd))
    throw Error("Commande : status | forge | transfer alpha beta 12.5");
  const net=await loadOrCreateNetwork(DEFAULT_DIRECTORY);
  const state=await verifiedNetwork(net);
  if(cmd==="status"){
    const balances=Object.fromEntries(net.validators.map(v=>[
      v.id,displaySPK(balance(state,address(v.publicKey)))
    ]));
    console.log(JSON.stringify({
      network:POLICY.chainId,genesis:net.config.genesisHash,
      height:state.height,hash:state.hash,
      issued:displaySPK(state.supply),balances,
      security:"PRIVATE REGTEST; ZERO CLAIM OF MARKET VALUE"
    },null,2));
    return;
  }
  if(cmd==="forge"){
    console.log(JSON.stringify(await commitNewBlock(net,state),null,2));
    return;
  }
  const from=validateAlias(process.argv[3]),to=validateAlias(process.argv[4]);
  if(from===to)throw Error("Émetteur et destinataire doivent différer.");
  const amount=parseSPK(process.argv[5]);
  const fee=1000; // policy de démonstration, 0.00001000 SPK
  const sender=net.identities.find(x=>x.id===from);
  const recipient=net.identities.find(x=>x.id===to);
  const senderAddress=address(sender.publicKey);
  const all=spendables(state,senderAddress);
  const chosen=[];let total=0;
  for(const u of all){
    chosen.push(u);total+=u.amount;
    if(chosen.length>32)throw Error("Trop d'UTXO, consolidation nécessaire.");
    if(total>=amount+fee)break;
  }
  if(total<amount+fee)throw Error("Solde insuffisant. Créer d'abord des blocs.");
  const outputs=[{to:address(recipient.publicKey),amount}];
  if(total>amount+fee)
    outputs.push({to:senderAddress,amount:total-amount-fee});
  const unsigned={
    version:1,chainId:POLICY.chainId,
    inputs:chosen.map(u=>({txid:u.txid,index:u.index,pubKey:sender.publicKey})),
    outputs
  };
  const tx=signTransaction(unsigned,chosen.map(()=>sender.privateKey));
  const block=await commitNewBlock(net,state,[tx]);
  console.log(JSON.stringify({...block,transaction:tx.id,
    from,to,amount:displaySPK(amount),fee:displaySPK(fee),
    conservationChecked:true},null,2));
}
main().catch(e=>{
  console.error("SPARTKIATES CHAIN CLI",String(e?.message||e));
  process.exitCode=1;
});
