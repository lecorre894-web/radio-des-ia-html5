/**
 * SPARKTIATES BATON V3 — PRIVATE TCP FULL-DUPLEX overlay for ONE shared chain.
 * The relay network ID belongs to each BLOCK, not to the node's genesis.
 * 2,048 relay channels share a single PoW lineage, no cross-network fork.
 *
 * Loopback-only TCP; authentication via per-installation HMAC.
 * Traffic is NOT encrypted; never expose directly on a public interface.
 */
import net from "node:net";
import {createHmac,randomBytes,timingSafeEqual} from "node:crypto";
import {
  BATON_V3,batonGenesis,initialBatonState,acceptBatonBlock,
  replayBatonChain,chooseBatonChain,expectedRoute
} from "./baton-v3.mjs";

const MAX_FRAME=1024*1024,MAX_PEERS=8;
const equal=(a,b)=>{
  if(typeof a!=="string"||typeof b!=="string"||
     !/^[a-f0-9]{64}$/.test(a)||!/^[a-f0-9]{64}$/.test(b))
    return false;
  return timingSafeEqual(Buffer.from(a,"hex"),Buffer.from(b,"hex"));
};
const check=(x,s)=>{if(!x)throw Error("SPK BATON OVERLAY: "+s);};
const auth=(key,value)=>createHmac("sha256",key)
  .update(JSON.stringify(value)).digest("hex");

export function createBatonOverlay({
  vertex,secret,host="127.0.0.1",port=0,
  initialChain=null,onEvent=()=>{}
}={}){
  check(BATON_V3.vertices.includes(vertex),"sommet A, B ou C requis");
  check(typeof secret==="string"&&secret.length>=32,
    "secret privé d'au moins 32 caractères requis");
  check(host==="127.0.0.1"&&Number.isSafeInteger(port)&&port>=0&&port<=65535,
    "écoute loopback uniquement");
  const key=createHmac("sha256",secret)
    .update(BATON_V3.protocol+":shared-single-genesis").digest();
  let state=initialChain?replayBatonChain(initialChain):initialBatonState();
  const genesis=batonGenesis(),id=randomBytes(16).toString("hex");
  const sockets=new Set();
  const stats={outbound:0,inbound:0,sent:0,received:0,
    rejected:0,synchronizations:0,adoptedBlocks:0};
  let server=null,stopped=false;
  const emit=(type,rest={})=>{
    try{onEvent({type,vertex,...rest});}catch{}
  };
  const head=()=>({type:"TIP",protocol:BATON_V3.protocol,
    height:state.height,hash:state.hash,work:state.cumulativeWork.toString(),
    lastRelay:state.height?expectedRoute({
      ...state,height:state.height-1,hash:state.chain.at(-2)?.hash||genesis.hash,
      chain:state.chain.slice(0,-1)
    }).relayId:null,
    nextRelay:expectedRoute(state).relayId});
  function send(ctx,message){
    if(ctx.socket.destroyed)return false;
    const payload=JSON.stringify(message);
    if(Buffer.byteLength(payload)>=MAX_FRAME)
      throw Error("Frame too large for private sync");
    ctx.socket.write(payload+"\n");
    stats.sent++;return true;
  }
  function broadcast(message,exclude=null){
    for(const peer of sockets)
      if(peer.authenticated&&peer!==exclude)send(peer,message);
  }
  function reject(ctx,reason){
    if(!ctx.rejected){
      ctx.rejected=true;stats.rejected++;
      emit("REJECTED",{reason:String(reason).slice(0,120)});
    }
    ctx.socket.destroy();
  }
  function hello(ctx){
    const fields={type:"HELLO",protocol:BATON_V3.protocol,genesisHash:genesis.hash,
      nodeId:id,vertex,nonce:randomBytes(16).toString("hex")};
    send(ctx,{...fields,mac:auth(key,fields)});
  }
  function receive(ctx,msg){
    if(!msg||Array.isArray(msg)||typeof msg!=="object"||
       typeof msg.type!=="string"){
      reject(ctx,"invalid packet");return;
    }
    const now=Date.now();
    if(now-ctx.window>1000){ctx.window=now;ctx.count=0;}
    if(++ctx.count>100){reject(ctx,"rate cap exceeded");return;}
    stats.received++;
    if(!ctx.authenticated){
      const {mac,...fields}=msg;
      if(fields.type!=="HELLO"||fields.protocol!==BATON_V3.protocol||
         fields.genesisHash!==genesis.hash||
         !BATON_V3.vertices.includes(fields.vertex)||
         fields.vertex===vertex||
         typeof fields.nodeId!=="string"||
         !/^[0-9a-f]{32}$/.test(fields.nodeId)||
         fields.nodeId===id||
         typeof fields.nonce!=="string"||
         !/^[0-9a-f]{32}$/.test(fields.nonce)||
         !equal(mac,auth(key,fields))){
        reject(ctx,"shared genesis, vertex or credential mismatch");return;
      }
      if([...sockets].some(p=>p!==ctx&&p.authenticated&&p.vertex===fields.vertex)){
        reject(ctx,"duplicate vertex connection");return;
      }
      ctx.authenticated=true;ctx.vertex=fields.vertex;
      ctx.nodeId=fields.nodeId;
      if(ctx.direction==="incoming")stats.inbound++;else stats.outbound++;
      const done=ctx.pendingResolve;
      if(done){ctx.pendingResolve=null;ctx.pendingReject=null;done({
        vertex:fields.vertex,direction:ctx.direction
      });}
      emit("CONNECTED",{peer:ctx.vertex});
      send(ctx,head());return;
    }
    if(msg.type==="TIP"){
      if(msg.protocol!==BATON_V3.protocol||
         !Number.isSafeInteger(msg.height)||msg.height<0||
         typeof msg.hash!=="string"||!/^[a-f0-9]{64}$/.test(msg.hash)||
         typeof msg.work!=="string"||!/^\d{1,100}$/.test(msg.work)){
        reject(ctx,"bad TIP");return;
      }
      if(BigInt(msg.work)>state.cumulativeWork&&!ctx.requesting){
        ctx.requesting=true;
        send(ctx,{type:"GET_CHAIN",protocol:BATON_V3.protocol});
      }
    }else if(msg.type==="GET_CHAIN"){
      if(msg.protocol!==BATON_V3.protocol){reject(ctx,"bad chain request");return;}
      try{send(ctx,{type:"CHAIN",protocol:BATON_V3.protocol,blocks:state.chain});}
      catch(e){emit("SYNC_UNAVAILABLE",{error:String(e.message)});}
    }else if(msg.type==="CHAIN"){
      ctx.requesting=false;
      if(msg.protocol!==BATON_V3.protocol||!Array.isArray(msg.blocks)){
        reject(ctx,"invalid shared chain");return;
      }
      try{
        // IMPORTANT: replay enforces every relay/vertex/parent route, PoW,
        // UTXO, difficulty, supply and the ONE shared genesis.
        const selected=chooseBatonChain(state.chain,msg.blocks);
        stats.synchronizations++;
        if(selected.selected==="candidate"){
          const next=replayBatonChain(msg.blocks);
          const added=Math.max(0,next.height-state.height);
          state=next;stats.adoptedBlocks+=added;
          emit("SYNCED",{height:state.height,hash:state.hash});
          broadcast(head(),ctx);
        }
      }catch(e){reject(ctx,"invalid routed chain: "+String(e.message||e));}
    }else if(msg.type==="PING"){
      send(ctx,{type:"PONG"});
    }else if(msg.type!=="PONG"){
      reject(ctx,"unsupported P2P command");
    }
  }
  function attach(socket,direction){
    if(sockets.size>=MAX_PEERS){socket.destroy();return null;}
    socket.setNoDelay(true);
    socket.setTimeout(30000,()=>socket.destroy());
    const ctx={socket,direction,authenticated:false,vertex:null,
      nodeId:null,buffer:"",requesting:false,rejected:false,
      window:Date.now(),count:0,pendingResolve:null,pendingReject:null};
    sockets.add(ctx);
    socket.on("data",data=>{
      ctx.buffer+=data.toString("utf8");
      if(Buffer.byteLength(ctx.buffer)>MAX_FRAME){
        reject(ctx,"max frame length exceeded");return;
      }
      let n;
      while((n=ctx.buffer.indexOf("\n"))>=0){
        const line=ctx.buffer.slice(0,n);
        ctx.buffer=ctx.buffer.slice(n+1);
        try{receive(ctx,JSON.parse(line));}
        catch(e){reject(ctx,String(e.message||e));}
        if(socket.destroyed)return;
      }
    });
    socket.on("error",e=>{
      if(ctx.pendingReject){const bad=ctx.pendingReject;
        ctx.pendingReject=null;ctx.pendingResolve=null;bad(e);}
    });
    socket.on("close",()=>{
      sockets.delete(ctx);
      if(ctx.pendingReject){const bad=ctx.pendingReject;
        ctx.pendingReject=null;ctx.pendingResolve=null;
        bad(Error("P2P connection closed before authentication"));}
      emit("CLOSED",{peer:ctx.vertex});
    });
    return ctx;
  }
  return {
    vertex,id,genesis,
    get state(){return state;},
    get stats(){return {...stats,
      authenticatedPeers:[...sockets].filter(x=>x.authenticated).length};},
    get peers(){return [...sockets].filter(x=>x.authenticated)
      .map(x=>({vertex:x.vertex,direction:x.direction}));},
    async listen(){
      check(!server&&!stopped,"already listening or closed");
      server=net.createServer(socket=>{
        const ctx=attach(socket,"inbound");if(ctx)hello(ctx);
      });
      try{
        await new Promise((resolve,reject)=>{
          server.once("error",reject);
          server.listen({host,port},()=>{
            server.off("error",reject);resolve();
          });
        });
      }catch(e){server=null;throw e;}
      return {host,port:server.address().port,genesisHash:genesis.hash};
    },
    async connect(targetPort){
      check(server?.listening&&!stopped&&Number.isSafeInteger(targetPort)&&
        targetPort>=1&&targetPort<=65535,"invalid local target port");
      const socket=net.createConnection({host,port:targetPort});
      const ctx=attach(socket,"outbound");
      check(ctx,"too many peers");
      return new Promise((resolve,rejectPromise)=>{
        let timer=setTimeout(()=>{
          timer=null;ctx.pendingResolve=null;ctx.pendingReject=null;
          reject(ctx,"handshake timeout");
          rejectPromise(Error("SPK BATON: handshake timeout"));
        },5000);
        ctx.pendingResolve=value=>{
          if(timer)clearTimeout(timer);
          resolve(value);
        };
        ctx.pendingReject=error=>{
          if(timer)clearTimeout(timer);
          rejectPromise(error);
        };
        socket.once("connect",()=>hello(ctx));
      });
    },
    commitMinedBlock(block){
      check(!stopped,"node closed");
      const route=expectedRoute(state);
      check(route.triangleVertex===vertex,
        "this vertex is not scheduled to generate the next block");
      const next=acceptBatonBlock(state,block);
      state=next;
      broadcast(head());
      emit("MINED",{height:state.height,relayId:route.relayId,hash:state.hash});
      return {height:state.height,relayId:route.relayId,
        producer:vertex,hash:state.hash,work:state.cumulativeWork.toString()};
    },
    announce(){broadcast(head());},
    async close(){
      if(stopped)return;stopped=true;
      for(const peer of sockets)peer.socket.destroy();
      if(server?.listening)await new Promise(done=>server.close(()=>done()));
    }
  };
}
