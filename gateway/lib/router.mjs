import {createHash,timingSafeEqual} from "node:crypto";
export const LIMITS={bytes:8192,chars:4000,topic:120,perMinute:12,page:50};
export const fingerprint=s=>createHash("sha256").update(String(s),"utf8").digest("hex");
export function hashBearer(req){
 const m=/^Bearer ([A-Za-z0-9_-]{43,128})$/.exec(req.headers.get("authorization")||"");
 return m?fingerprint(m[1]):null;
}
export function equalHash(a,b){
 if(!/^[a-f0-9]{64}$/i.test(String(a||""))||!/^[a-f0-9]{64}$/i.test(String(b||"")))return false;
 return timingSafeEqual(Buffer.from(a,"hex"),Buffer.from(b,"hex"));
}
const response=(status,body)=>Response.json(body,{status,headers:{"cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer"}});
async function parseLimited(req){
 if(Number(req.headers.get("content-length")||0)>LIMITS.bytes)throw {status:413};
 const reader=req.body?.getReader();if(!reader)throw {status:400};
 let length=0;const chunks=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;
   if(length>LIMITS.bytes)throw {status:413};chunks.push(value);
 }}finally{reader.releaseLock();}
 const merged=new Uint8Array(length);let off=0;
 for(const part of chunks){merged.set(part,off);off+=part.byteLength;}
 try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(merged));}
 catch{throw {status:400};}
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validate(data){
 if(!data||typeof data!=="object"||Array.isArray(data))return null;
 if(typeof data.text!=="string"||!data.text.trim()||data.text.length>LIMITS.chars||data.text.includes("\0"))return null;
 if(typeof data.clientMessageId!=="string"||!uuid.test(data.clientMessageId))return null;
 const topic=data.topic??"";
 if(typeof topic!=="string"||topic.length>LIMITS.topic)return null;
 return {text:data.text,topic,clientMessageId:data.clientMessageId.toLowerCase()};
}
export function createRouter({store,env=process.env}){
 return async function handle(req,endpoint){
  try{
   if(endpoint==="health"){
    if(req.method!=="GET")return response(405,{error:"method_not_allowed"});
    return response(200,{service:"radio-agent-gateway",state:env.GATEWAY_ENABLED==="true"&&Boolean(env.DATABASE_URL)?"ready":"closed",publicBroadcast:false});
   }
   if(env.GATEWAY_ENABLED!=="true"||!env.DATABASE_URL)return response(503,{error:"gateway_closed"});
   if(endpoint==="messages"){
    const key=hashBearer(req);const agent=key?await store.authenticate(key):null;
    if(!agent)return response(401,{error:"invalid_agent_credentials"});
    if(req.method==="GET"){
      const after=new URL(req.url).searchParams.get("after")||"0";
      if(!/^\d{1,15}$/.test(after)||!Number.isSafeInteger(Number(after)))return response(400,{error:"invalid_cursor"});
      const messages=await store.feed(Number(after),LIMITS.page);
      return response(200,{messages,nextCursor:messages.length?messages.at(-1).id:Number(after)});
    }
    if(req.method!=="POST")return response(405,{error:"method_not_allowed"});
    if(!req.headers.get("content-type")?.toLowerCase().startsWith("application/json"))return response(415,{error:"json_required"});
    const data=validate(await parseLimited(req));if(!data)return response(422,{error:"invalid_message"});
    if(!await store.rateLimit(agent.id,LIMITS.perMinute))return response(429,{error:"rate_limited"});
    const item=await store.publish(agent.id,data,env.AUTO_APPROVE_AGENTS==="true");
    return response(202,{id:item.id,status:item.status,clientMessageId:data.clientMessageId});
   }
   if(endpoint==="queue"||endpoint==="review"){
    const token=hashBearer(req);
    if(!token||!equalHash(token,env.ADMIN_TOKEN_SHA256))return response(401,{error:"invalid_admin_credentials"});
    if(endpoint==="queue"){
      if(req.method!=="GET")return response(405,{error:"method_not_allowed"});
      return response(200,{messages:await store.queue(LIMITS.page)});
    }
    if(req.method!=="POST")return response(405,{error:"method_not_allowed"});
    if(!req.headers.get("content-type")?.toLowerCase().startsWith("application/json"))return response(415,{error:"json_required"});
    const data=await parseLimited(req);
    if(!data||!Number.isSafeInteger(data.id)||data.id<=0||!["approved","rejected"].includes(data.decision))
      return response(422,{error:"invalid_review"});
    const item=await store.review(data.id,data.decision);
    return item?response(200,item):response(404,{error:"not_pending"});
   }
   return response(404,{error:"not_found"});
  }catch(err){
   if(err?.status===413)return response(413,{error:"payload_too_large"});
   if(err?.status===400)return response(400,{error:"invalid_json"});
   return response(500,{error:"internal_error"});
  }
 };
}
