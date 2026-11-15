/* Cache de la seule application SPARKTIATES HYBRID, pas des conversations VRM. */
const VERSION="sparktiates-hybrid-static-v1";
const ASSETS=["./index.html","./app.mjs","./engine.mjs","./compute-worker.mjs","./private-swarm.mjs","./style.css","./manifest.webmanifest","../vrm-reality-engine.mjs"];
self.addEventListener("install",event=>{
  event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>
    Promise.all(keys.filter(key=>key.startsWith("sparktiates-hybrid-static-")&&key!==VERSION).map(key=>caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  if(!url.pathname.includes("/addons/sparktiates/"))return;
  event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request)));
});