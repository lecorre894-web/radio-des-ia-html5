import test from "node:test";
import assert from "node:assert/strict";
import {EMOJI_GROUPS,EMOTICONS,GIF_LIMITS,isValidGifSignature,validateGif,createReactionBoard} from "../tchat-reactions.mjs";

test("tableau : emojis, émoticônes et signes scientifiques présents",()=>{
 assert.ok(EMOJI_GROUPS.Sourires.includes("😀"));
 assert.ok(EMOJI_GROUPS.Science.includes("🧠"));
 assert.ok(EMOTICONS.includes(":)"));
 assert.ok(EMOTICONS.includes("<3"));
});
test("signatures GIF87a / GIF89a acceptées sans confondre une vidéo renommée",()=>{
 assert.equal(isValidGifSignature(new TextEncoder().encode("GIF87a")),true);
 assert.equal(isValidGifSignature(new TextEncoder().encode("GIF89a")),true);
 assert.equal(isValidGifSignature(new TextEncoder().encode("MP4_file")),false);
 assert.equal(isValidGifSignature(new TextEncoder().encode("<html>")),false);
});
test("les vrais fichiers GIF sont acceptés, le faux .gif rejeté",async()=>{
 const file=(name,header)=>({
  name,size:10,slice:()=>new Blob([header.slice(0,6)])
 });
 assert.equal(await validateGif(file("animation.gif","GIF89a1234")),true);
 await assert.rejects(()=>validateGif(file("film.gif","....notgif")),/signature/);
 await assert.rejects(()=>validateGif(file("film.mp4","GIF89a1234")),/\.gif/);
});
test("taille maximale et module inactif sans tableau (radio inchangée)",async()=>{
 assert.ok(GIF_LIMITS.maxFiles>0);
 await assert.rejects(()=>validateGif({
  name:"gros.gif",size:GIF_LIMITS.maxBytes+1
 }),/volumineux/);
 const previous=globalThis.document;
 delete globalThis.document;
 try{assert.equal(createReactionBoard(),null);}
 finally{if(previous!==undefined)globalThis.document=previous;}
});
