import {createHordeClient} from "./horde-client.mjs";
const $=id=>document.getElementById(id);
const api=createHordeClient();
let controller=null,models=[];
function report(text){$("progress").textContent=text;}
function refresh(){
 $("send").disabled=Boolean(controller)||!models.length||!$("consent").checked;
 $("cancel").disabled=!controller;
 $("discover").disabled=Boolean(controller);
 $("model").disabled=Boolean(controller)||!models.length;
}
$("discover").addEventListener("click",async()=>{
 $("discover").disabled=true;$("modelsState").textContent="Interrogation du réseau…";
 try{
  models=await api.models();
  const sel=$("model");
  sel.replaceChildren();
  if(models.length){
   for(const model of models){
    const option=document.createElement("option");
    option.value=model.name;
    option.textContent=model.name+" · "+model.workers+" worker(s)";
    sel.append(option);
   }
   $("modelsState").textContent=models.length+" modèles servis par des workers actifs.";
   report("Catalogue chargé. Un seul appel sera effectué après ton accord.");
  }else{
   $("modelsState").textContent="Aucun modèle textuel actif signalé actuellement.";
   report("Réessayer plus tard. Aucun appel de génération effectué.");
  }
 }catch(error){
  models=[];$("model").replaceChildren();
  $("modelsState").textContent="Catalogue indisponible.";
  report(String(error?.message||error));
 }finally{$("discover").disabled=false;refresh();}
});
$("consent").addEventListener("change",refresh);
$("send").addEventListener("click",async()=>{
 if(controller)return;
 const prompt=$("prompt").value.trim();
 const model=$("model").value;
 if(!models.some(x=>x.name===model)){report("Modèle non confirmé : actualiser le catalogue.");return;}
 if(!$("consent").checked){report("Consentement nécessaire.");return;}
 if(!prompt){report("Saisis d'abord une question.");return;}
 if(!window.confirm("Envoyer cette question à un worker communautaire AI Horde ? Aucune donnée de ta Radio principale n'est transmise."))return;
 controller=new AbortController();refresh();
 $("answer").textContent="En attente de la réponse du modèle…";
 $("provenance").textContent="";
 try{
  const result=await api.generate({
   prompt,model,maxLength:Number($("length").value),signal:controller.signal,
   onStatus:info=>{
    if(info.phase==="queued")report("Requête acceptée. Identifiant : "+info.id.slice(0,8)+"…");
    else report("File d'attente : "+(info.queuePosition||"?")+
      " · en cours : "+info.processing+" · tentative "+info.attempt+"/28");
   }
  });
  $("answer").textContent=result.text;
  $("provenance").textContent="Modèle déclaré : "+result.model+" · Worker : "+result.worker+
    ". Le nom d'un modèle n'atteste pas une identité commerciale particulière.";
  report("Réponse reçue. Fin du test : aucun appel automatique suivant.");
 }catch(error){
  $("answer").textContent="Aucune réponse exploitable.";
  report(String(error?.message||error));
 }finally{
  controller=null;refresh();
 }
});
$("cancel").addEventListener("click",()=>{
 if(!controller)return;
 controller.abort();
 report("Arrêt demandé ; annulation de la tâche distante tentée.");
});
refresh();
