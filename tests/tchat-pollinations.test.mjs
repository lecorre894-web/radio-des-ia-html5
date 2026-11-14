import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {webcrypto} from "node:crypto";
import {
  POLLINATIONS_BASE,POLLINATIONS_CALLBACK,POLLINATIONS_PENDING,POLLINATIONS_ACCESS,
  normalizePollinationsModels,buildPollinationsMessages,createPollinationsAuthorization,
  exchangePollinationsCode,listPollinationsModels,chatWithPollinations
} from "../tchat-pollinations.mjs";

const makeResponse=(data,ok=true,status=200)=>({
  ok,status,async text(){return JSON.stringify(data);}
});
test("Le catalogue est réellement fourni par Pollinations, jamais inventé",()=>{
  const list=normalizePollinationsModels([
    {id:"publisher/a",name:"A",publisher:"Publisher"},
    {id:"publisher/b",name:"B",publisher:"Publisher"},
    {id:"publisher/a"},{id:""}
  ]);
  assert.deepEqual(list.map(m=>m.id),["publisher/a","publisher/b"]);
  assert.equal(list[0].publisher,"Publisher");
});
test("Hors consentement, ni anciens messages ni pièces personnelles ne sont transmis",()=>{
  const history=[
    {origin:"human",texte:"Secret historique à ne pas envoyer"},
    {origin:"ai",nom:"Kimi",texte:"Analyse ancienne"},
    {origin:"human",texte:"Quelle est la période sidérale de la Lune ?"}
  ];
  const messages=buildPollinationsMessages({history,topic:"Lune",includeHistory:false});
  const text=JSON.stringify(messages);
  assert.equal(messages.length,2);
  assert.ok(text.includes("période sidérale"));
  assert.ok(!text.includes("Secret historique"));
  assert.ok(!text.includes("Analyse ancienne"));
  assert.ok(text.includes("MESURÉ"));
  const shared=buildPollinationsMessages({history,includeHistory:true});
  assert.ok(JSON.stringify(shared).includes("Secret historique"));
  assert.equal(shared.filter(m=>m.role==="assistant").length,0);
});
test("OAuth PKCE : état imprévisible et URL sans clé secrète",async()=>{
  const out=await createPollinationsAuthorization({clientId:"pk_example12345",cryptoRef:webcrypto});
  const url=new URL(out.url);
  assert.equal(url.searchParams.get("response_type"),"code");
  assert.equal(url.searchParams.get("code_challenge_method"),"S256");
  assert.equal(url.searchParams.get("redirect_uri"),POLLINATIONS_CALLBACK);
  assert.equal(url.searchParams.get("budget"),"1");
  assert.equal(url.searchParams.get("expiry"),"1");
  assert.ok(out.pending.verifier.length>40);
  assert.ok(out.pending.state.length>40);
  assert.ok(!out.url.includes("sk_"));
  await assert.rejects(createPollinationsAuthorization({clientId:"sk_private",cryptoRef:webcrypto}),/pk_/);
});
test("Token OAuth : vérifie state et PKCE, jamais d'échange si CSRF invalide",async()=>{
  const out=await createPollinationsAuthorization({clientId:"pk_example12345",cryptoRef:webcrypto});
  let fetchCalls=0;
  await assert.rejects(exchangePollinationsCode({
    code:"short-code",state:"wrong",pending:out.pending,
    fetcher:async()=>{fetchCalls++;return makeResponse({access_token:"sk_ok"});}
  }),/CSRF/);
  assert.equal(fetchCalls,0);
  const token=await exchangePollinationsCode({
    code:"short-code",state:out.pending.state,pending:out.pending,
    now:out.pending.createdAt,
    fetcher:async(url,options)=>{
      fetchCalls++;
      assert.match(url,/oauth\/token$/);
      assert.equal(options.body.get("code_verifier"),out.pending.verifier);
      assert.equal(options.body.get("client_id"),out.pending.clientId);
      assert.equal(options.body.get("redirect_uri"),POLLINATIONS_CALLBACK);
      return makeResponse({access_token:"sk_scoped45678"});
    }
  });
  assert.equal(token,"sk_scoped45678");
  assert.equal(fetchCalls,1);
});
test("GET public et génération REST authentifiée : aucun jeton en URL",async()=>{
  const catalog=await listPollinationsModels({fetcher:async(url,opts)=>{
    assert.equal(url,POLLINATIONS_BASE+"/text/models");
    assert.equal(opts.method,"GET");
    assert.equal(opts.headers,undefined);
    return makeResponse([{id:"publisher/real-model"}]);
  }});
  assert.equal(catalog.length,1);
  const data=await chatWithPollinations({
    model:catalog[0].id,token:"sk_test12345",
    messages:[{role:"user",content:"La Lune"}],maxTokens:2000,
    fetcher:async(url,opts)=>{
      assert.equal(url,POLLINATIONS_BASE+"/v1/chat/completions");
      assert.equal(opts.headers.Authorization,"Bearer sk_test12345");
      const body=JSON.parse(opts.body);
      assert.equal(body.model,catalog[0].id);
      assert.ok(body.max_tokens<=600);
      assert.equal(body.stream,false);
      return makeResponse({model:catalog[0].id,choices:[{message:{content:"La période sidérale est 27,3 jours environ."}}]});
    }
  });
  assert.equal(data.model,catalog[0].id);
  assert.match(data.text,/sidérale/);
});
test("Sans jeton valide aucun appel n'est tenté",async()=>{
  let called=0;
  await assert.rejects(chatWithPollinations({
    model:"publisher/a",token:"pk_public",
    messages:[{role:"user",content:"x"}],
    fetcher:async()=>{called++;return makeResponse({});}
  }),/Connexion Pollinations/);
  assert.equal(called,0);
});
test("La Radio historique et ses cinq modèles restent présents",()=>{
  const html=readFileSync(new URL("../tchat.html",import.meta.url),"utf8");
  const script=readFileSync(new URL("../tchat-distant.mjs",import.meta.url),"utf8");
  for(const id of ["moteurDialogue","pollinationsControls","pollinationsAppKey","pollinationsConnecter",
    "pollinationsDeconnecter","pollinationsActualiser","pollinationsModele",
    "pollinationsPartagerContexte","pollinationsEtat","hordeControls","modeleRecherche","fil","parler"]){
    assert.ok(html.includes('id="'+id+'"'),id);
  }
  for(const engine of ["puter","research-local","horde","pollinations"])
    assert.ok(html.includes('value="'+engine+'"'));
  for(const person of ["Cairn","Brume","Aurore","PERPLEXITY","KIMI"])
    assert.ok(script.includes(person));
  assert.match(script,/if\(isPollinationsMode\(\)\)return nextPollinationsTurn\(\)/);
  assert.match(script,/window\.puter\.ai\.chat\(/);
  assert.match(html,/ChatGPT et René Le Corre®/);
  assert.ok(script.includes("POLLINATIONS_ACCESS"));
  assert.ok(script.includes("sessionStorage.setItem(POLLINATIONS_ACCESS"));
  assert.ok(!script.includes("localStorage.setItem(POLLINATIONS_ACCESS"));
  assert.ok(POLLINATIONS_PENDING.includes("pkce"));
});
