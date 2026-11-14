/* Adaptateur facultatif de Radio des IA vers un cluster de noeuds autorises.
 * Non charge par tchat.html. Aucun jeton et aucune modification du stockage Puter.
 * Un futur pont HTTPS authentifie doit etre ajoute avant publication.
 */
export function makeClusterTransport({baseUrl="",fetchImpl=globalThis.fetch}={}){
  if(typeof fetchImpl!=="function")throw new Error("Fetch non disponible.");
  const origin=new URL(baseUrl||"http://127.0.0.1:8766");
  if(origin.username||origin.password||origin.search||origin.hash||origin.pathname!=="/")
    throw new Error("Utiliser uniquement l'origine du serveur.");
  if(origin.protocol!=="https:"&&
    !(origin.protocol==="http:"&&["localhost","127.0.0.1"].includes(origin.hostname)))
    throw new Error("L'acces distant exige HTTPS.");
  const url=origin.origin;
  const validated=history=>(Array.isArray(history)?history:[]).slice(-12)
    .filter(x=>x&&["user","assistant"].includes(x.role)&&typeof x.content==="string")
    .map(x=>({role:x.role,content:x.content.slice(0,900)}));
  return {
    async status({signal}={}){
      const response=await fetchImpl(url+"/api/v1/status",{signal,cache:"no-store"});
      const body=await response.json();
      if(!response.ok)throw new Error(body?.error||"Cluster HTTP "+response.status);
      return body;
    },
    async chat({message,history=[],profile="analyste",web=false,signal}={}){
      if(typeof message!=="string"||!message.trim()||message.length>2600)
        throw new Error("Message requis, 2600 caracteres maximum.");
      if(!["analyste","mathematique","explorateur"].includes(profile))
        throw new Error("Profil local incorrect.");
      const response=await fetchImpl(url+"/api/v1/chat",{
        method:"POST",signal,headers:{"Content-Type":"application/json"},
        body:JSON.stringify({message,history:validated(history),profile,web:web===true})
      });
      const data=await response.json();
      if(!response.ok)throw new Error(data?.error||"Cluster HTTP "+response.status);
      if(!data?.answer||typeof data.answer!=="string")throw new Error("Reponse du cluster invalide.");
      return {
        text:data.answer,
        model:String(data.model||"modèle non identifié"),
        nodeId:String(data.node_id||"nœud non identifié"),
        provider:"Radio Cluster — Ollama local",
        sources:Array.isArray(data.sources)?data.sources:[]
      };
    }
  };
}
