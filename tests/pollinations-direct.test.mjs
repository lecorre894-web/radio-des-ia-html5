import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {webcrypto} from "node:crypto";
import {
  POLLINATIONS_CLIENT_ID,POLLINATIONS_CALLBACK,
  createPollinationsAuthorization,verifyPollinationsClient
} from "../tchat-pollinations.mjs";

const raw=readFileSync(new URL("../pollinations-client.json",import.meta.url),"utf8");
const metadata=JSON.parse(raw);

test("L'identité OAuth propre à la Radio est publique et déclare le chemin exact",()=>{
  assert.equal(metadata.client_id,POLLINATIONS_CLIENT_ID);
  assert.equal(metadata.redirect_uris.length,1);
  assert.equal(metadata.redirect_uris[0],POLLINATIONS_CALLBACK);
  assert.equal(metadata.token_endpoint_auth_method,"none");
  assert.ok(POLLINATIONS_CALLBACK.endsWith("/radio-des-ia-html5/tchat.html"));
  assert.ok(POLLINATIONS_CLIENT_ID.endsWith("/radio-des-ia-html5/pollinations-client.json"));
});
test("Sans clé pk_ l'authentification génère un flux OAuth 2.1 PKCE signé par l'identité du Salon",async()=>{
  const result=await createPollinationsAuthorization({cryptoRef:webcrypto});
  const url=new URL(result.url);
  assert.equal(url.searchParams.get("client_id"),POLLINATIONS_CLIENT_ID);
  assert.equal(url.searchParams.get("redirect_uri"),POLLINATIONS_CALLBACK);
  assert.equal(url.searchParams.get("code_challenge_method"),"S256");
  assert.equal(url.searchParams.get("budget"),"1");
  assert.equal(result.pending.clientId,POLLINATIONS_CLIENT_ID);
});
test("L'identité statique est vérifiée avant l'ouverture du fournisseur",async()=>{
  let calls=0;
  const result=await verifyPollinationsClient({fetcher:async(url,options)=>{
    calls++;
    assert.equal(url,POLLINATIONS_CLIENT_ID);
    assert.equal(options.method,"GET");
    return new Response(JSON.stringify(metadata),{status:200});
  }});
  assert.equal(result.found,true);
  assert.equal(calls,1);
});
test("Un document d'identité incorrect empêche l'envoi d'un consentement voué à échouer",async()=>{
  await assert.rejects(
    verifyPollinationsClient({fetcher:async()=>{
      return new Response(JSON.stringify({...metadata,redirect_uris:["https://example.invalid/"]}),{status:200});
    }}),/incohérent/
  );
});
test("Une clé pk_ avancée est vérifiée côté Pollinations avec la bonne URL de retour",async()=>{
  const custom="pk_example12345";
  const result=await verifyPollinationsClient({clientId:custom,fetcher:async(url)=>{
    const parsed=new URL(url);
    assert.equal(parsed.origin,"https://enter.pollinations.ai");
    assert.equal(parsed.pathname,"/api/app-lookup");
    assert.equal(parsed.searchParams.get("client_id"),custom);
    assert.equal(parsed.searchParams.get("redirect_uri"),POLLINATIONS_CALLBACK);
    return new Response(JSON.stringify({found:true,appName:"Test",redirectUris:[POLLINATIONS_CALLBACK]}));
  }});
  assert.equal(result.appName,"Test");
});
test("Une clé pk_ dont l'adresse est non inscrite échoue avant la redirection",async()=>{
  await assert.rejects(
    verifyPollinationsClient({clientId:"pk_example12345",fetcher:async()=>new Response(
      JSON.stringify({found:false,error:"redirect_uri_mismatch"})
    )}),
    /URL de retour non enregistrée/
  );
});
test("Les cinq moteurs et les échanges restent dans la page originale",()=>{
  const html=readFileSync(new URL("../tchat.html",import.meta.url),"utf8");
  const js=readFileSync(new URL("../tchat-distant.mjs",import.meta.url),"utf8");
  for(const engine of ["puter","horde","research-local","pollinations","sparktiates"])
    assert.ok(html.includes('value="'+engine+'"'),engine);
  assert.match(html,/Se connecter directement à Pollinations/);
  assert.match(js,/POLLINATIONS_CLIENT_ID/);
  assert.match(js,/verifyPollinationsClient\(/);
  assert.match(html,/id="fil"/);
  assert.match(html,/ChatGPT et René Le Corre®/);
});
