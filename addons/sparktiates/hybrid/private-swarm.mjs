/**
 * Swarm PRIVATE: coopération de calcul entre onglets du MÊME navigateur/origine.
 * Pas de tracker, pas de serveur public, pas d'accès à la mémoire VRM.
 * Le matériel reste celui des appareils réels ; les onglets n'en ajoutent pas.
 */
export const SWARM_NAME="sparktiates-hybrid-private-v1";
export function validateSwarmJob(job){
  return Boolean(job&&Number.isInteger(job.id)&&job.id>=0&&job.id<256&&
    Number.isSafeInteger(job.seed)&&job.seed>=0&&job.seed<=0xffffffff&&
    Number.isInteger(job.steps)&&job.steps>=1&&job.steps<=1_000_000);
}
export function createPrivateSwarm({
  createChannel=name=>new BroadcastChannel(name),
  createWorker=()=>new Worker(new URL("./compute-worker.mjs",import.meta.url),{type:"module"}),
  clock=()=>Date.now(),onPeers=()=>{}
}={}){
  const id=typeof crypto!=="undefined"&&crypto.randomUUID?
    crypto.randomUUID():"local-"+Math.random().toString(36).slice(2);
  let channel=null,timer=null,enabled=false;
  const peers=new Map(),waiting=new Map();
  const broadcast=data=>{if(enabled&&channel)channel.postMessage({...data,from:id});};
  const listPeers=()=>{
    const now=clock();
    for(const [key,item] of peers)if(now-item.seen>11_000)peers.delete(key);
    return [...peers.entries()].map(([peerId,p])=>({id:peerId,seen:p.seen}))
      .sort((a,b)=>a.id.localeCompare(b.id));
  };
  const ping=()=>{broadcast({type:"HELLO"});onPeers(listPeers());};
  async function answerWork(msg){
    if(!enabled||msg.to!==id||!validateSwarmJob(msg.job)||
       typeof msg.requestId!=="string"||msg.requestId.length>85)return;
    const worker=createWorker();
    const job=msg.job;
    try{
      const result=await new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>{clearTimeout(timeout);reject(Error("Worker distant trop lent"));},9000);
        worker.onmessage=event=>{
          clearTimeout(timeout);
          event.data?.type==="RESULT"?resolve(event.data.result):
            reject(Error("Résultat du worker non valide"));
        };
        worker.onerror=e=>{clearTimeout(timeout);reject(Error(String(e.message||e)));};
        worker.postMessage({type:"RUN",job});
      });
      broadcast({type:"WORK_DONE",to:msg.from,requestId:msg.requestId,result});
    }catch(e){
      broadcast({type:"WORK_FAIL",to:msg.from,requestId:msg.requestId,
        error:String(e.message||e).slice(0,80)});
    }finally{worker.terminate?.();}
  }
  function onMessage(event){
    const m=event.data;
    if(!m||typeof m!=="object"||typeof m.from!=="string"||m.from===id)return;
    if(m.type==="HELLO"){
      peers.set(m.from,{seen:clock()});
      onPeers(listPeers());
      // Reply to newcomers without growing into an infinite HELLO loop.
      if(m.from>id)broadcast({type:"PRESENT"});
    }else if(m.type==="PRESENT"){
      peers.set(m.from,{seen:clock()});onPeers(listPeers());
    }else if(m.type==="BYE"){
      peers.delete(m.from);onPeers(listPeers());
    }else if(m.type==="WORK"&&m.to===id){
      void answerWork(m);
    }else if((m.type==="WORK_DONE"||m.type==="WORK_FAIL")&&m.to===id){
      const req=waiting.get(m.requestId);
      if(!req||req.to!==m.from)return;
      waiting.delete(m.requestId);clearTimeout(req.timer);
      if(m.type==="WORK_FAIL"||m.result?.id!==req.job.id||
         !Number.isSafeInteger(m.result.value)||m.result.value<0||
         m.result.value>0xffffffff){
        req.reject(Error("Nœud privé indisponible ou réponse invalide"));return;
      }
      req.resolve(m.result);
    }
  }
  return {
    get id(){return id;},
    get enabled(){return enabled;},
    peers:listPeers,
    join(){
      if(enabled)return;
      channel=createChannel(SWARM_NAME);
      channel.onmessage=onMessage;enabled=true;
      ping();timer=setInterval(ping,3000);
    },
    close(){
      if(!enabled)return;
      broadcast({type:"BYE"});enabled=false;
      clearInterval(timer);timer=null;
      channel?.close();channel=null;peers.clear();
      for(const req of waiting.values()){
        clearTimeout(req.timer);req.reject(Error("Essaim arrêté"));
      }
      waiting.clear();onPeers([]);
    },
    async runOnPeer(peerId,job,{timeoutMs=7000}={}){
      if(!enabled||!validateSwarmJob(job)||!listPeers().some(x=>x.id===peerId))
        throw Error("Nœud pair absent ou travail invalide.");
      const requestId=id+"-"+Math.random().toString(36).slice(2,15);
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{
          waiting.delete(requestId);
          reject(Error("Délai du nœud privé dépassé"));
        },Math.max(500,Math.min(12000,timeoutMs)));
        waiting.set(requestId,{to:peerId,job,timer,resolve,reject});
        broadcast({type:"WORK",to:peerId,requestId,job});
      });
    }
  };
}
