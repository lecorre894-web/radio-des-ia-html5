import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {isPollinationsCreditRefusal,chatWithPollinations} from "../tchat-pollinations.mjs";

const screenshotReply="The account behind this API key doesn't have enough credits. "+
  "This model needs paid Pollen. Please [top up] (<https://enter.pollinations.ai/top-up>), then try again.";
const response=(payload,status=200)=>({
  ok:status>=200&&status<300,status,
  async text(){return JSON.stringify(payload);}
});

test("Le refus exact visible dans la capture est reconnu comme erreur fournisseur",()=>{
  assert.equal(isPollinationsCreditRefusal(screenshotReply),true);
  assert.equal(isPollinationsCreditRefusal("This model needs paid Pollen. Please top up."),true);
  assert.equal(isPollinationsCreditRefusal("Not enough credits available."),true);
  assert.equal(isPollinationsCreditRefusal("La Lune possède des cratères et des mers basaltiques."),false);
  assert.equal(isPollinationsCreditRefusal("Analyse le message : The account behind this API key doesn't have enough credits"),false);
});

test("Une réponse HTTP 200 qui ne contient qu'un refus de crédit n'est pas une réponse scientifique",async()=>{
  let calls=0;
  await assert.rejects(chatWithPollinations({
    model:"anthropic/claude-fable-5.2",
    token:"sk_dummy12345",
    messages:[{role:"user",content:"La Lune"}],
    fetcher:async(url,options)=>{
      calls++;
      assert.equal(options.method,"POST");
      assert.equal(options.headers.Authorization,"Bearer sk_dummy12345");
      return response({model:"anthropic/claude-fable-5.2",choices:[{message:{content:screenshotReply}}]});
    }
  }),e=>{
    assert.equal(e.code,"POLLINATIONS_CREDITS");
    assert.match(e.message,/crédits Pollen insuffisants/);
    return true;
  });
  assert.equal(calls,1);
});

test("Une erreur HTTP 402 de paiement est classée séparément sans relance automatique",async()=>{
  let calls=0;
  await assert.rejects(chatWithPollinations({
    model:"some-model",token:"sk_dummy12345",
    messages:[{role:"user",content:"Bonjour"}],
    fetcher:async()=>{calls++;return response({error:{message:"Payment required"}},402);}
  }),e=>e.code==="POLLINATIONS_CREDITS");
  assert.equal(calls,1);
});

test("Une vraie réponse scientifique reste inchangée",async()=>{
  const result=await chatWithPollinations({
    model:"test-model",token:"sk_dummy12345",
    messages:[{role:"user",content:"Lune"}],
    fetcher:async()=>response({model:"test-model",choices:[{message:{content:"La Lune est en rotation synchrone."}}]})
  });
  assert.equal(result.text,"La Lune est en rotation synchrone.");
});

test("Le Salon rend les anciens refus visibles comme erreurs et préserve la dernière question",()=>{
  const html=readFileSync(new URL("../tchat.html",import.meta.url),"utf8");
  const script=readFileSync(new URL("../tchat-distant.mjs",import.meta.url),"utf8");
  assert.match(html,/id="passerHorde"/);
  assert.match(script,/isPollinationsCreditRefusal\(m\.texte\)/);
  assert.match(script,/lastPollinationsCreditRefusal\(\)/);
  assert.match(script,/last\.erreurCode==="POLLINATIONS_CREDITS"/);
  assert.match(script,/origin:"error",nom:"Pollinations · erreur de crédits"/);
  assert.match(script,/function switchToHorde\(\)/);
  assert.match(script,/\$\("passerHorde"\)\.addEventListener\("click",switchToHorde\)/);
  assert.match(script,/if\(!hordeModels\.length\)void refreshHordeModels\(\)/);
  assert.match(script,/function retryLastHuman\(\)/);
  // Ne jamais transférer la question à AI Horde juste en changeant de fournisseur.
  const code=script.slice(script.indexOf("function switchToHorde()"),script.indexOf("function retryLastHuman()"));
  assert.doesNotMatch(code,/nextTour\(|chatWithHorde\(|nextHordeTurn\(/);
});
