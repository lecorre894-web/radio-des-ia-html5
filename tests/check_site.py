#!/usr/bin/env python3
"""Vérifications statiques de la Radio des IA HTML5."""
from pathlib import Path
from html.parser import HTMLParser
import json
import re

root = Path(__file__).resolve().parents[1]

class Check(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
        self.files = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "id" in attrs:
            assert attrs["id"] not in self.ids, "ID HTML dupliqué"
            self.ids.add(attrs["id"])
        if tag == "script" and attrs.get("src", "").startswith("./"):
            self.files.append(attrs["src"].split("?")[0])

page = (root / "tchat.html").read_text(encoding="utf-8")
parser = Check()
parser.feed(page)
for required in ("moi","parler","tour","infini","debattre","arreter","connecter","fil","parts","etat","compteur","modeleCatalogue","connected","diagnosticModeles","pieceAutoTest","pieceAutoResult","pieceFichier","pieceDepot","pieceListe","pieceUtiliser","pieceVision","pieceEtat","imagePrompt","imageGenerer","imageModele","imageRatio","imageDemo","imageEtat","imageResult","reactionToggle","reactionBoard","reactionClose","reactionSearch","reactionEmojis","reactionSmileys","reactionGifs","reactionGifFile","reactionGifList","reactionStatus"):
    assert required in parser.ids, f"Élément manquant: {required}"
for relative in parser.files:
    assert (root / relative).is_file(), f"Script absent: {relative}"
assert "https://js.puter.com/v2/" in page
assert "tchat-distant.mjs" in page
assert (root / "tchat-models.mjs").is_file()
# Nouvelle ergonomie : conversation visible avant les panneaux et sélection des IA tout en bas.
positions = [
    page.index('id="conversation"'),
    page.index('id="fil"'),
    page.index('id="moi"'),
    page.index('id="documents"'),
    page.index('id="imagesGenerateur"'),
    page.index('id="intervenants"'),
    page.index("<footer>")
]
assert positions == sorted(positions), "Les IA ne sont pas sous la conversation et les médias"
assert 'id="intervenants"' in page and 'href="#conversation"' in page
assert 'color:#8dffad' in page and 'caret-color:#d5ffe0' in page, "Couleur numérique manquante"
assert '.msg .body{color:var(--fg)' in page, "Les messages doivent garder la couleur ordinaire"
assert 'ChatGPT et René Le Corre®' in page, "Signature du Salon absente"
assert '<meta name="description"' in page and '<link rel="canonical"' in page
assert 'content="index, follow' in page
index_page = (root / "index.html").read_text(encoding="utf-8")
assert 'ChatGPT et René Le Corre®' in index_page
assert 'intelligence artificielle' in index_page.lower()
assert '<meta name="description"' in index_page and '<link rel="canonical"' in index_page
sitemap = (root / "sitemap.xml").read_text(encoding="utf-8")
assert "tchat.html</loc>" in sitemap and "radio-des-ia-html5/</loc>" in sitemap
# Favoris : icones dédiées, manifeste et bouton sans dépendance au tchat.
manifest = json.loads((root / "manifest.webmanifest").read_text(encoding="utf-8"))
assert manifest["short_name"] == "Radio des IA"
assert manifest["start_url"] == "./tchat.html"
assert manifest["scope"] == "./"
icons = manifest["icons"]
assert any(icon.get("sizes") == "192x192" for icon in icons)
assert any(icon.get("sizes") == "512x512" for icon in icons)
for page_name in ("index.html", "tchat.html"):
    document = (root / page_name).read_text(encoding="utf-8")
    for control in ("favorisToggle", "favorisPanneau", "favorisInstructions", "favorisAdresse", "favorisCopier", "favorisStatut"):
        assert f'id="{control}"' in document, f"Bouton favori manquant : {control}"
    assert 'rel="manifest" href="./manifest.webmanifest"' in document
    assert 'href="./favicon.svg"' in document
    assert 'href="./icon-32.png"' in document
    assert 'href="./icon-180.png"' in document
    assert './bookmark.mjs?v=favoris-1' in document
svg = (root / "favicon.svg").read_text(encoding="utf-8")
assert '<svg ' in svg and 'Radio des IA' in svg
for dimension in (32, 180, 192, 512):
    raw = (root / f"icon-{dimension}.png").read_bytes()
    assert raw[:8] == bytes.fromhex("89504e470d0a1a0a"), "Signature PNG incorrecte"
    assert int.from_bytes(raw[16:20], "big") == dimension
    assert int.from_bytes(raw[20:24], "big") == dimension

assert "Entrée = retour à la ligne" in page
assert "Envoyer le message" in page
assert "enterkeyhint=\"enter\"" in page
assert "tchat-images.mjs" in page
assert "video/" not in page
assert (root / "tchat-documents.mjs").is_file()
assert (root / "tchat-reactions.mjs").is_file()
assert "tchat-reactions.mjs" in (root / "tchat-distant.mjs").read_text(encoding="utf-8")
core = (root / "tchat-core.mjs").read_text(encoding="utf-8")
assert "QUESTION HUMAINE ORIGINALE" in core
assert "buildPrompt" in core
assert (root / "tchat-local.html").is_file()
assert (root / "radio-public.js").is_file()
assert (root / "presence.js").is_file()
assert "feed.json" in [p.name for p in root.glob("feed.json")]
cfg = json.loads((root / "config.json").read_text(encoding="utf-8"))
assert isinstance(cfg, dict)
for path in root.glob("*.html"):
    text = path.read_text(encoding="utf-8")
    assert not re.search(r"\b(?:github_pat_|ghp_|sk-)[A-Za-z0-9_]{28,}", text), f"Clé potentielle dans {path}"
print("HTML=PASS; PYTHON=PASS; QUESTION_ORIGINALE=PASS; RADIO_COLLECTIVE=CONSERVÉE")
