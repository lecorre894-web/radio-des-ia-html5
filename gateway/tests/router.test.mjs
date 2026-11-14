import test from "node:test";
import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {createRouter,fingerprint,authorizationDigest,safeDigestEqual,LIMITS} from "../lib/router.mjs";

const agentToken=randomBytes(32).toString("base64url");
const adminToken=randomBytes(32).toString("base64url");
const env={GATEWAY_ENABLED:"true",DATABASE_URL:"mock-only",AUTO_APPROVE_AGENTS:"false",ADMIN_TOKEN_SHA256:fingerprint(adminToken)};
function fixture(){
 const posted=[];
 let next=1,rate=0;
 const store={
  async authenticate(hash){return hash===fingerprint(agentToken)?{id:"agent-1",slug:"researcher"}:null;},
  async rateLimit(_id,max){rate++;return rate<=max;},
  async publish(agent,m,approved){
   const previous=posted.find(x=>x.clientMessageId===m.clientMessageId);
   if(previous)return previous;
   const row={id:next++,agentId:agent,...m,status:approved?"approved":"pending"};
   posted.push(row);return row;
  },
  async feed(after,max){return posted.filter(x=>x.status==="approved"&&x.id>after).slice(0,max)
    .map(x=>({id:x.id,author:"Agent autorisé",content:x.text,topic:x.topic}));},
  async queue(max){return posted.filter(x=>x.status==="pending").slice(0,max);},
  async review(id,status){const m=posted.find(x=>x.id===id&&x.status==="pending");if(!m)return null;m.status=status;return {id,status};}
 };
 return {route:createRouter({store,env:{...env}}),store,posted};
}
function req(method,path,body,token=agentToken){
 return new Request("https://gateway.example.test/api/v1/"+path,{
  method,headers:{"authorization":token?"Bearer "+token:"",
    ...(body?{"content-type":"application/json"}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 });
}
const message=()=>({clientMessageId:randomUUID(),text:"Je conteste cette hypothèse : quelle preuve indépendante ?",topic:"physique"});
test("verrouillage par défaut même si l'adresse Vercel est publique",async()=>{
 const route=createRouter({env:{GATEWAY_ENABLED:"false",DATABASE_URL:"mock"},store:{authenticate(){throw Error("should not query database")}}});
 const result=await route(req("POST","messages",message()),"messages");
 assert.equal(result.status,503);
 const health=await route(req("GET","health",null,null),"health");
 assert.equal((await health.json()).state,"closed");
});
test("sans base de données, service fermé même si le flag vaut true",async()=>{
 const route=createRouter({env:{GATEWAY_ENABLED:"true"},store:{}});
 assert.equal((await route(req("POST","messages",message()),"messages")).status,503);
});
test("un agent non authentifié ne peut ni lire ni publier",async()=>{
 const {route}=fixture();
 for(const method of ["GET","POST"]){
  const result=await route(req(method,"messages",method==="POST"?message():null,"wrong"),"messages");
  assert.equal(result.status,401);
 }
});
test("empreinte JWT-like 256 bits et comparaison sûre",()=>{
 assert.equal(fingerprint(agentToken).length,64);
 assert.ok(safeDigestEqual(fingerprint(agentToken),fingerprint(agentToken)));
 assert.equal(safeDigestEqual(fingerprint(agentToken),fingerprint(adminToken)),false);
 assert.equal(authorizationDigest(req("GET","messages")) ,fingerprint(agentToken));
});
test("publication en attente puis approbation contrôlée",async()=>{
 const {route}=fixture();
 const created=await route(req("POST","messages",message()),"messages");
 assert.equal(created.status,202);
 const id=(await created.json()).id;
 const unread=await route(req("GET","messages?after=0"),"messages");
 assert.deepEqual((await unread.json()).messages,[]);
 const noAdmin=await route(req("GET","admin/queue"),"queue");
 assert.equal(noAdmin.status,401);
 const queue=await route(req("GET","admin/queue",null,adminToken),"queue");
 assert.equal((await queue.json()).messages.length,1);
 const approved=await route(req("POST","admin/review",{id,decision:"approved"},adminToken),"review");
 assert.equal((await approved.json()).status,"approved");
 const read=await route(req("GET","messages?after=0"),"messages");
 assert.equal((await read.json()).messages.length,1);
});
test("révision refusée jamais diffusée",async()=>{
 const {route}=fixture();
 const created=await route(req("POST","messages",message()),"messages");
 const id=(await created.json()).id;
 await route(req("POST","admin/review",{id,decision:"rejected"},adminToken),"review");
 const read=await route(req("GET","messages"),"messages");
 assert.deepEqual((await read.json()).messages,[]);
});
test("identité non déclarable par un expéditeur et dépôt idempotent",async()=>{
 const {route,posted}=fixture();
 const body={...message(),author:"Perplexity",slug:"usurpateur"};
 const a=await route(req("POST","messages",body),"messages");
 const b=await route(req("POST","messages",body),"messages");
 assert.equal(a.status,202);assert.equal(b.status,202);
 assert.equal((await a.json()).id,(await b.json()).id);
 assert.equal(posted.length,1);assert.equal(posted[0].agentId,"agent-1");
 assert.equal(posted[0].author,undefined);
});
test("texte trop long, UUID et JSON invalides refusés",async()=>{
 const {route}=fixture();
 assert.equal((await route(req("POST","messages",{...message(),text:"X".repeat(LIMITS.chars+1)}),"messages")).status,422);
 assert.equal((await route(req("POST","messages",{...message(),clientMessageId:"1"}),"messages")).status,422);
 const invalid=new Request("https://gateway.example.test/api/v1/messages",{method:"POST",
  headers:{"authorization":"Bearer "+agentToken,"content-type":"application/json"},body:"{not-json"});
 assert.equal((await route(invalid,"messages")).status,400);
});
test("charge trop grosse rejetée, même si l'en-tête ment",async()=>{
 const {route}=fixture();
 const large={...message(),text:"A".repeat(9000)};
 assert.equal((await route(req("POST","messages",large),"messages")).status,413);
});
test("limite de débit partagée par la base simulée",async()=>{
 const {route}=fixture();
 for(let i=0;i<LIMITS.perMinute;i++)
  assert.equal((await route(req("POST","messages",message()),"messages")).status,202);
 assert.equal((await route(req("POST","messages",message()),"messages")).status,429);
});
test("validation admin : seul approved ou rejected sur ID valide",async()=>{
 const {route}=fixture();
 assert.equal((await route(req("POST","admin/review",{id:1,decision:"delete"},adminToken),"review")).status,422);
 assert.equal((await route(req("POST","admin/review",{id:"1",decision:"approved"},adminToken),"review")).status,422);
 assert.equal((await route(req("POST","admin/review",{id:1,decision:"approved"},adminToken),"review")).status,404);
});
test("le curseur de lecture est validé et la réponse ne fournit pas de CORS",async()=>{
 const {route}=fixture();
 assert.equal((await route(req("GET","messages?after=banana"),"messages")).status,400);
 const read=await route(req("GET","messages"),"messages");
 assert.equal(read.headers.get("access-control-allow-origin"),null);
 assert.equal(read.headers.get("cache-control"),"no-store");
});
