import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {bookmarkInstructions,initBookmarkPanel} from "../bookmark.mjs";

const load=name=>readFileSync(new URL("../"+name,import.meta.url),"utf8");
test("bouton de favoris présent sur les deux pages, sans manipuler le tchat",()=>{
 for(const filename of ["index.html","tchat.html"]){
  const html=load(filename);
  for(const key of ["favorisToggle","favorisPanneau","favorisInstructions","favorisAdresse","favorisCopier","favorisStatut"]){
   assert.ok(html.includes('id="'+key+'"'),filename+" manque "+key);
  }
  assert.match(html,/rel="manifest" href="\.\/manifest.webmanifest"/);
  assert.match(html,/rel="icon" type="image\/svg\+xml" href="\.\/favicon.svg"/);
  assert.match(html,/rel="apple-touch-icon" sizes="180x180" href="\.\/icon-180.png"/);
  assert.match(html,/bookmark\.mjs\?v=favoris-1/);
 }
});
test("instructions favori Android, Safari, ordinateur",()=>{
 assert.match(bookmarkInstructions("Mozilla/5.0 (Linux; Android 16) Chrome/140"),/Chrome Android/);
 assert.match(bookmarkInstructions("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)"),/Safari/);
 assert.match(bookmarkInstructions("Mozilla/5.0 (Macintosh; Intel Mac OS X)"),/⌘ \+ D/);
 assert.match(bookmarkInstructions("Mozilla/5.0 (Windows NT 10.0)"),/Ctrl \+ D/);
});
test("pas d'ajout direct ou silencieux aux favoris du navigateur",()=>{
 const js=load("bookmark.mjs");
 assert.doesNotMatch(js,/window\.external\.AddFavorite|window\.sidebar\.addPanel/);
 assert.match(js,/navigator\?\.clipboard\?\.writeText/);
 assert.equal(initBookmarkPanel(),false);
});
test("manifeste du Salon avec son chemin GitHub Pages relatif et ses icones",()=>{
 const manifest=JSON.parse(load("manifest.webmanifest"));
 assert.equal(manifest.short_name,"Radio des IA");
 assert.equal(manifest.start_url,"./tchat.html");
 assert.equal(manifest.scope,"./");
 assert.ok(manifest.icons.some(x=>x.sizes==="192x192"&&x.type==="image/png"));
 assert.ok(manifest.icons.some(x=>x.sizes==="512x512"&&x.type==="image/png"));
 for(const icon of manifest.icons){
  const url=new URL("../"+icon.src.replace(/^\.\//,""),import.meta.url);
  assert.equal(existsSync(url),true);
 }
});
