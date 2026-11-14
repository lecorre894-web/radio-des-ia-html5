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
for required in ("moi","parler","tour","infini","debattre","arreter","connecter","fil","parts","etat","compteur","modeleCatalogue","connected","pieceFichier","pieceDepot","pieceListe","pieceUtiliser","pieceVision","pieceEtat","imagePrompt","imageGenerer","imageModele","imageRatio","imageDemo","imageEtat","imageResult"):
    assert required in parser.ids, f"Élément manquant: {required}"
for relative in parser.files:
    assert (root / relative).is_file(), f"Script absent: {relative}"
assert "https://js.puter.com/v2/" in page
assert "tchat-distant.mjs" in page
assert "tchat-images.mjs" in page
assert "video/" not in page
assert (root / "tchat-documents.mjs").is_file()
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
