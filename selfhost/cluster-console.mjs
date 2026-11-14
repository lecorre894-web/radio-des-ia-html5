/* Console du cluster : aucun stockage de la Radio et aucun jeton dans le navigateur. */
const $=id=>document.getElementById(id);
const turns=[];
let working=false;
function phrase(text){$("progress").textContent=text;}
function drawNode(node){
 const article=document.createElement("article");article.className="turn "+(node.ready?"assistant":"user");
 const name=document.createElement("div");name.className="who";name.textContent=node.id+" · "+node.model;
 const body=document.createElement("div");body.className="body";
 const ram=Number.isFinite(node.ram_total_bytes_reported)?
    " · RAM OS : "+(node.ram_total_bytes_reported/1024**3).toFixed(1)+" Gio":" · RAM non mesurée";
 body.textContent=(node.ready&&!node.cooldown?"✓ disponible":"✕ indisponible")+
  " · "+(node.hardware_family_reported||"matériel non identifié")+
  " · "+(node.cpu_arch_reported||"architecture inconnue")+ram+
  " · "+node.active+"/"+node.configured_slots+" slots occupés"+
  " · "+node.completed+" requêtes réussies · "+node.failures+" échecs";
 article.append(name,body);return article;
}
function metricsText(status){
 const n=status;
 return "Nœuds en ligne : "+n.online_nodes+"/"+n.registered_nodes+
  " · RAM signalée par les nœuds (non mutualisée) : "+(n.reported_ram_gb_online_separate_pools??0)+" Gio"+
  " · Slots utilisables : "+n.usable_slots+
  " · Libres : "+n.free_slots+
  " · Calculs en cours : "+n.running_jobs+
  " · Réponses terminées : "+n.completed_jobs;
}
async function refreshPlan(){
 const target=$("planned");
 try{
  const response=await fetch("/api/v1/plan",{cache:"no-store"});
  const data=await response.json();
  if(!response.ok)throw Error(data.error||"HTTP "+response.status);
  if(data.mode!=="simulation_capacite_seulement"||data.online_nodes!==0||data.usable_slots!==0)
    throw Error("Plan non reconnu comme simulation.");
  const spark=data.spark,epyc=data.epyc;
  target.textContent=
    "SIMULATION — 0 serveur installé par ce plan\n"+
    "NVIDIA DGX Spark projetés : "+spark.planned_systems+
    " · RAM unifiée totale répartie : "+spark.planned_unified_memory_gb+" Gio"+
    " · conteneurs ARM projetés : "+spark.planned_virtual_containers+"\n"+
    "Serveurs AMD EPYC projetés : "+epyc.planned_systems+
    " · cœurs x86 maximum théoriques : "+epyc.planned_max_x86_cores_if_equipped+
    " · RAM DDR5 supposée : "+epyc.planned_ddr5_ram_gb+" Gio"+
    " · VM projetées : "+epyc.planned_virtual_machines+"\n"+
    "Total projeté réparti : "+data.aggregate_planned_memory_gb_not_shared+
    " Gio (72 Tio). Ce n'est PAS une mémoire commune.";
 }catch(error){target.textContent="Plan indisponible : "+String(error?.message||error);}
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
  const sourceBox=$("web-sources");
  sourceBox.replaceChildren();
  for(const source of (Array.isArray(data.sources)?data.sources.slice(0,8):[])){
    try{
      const uri=new URL(source.url);
      if(uri.protocol!=="https:")continue;
      const p=document.createElement("p"),link=document.createElement("a");
      link.href=uri.href;link.target="_blank";link.rel="noopener noreferrer";
      link.textContent=String(source.title||uri.hostname);
      const context=document.createElement("span");
      context.textContent=" — "+String(source.snippet||"").slice(0,380);
      p.append(link,context);sourceBox.append(p);
    }catch{}
  }
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
$("sparktiates-demo").addEventListener("click",async()=>{
 const btn=$("sparktiates-demo"),out=$("sparktiates-output");
 btn.disabled=true;out.textContent="Simulation déterministe en cours, aucun matériel sollicité…";
 try{
   const response=await fetch("/api/v1/sparktiates",{cache:"no-store"});
   const result=await response.json();
   if(!response.ok)throw Error(result.error||"HTTP "+response.status);
   if(result.identity!=="SPARKTIATES"||result.status!=="SIMULE_NON_MESURE"||
      result.provisioned_hardware!==false||result.real_models_executed!==0)
      throw Error("Rapport non reconnu comme simulation isolée.");
   const inf=result.simulated_jobs.inference,calc=result.simulated_jobs.compute;
   out.textContent=
    "SPARKTIATES — SIMULÉ / NON MESURÉ\n"+
    "Systèmes du scénario : "+result.configured_plan.spark+" Spark + "+
      result.configured_plan.epyc+" EPYC\n"+
    "Hôtes virtuels simulés : "+result.simulated_hosts+
      " ; machines physiques créées : "+result.physical_processors_created+"\n"+
    "Slots inférence hypothétiques : "+result.simulated_inference_slots+
    " ; slots calcul hypothétiques : "+result.simulated_compute_slots+"\n"+
    "Inférence : "+inf.completed+" tâches simulées terminées / "+inf.submitted+
    ", temps moyen d'attente simulé "+inf.mean_queue_wait_ms+" ms\n"+
    "CPU : "+calc.completed+" tâches simulées terminées / "+calc.submitted+
    ", temps moyen d'attente simulé "+calc.mean_queue_wait_ms+" ms\n"+
    "Temps total simulé : "+result.simulated_completion_time_ms+" ms\n"+
    "RAM partagée réelle : AUCUNE · Appels IA réels : "+result.real_models_executed+
    "\nAttention : ces temps ne sont PAS des benchmarks, ni des performances garanties.";
 }catch(error){out.textContent="Simulation indisponible : "+String(error?.message||error);}
 finally{btn.disabled=false;}
});
refresh();
void refreshPlan();
