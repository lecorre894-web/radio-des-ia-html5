/**
 * SPARKTIATES P2P V2 — authenticated private, FULL-DUPLEX TCP overlay.
 * Every socket can send+receive TIP / GET_CHAIN / CHAIN at any moment.
 * Only 127.0.0.1; transport NOT ENCRYPTED. For remote hosts use a real
 * VPN/TLS gateway. NO public discovery, no Internet peers.
 */
import net from "node:net";
import {randomBytes,timingSafeEqual} from "node:crypto";
import {genesisV2,initialV2State,acceptBlockV2,chooseChainV2,
  replayV2,validNetworkId,V2_POLICY} from "./pow-v2.mjs";
import {deriveNetworkSecret,derivePeerHmac} from "./pow-networks.mjs";

const MAX_FRAME=1024*1024;
const MAX_PEERS=12,PROTO=2;
const check=(x,message)=>{if(!x)throw Error("SPK OVERLAY: "+message);};
function fixedEqual(a,b){
  if(typeof a!=="string"||typeof b!=="string"||
     !/^[a-f0-9]{64}$/.test(a)||!/^[a-f0-9]{64}$/.test(b))return false;
  return timingSafeEqual(Buffer.from(a,"hex"),Buffer.from(b,"hex"));
}
export function createFullDuplexOverlay({
  networkId="spk-net-0001",masterSecret,port=0,host="127.0.0.1",
  initialChain=null,onEvent=()=>{}
}={}){
  check(validNetworkId(networkId),"networkId 1..2048 nécessaire");
  check(typeof masterSecret==="string"&&masterSecret.length>=32,
    "secret privé requis (32 caractères minimum)");
  check(host==="127.0.0.1"&&Number.isSafeInteger(port)&&port>=0&&port<=65535,
    "réseau local privé uniquement");
  const genesis=genesisV2(networkId);
  let state=initialChain?replayV2(initialChain):initialV2State(genesis);
  check(state.chainId===genesis.chainId,"chaîne initiale d'un autre réseau");
  const secret=deriveNetworkSecret(masterSecret,networkId);
  const id=randomBytes(16).toString("hex");
  const peers=new Set();
  let server=null,stopped=false,started=false;
  const stats={acceptedPeers:0,rejectedPeers:0,sent:0,received:0,
    tipsSent:0,syncs:0,blocksAdopted:0};
  const notify=(type,detail={})=>{
    try{onEvent({type,networkId,...detail});}catch{}
  };
  function tip(){
    return {type:"TIP",height:state.height,hash:state.hash,
      work:state.cumulativeWork.toString(),networkId};
  }
  function send(ctx,msg){
    if(!ctx.socket||ctx.socket.destroyed)return false;
    const raw=JSON.stringify(msg);
    if(Buffer.byteLength(raw,"utf8")>=MAX_FRAME)
      throw Error("SPK OVERLAY: paquet supérieur à la limite privée");
    ctx.socket.write(raw+"\n");
    stats.sent++;
    if(msg.type==="TIP")stats.tipsSent++;
    return true;
  }
  function broadcastTip(except=null){
    for(const peer of peers){
      if(peer.authenticated&&peer!==except)send(peer,tip());
    }
  }
  function reject(ctx,why){
    if(!ctx.terminated){
      ctx.terminated=true;stats.rejectedPeers++;
      notify("REJECTED",{reason:String(why).slice(0,140)});
    }
    ctx.socket.destroy();
  }
  function handshake(ctx){
    const hello={type:"HELLO",version:PROTO,networkId,id,
      genesisHash:genesis.hash,nonce:randomBytes(16).toString("hex")};
    hello.mac=derivePeerHmac(secret,hello);
    send(ctx,hello);
  }
  function handle(ctx,m){
    if(!m||typeof m!=="object"||Array.isArray(m)||
       typeof m.type!=="string"){reject(ctx,"trame inconnue");return;}
    const now=Date.now();
    if(now-ctx.windowStart>1000){ctx.windowStart=now;ctx.windowCount=0;}
    ctx.windowCount++;
    if(ctx.windowCount>80){reject(ctx,"limite de messages");return;}
    stats.received++;
    if(!ctx.authenticated){
      if(m.type!=="HELLO"||m.version!==PROTO||
         m.networkId!==networkId||m.genesisHash!==genesis.hash||
         typeof m.id!=="string"||!/^[a-f0-9]{32}$/.test(m.id)||
         m.id===id||typeof m.nonce!=="string"||
         !/^[a-f0-9]{32}$/.test(m.nonce)){
        reject(ctx,"identité ou genèse P2P incompatible");return;
      }
      const expected=derivePeerHmac(secret,m);
      if(!fixedEqual(m.mac,expected)){
        reject(ctx,"authentification P2P invalide");return;
      }
      ctx.authenticated=true;ctx.remoteId=m.id;
      stats.acceptedPeers++;
      notify("CONNECTED",{peer:m.id,direction:ctx.direction});
      if(ctx.resolve){ctx.resolve({peerId:m.id,direction:ctx.direction});ctx.resolve=null;}
      send(ctx,tip());return;
    }
    switch(m.type){
      case "PING":
        send(ctx,{type:"PONG",nonce:typeof m.nonce==="string"?m.nonce.slice(0,64):""});
        return;
      case "PONG":return;
      case "TIP":{
        if(m.networkId!==networkId||
           !Number.isSafeInteger(m.height)||m.height<0||
           typeof m.hash!=="string"||!/^[a-f0-9]{64}$/.test(m.hash)||
           typeof m.work!=="string"||!/^\d{1,100}$/.test(m.work)){
          reject(ctx,"annonce de tête invalide");return;
        }
        if(BigInt(m.work)>state.cumulativeWork&&!ctx.requested){
          ctx.requested=true;send(ctx,{type:"GET_CHAIN",networkId});
        }
        return;
      }
      case "GET_CHAIN":{
        if(m.networkId!==networkId){reject(ctx,"demande cross-network");return;}
        try{send(ctx,{type:"CHAIN",networkId,chain:state.chain});}
        catch(e){notify("SYNC_UNAVAILABLE",{error:String(e.message)});}
        return;
      }
      case "CHAIN":{
        ctx.requested=false;
        if(m.networkId!==networkId||!Array.isArray(m.chain)||
           m.chain.length>V2_POLICY.maxChainLength){
          reject(ctx,"réponse de chaîne étrangère ou trop grande");return;
        }
        try{
          // Never trust peer work; independently verify EVERY block and UTXO.
          const picked=chooseChainV2(state.chain,m.chain);
          stats.syncs++;
          if(picked.selected==="candidate"){
            const next=replayV2(m.chain);
            const added=Math.max(0,next.height-state.height);
            state=next;stats.blocksAdopted+=added;
            notify("SYNCED",{height:state.height,hash:state.hash,
              work:state.cumulativeWork.toString(),peer:ctx.remoteId});
            broadcastTip(ctx);
          }
        }catch(e){reject(ctx,"chaîne non valide: "+String(e.message||e));}
        return;
      }
      default:reject(ctx,"commande P2P inconnue");
    }
  }
  function attach(socket,direction){
    if(peers.size>=MAX_PEERS){socket.destroy();return null;}
    socket.setNoDelay(true);
    socket.setTimeout(30000,()=>socket.destroy());
    const ctx={socket,direction,authenticated:false,remoteId:null,
      requested:false,windowStart:Date.now(),windowCount:0,
      buffer:"",terminated:false,resolve:null,reject:null};
    peers.add(ctx);
    socket.on("data",chunk=>{
      ctx.buffer+=chunk.toString("utf8");
      if(Buffer.byteLength(ctx.buffer,"utf8")>MAX_FRAME){
        reject(ctx,"trame trop longue");return;
      }
      let newline=ctx.buffer.indexOf("\n");
      while(newline>=0){
        const line=ctx.buffer.slice(0,newline);ctx.buffer=ctx.buffer.slice(newline+1);
        if(Buffer.byteLength(line,"utf8")>=MAX_FRAME){
          reject(ctx,"trame trop longue");return;
        }
        try{handle(ctx,JSON.parse(line));}
        catch(e){reject(ctx,"JSON invalide: "+String(e.message||e));}
        if(socket.destroyed)return;
        newline=ctx.buffer.indexOf("\n");
      }
    });
    socket.on("error",e=>{
      if(ctx.reject){ctx.reject(e);ctx.reject=null;}
    });
    socket.on("close",()=>{
      peers.delete(ctx);
      if(ctx.reject){ctx.reject(Error("Connexion fermée avant authentification"));ctx.reject=null;}
      notify("DISCONNECTED",{peer:ctx.remoteId});
    });
    return ctx;
  }
  return {
    networkId,genesis,id,
    get state(){return state;},
    get stats(){return {...stats,peers:[...peers].filter(p=>p.authenticated).length};},
    get peers(){return [...peers].filter(p=>p.authenticated).map(p=>({
      id:p.remoteId,direction:p.direction}));},
    async listen(){
      if(started)throw Error("SPK OVERLAY: déjà en écoute");
      started=true;server=net.createServer(sock=>{
        const ctx=attach(sock,"incoming");
        if(ctx)handshake(ctx);
      });
      try{
        await new Promise((resolve,reject)=>{
          server.once("error",reject);
          server.listen({host,port},()=>{
            server.off("error",reject);resolve();
          });
        });
      }catch(e){started=false;throw e;}
      const listening=server.address();
      notify("LISTENING",{host,port:listening.port});
      return {host,port:listening.port,networkId,genesisHash:genesis.hash};
    },
    async connect(remotePort){
      check(started&&!stopped&&Number.isSafeInteger(remotePort)&&
        remotePort>0&&remotePort<=65535,"écoute locale requise");
      const socket=net.createConnection({host:"127.0.0.1",port:remotePort});
      const ctx=attach(socket,"outgoing");
      if(!ctx)throw Error("SPK OVERLAY: limite de pairs");
      return new Promise((resolve,rejectPromise)=>{
        const timer=setTimeout(()=>{
          ctx.reject=null;reject(ctx,"handshake expirée");
          rejectPromise(Error("SPK OVERLAY: authentification expirée"));
        },5000);
        ctx.resolve=value=>{clearTimeout(timer);resolve(value);};
        ctx.reject=e=>{clearTimeout(timer);rejectPromise(e);};
        socket.once("connect",()=>handshake(ctx));
      });
    },
    acceptLocalBlock(block){
      check(!stopped,"nœud fermé");
      state=acceptBlockV2(state,block);
      broadcastTip();
      notify("MINED",{height:state.height,hash:state.hash});
      return {height:state.height,hash:state.hash,work:state.cumulativeWork.toString()};
    },
    announce(){broadcastTip();},
    async close(){
      if(stopped)return;stopped=true;
      for(const peer of peers)peer.socket.destroy();
      if(server?.listening)await new Promise(resolve=>server.close(()=>resolve()));
    }
  };
}
