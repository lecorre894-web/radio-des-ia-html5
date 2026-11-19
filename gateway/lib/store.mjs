let sqlClient;
async function db(){
 if(sqlClient)return sqlClient;
 if(!process.env.DATABASE_URL)throw Error("Database not configured");
 const {neon}=await import("@neondatabase/serverless");
 sqlClient=neon(process.env.DATABASE_URL);
 return sqlClient;
}
export const store={
 async authenticate(hash){
  const sql=await db();
  const rows=await sql.query("SELECT id,slug,display_name FROM radio_agents WHERE key_hash=$1 AND enabled=TRUE LIMIT 1",[hash]);
  return rows[0]||null;
 },
 async rateLimit(agentId,limit){
  const sql=await db();
  const rows=await sql.query(
   "INSERT INTO radio_rate(agent_id,bucket,hits) VALUES ($1,date_trunc('minute',now()),1) "+
   "ON CONFLICT(agent_id,bucket) DO UPDATE SET hits=radio_rate.hits+1 "+
   "WHERE radio_rate.hits<$2 RETURNING hits",[agentId,limit]);
  return rows.length>0;
 },
 async publish(agentId,m,auto){
  const sql=await db();
  const rows=await sql.query(
   "INSERT INTO radio_messages(agent_id,client_message_id,topic,content,status) "+
   "VALUES ($1,$2,$3,$4,$5) ON CONFLICT(agent_id,client_message_id) "+
   "DO UPDATE SET client_message_id=EXCLUDED.client_message_id RETURNING id,status",
   [agentId,m.clientMessageId,m.topic,m.text,auto?"approved":"pending"]);
  return {id:Number(rows[0].id),status:rows[0].status};
 },
 async feed(after,limit){
  const sql=await db();
  const rows=await sql.query(
   "SELECT m.id,a.slug,a.display_name AS author,m.topic,m.content,m.created_at "+
   "FROM radio_messages m JOIN radio_agents a ON a.id=m.agent_id "+
   "WHERE m.status='approved' AND m.id>$1 ORDER BY m.id ASC LIMIT $2",[after,limit]);
  return rows.map(r=>({...r,id:Number(r.id)}));
 },
 async queue(limit){
  const sql=await db();
  const rows=await sql.query(
   "SELECT m.id,a.slug,a.display_name AS author,m.topic,m.content,m.created_at "+
   "FROM radio_messages m JOIN radio_agents a ON a.id=m.agent_id "+
   "WHERE m.status='pending' ORDER BY m.id ASC LIMIT $1",[limit]);
  return rows.map(r=>({...r,id:Number(r.id)}));
 },
 async review(id,status){
  const sql=await db();
  const rows=await sql.query(
   "UPDATE radio_messages SET status=$2,reviewed_at=now() "+
   "WHERE id=$1 AND status='pending' RETURNING id,status",[id,status]);
  return rows[0]?{id:Number(rows[0].id),status:rows[0].status}:null;
 }
};
