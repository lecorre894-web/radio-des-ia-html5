// Test réseau réel du réglage long AI Horde. Aucun contenu personnel.
const root="https://oai.aihorde.net/v1";
const model="lmstudio/Qwen3.5-9B";
const limit=1500;
const response=await fetch(root+"/chat/completions",{
  method:"POST",signal:AbortSignal.timeout(120000),
  headers:{"Authorization":"Bearer 0000000000","Content-Type":"application/json"},
  body:JSON.stringify({
    model,stream:false,max_tokens:limit,temperature:0.2,
    horde:{include_reasoning:false},
    messages:[
      {role:"system",content:"Réponds en français avec précision sur la physique lunaire."},
      {role:"user",content:"Rédige une explication structurée en au moins six paragraphes détaillés (environ 600 mots) de la libration lunaire : libration en longitude, en latitude, parallaxe diurne, orbite elliptique, rotation synchrone, et conséquences pour la cartographie. Inclue deux exemples chiffrés approximatifs et les limites. Termine par une conclusion complète."}
    ]
  })
});
const txt=await response.text();
if(!response.ok)throw Error("LIVE_HORDE_HTTP_"+response.status+" "+txt.slice(0,220));
const data=JSON.parse(txt);
const text=String(data?.choices?.[0]?.message?.content||"");
const finishReason=data?.choices?.[0]?.finish_reason??null;
if(!text.trim())throw Error("LIVE_HORDE_EMPTY_RESPONSE");
console.log("LIVE_HORDE_LONG",JSON.stringify({
  model:data.model??model,requestedMaxTokens:limit,
  responseCharacters:text.length,responseWords:text.trim().split(/\s+/).length,
  finishReason,usage:data.usage??null,
  startsWith:text.slice(0,200),endsWith:text.slice(-250)
}));
