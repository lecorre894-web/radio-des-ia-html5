/* Console du cluster : aucun stockage de la Radio et aucun jeton dans le navigateur. */
const $=id=>document.getElementById(id);
const turns=[];
let working=false;
function phrase(text){$("progress").textContent=text;}
function drawNode(node){
 const article=document.createElement("article");article.className="turn "+(node.ready?"assistant":"user");
 const name=document.createElement("div");name.className="who";name.textContent=node.id+" · "+node.model;
 const body=document.createElement("div");body.className="body";
 body.textContent=(node.ready&&!node.cooldown?"✓ disponible":"✕ indisponible")+
  " · "+node.active+"/"+node.configured_slots+" slots occupés"+
  " · "+node.completed+" requêtes réussies · "+node.failures+" échecs";
 article.append(name,body);return article;
}
function metricsText(status){
 const n=status;
 return "Nœuds en ligne : "+n.online_nodes+"/"+n.registered_nodes+
  " · Slots utilisables : "+n.usable_slots+
  " · Libres : "+n.free_slots+
  " · Calculs en cours : "+n.running_jobs+
  " · Réponses terminées : "+n.completed_jobs;
}
async function refresh(){
 $("refresh").disabled=true;
 try{
  const response=await fetch("/api/v1/status",{cache:"no-store"});
  const json=await response.json();
  if(!response.ok)throw Error(json.error||"Status HTTP "+response.status);
  $("metrics").textContent=metricsText(json);
  const nodeBox=$("nodes");nodeBox.replaceChildren();
  for(const node of json.nodes||[])nodeBox.append(drawNode(node));
  $("condition").textContent=json.online_nodes?
    "✓ "+json.online_nodes+" nœud(s) réel(s) détecté(s). Accès public désactivé.":
    "Aucun modèle prêt ; vérifie Ollama et les machines enregistrées.";
 }catch(error){$("condition").textContent="Cluster indisponible : "+String(error?.message||error);}
 finally{$("refresh").disabled=false;}
}
function add(role,text,label){
 const node=document.createElement("article");node.className="turn "+role;
 const title=document.createElement("div");title.className="who";title.textContent=label;
 const body=document.createElement("div");body.className="body";body.textContent=text;
 node.append(title,body);
 const box=$("transcript");if(!turns.length)box.replaceChildren();
 box.append(node);
}
$("refresh").addEventListener("click",refresh);
$("send").addEventListener("click",async()=>{
 if(working)return;
 const message=$("question").value.trim();
 if(!message)return phrase("Écris une question.");
 working=true;$("send").disabled=true;
 const start=Date.now();
 try{
  const response=await fetch("/api/v1/chat",{
   method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({message,profile:$("profile").value,
     history:turns.slice(-12),web:$("web").checked})
  });
  const data=await response.json();
  if(!response.ok)throw Error(data.error||"HTTP "+response.status);
  add("user",message,"Vous");
  add("assistant",data.answer, "Nœud "+data.node_id+" · "+data.model);
  turns.push({role:"user",content:message},{role:"assistant",content:data.answer});
  if(turns.length>12)turns.splice(0,turns.length-12);
  $("question").value="";
  phrase("Réponse reçue en "+Math.round((Date.now()-start)/1000)+" s. Aucun appel en boucle.");
  void refresh();
 }catch(error){phrase("Pas de réponse : "+String(error?.message||error)+". Aucun message effacé.");}
 finally{working=false;$("send").disabled=false;}
});
$("clear").addEventListener("click",()=>{
 if(working)return;
 if(turns.length&&!confirm("Vider uniquement cette console locale ?"))return;
 turns.splice(0);$("transcript").replaceChildren();
 const p=document.createElement("p");p.className="hint";
 p.textContent="Conversation locale effacée. Les échanges de Radio des IA restent intacts.";
 $("transcript").append(p);
 phrase("Console locale réinitialisée.");
});
refresh();
