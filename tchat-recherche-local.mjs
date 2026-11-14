/**
 * Moteur WebLLM séparé de Puter, chargé UNIQUEMENT après consentement via bouton.
 * Pas d'API payante, pas de fausse capacité doctorale, pas de fallback vers un petit modèle.
 */
import {researchModelConfig} from "./tchat-recherche-core.mjs";

export async function loadResearchEngine({modelId,onProgress=()=>{}}={}) {
  if(!globalThis.navigator?.gpu?.requestAdapter)
    throw Error("Ce navigateur ne prend pas en charge WebGPU.");
  const adapter=await navigator.gpu.requestAdapter();
  if(!adapter) throw Error("Aucun adaptateur WebGPU compatible.");
  // Bibliothèque externe seulement à l'activation, le Salon Puter n'en dépend pas.
  onProgress("Chargement de la bibliothèque WebLLM…");
  const webllm=await import("https://esm.run/@mlc-ai/web-llm@0.2.88");
  if(!researchModelConfig(webllm.prebuiltAppConfig?.model_list,modelId,[...adapter.features]))
    throw Error("Modèle de recherche indisponible ou fonctionnalités GPU manquantes.");
  onProgress("Téléchargement du modèle "+modelId+" (plusieurs Go possibles)…");
  const engine=await webllm.CreateMLCEngine(modelId,{
    initProgressCallback:info=>{
      const n=Number(info?.progress);
      onProgress(String(info?.text||"Initialisation…")+
        (Number.isFinite(n)?" "+Math.round(n*100)+" %":""));
    }
  });
  return {
    modelId,
    async complete(messages,maxTokens=600) {
      const result=await engine.chat.completions.create({
        messages, stream:false, temperature:0.2,
        max_tokens:Math.min(1200,Math.max(250,Number(maxTokens)||600))
      });
      return String(result?.choices?.[0]?.message?.content||"").trim();
    },
    interrupt(){try{engine.interruptGenerate?.();}catch{}},
    async unload(){try{await engine.unload?.();}catch{}}
  };
}
