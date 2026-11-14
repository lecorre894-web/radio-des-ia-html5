"""Tests du comité scientifique local — protocole doctoral, non certification."""
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"selfhost"))
import research,personas,server,cluster

class DoctoralTests(unittest.TestCase):
    def test_eight_research_roles_are_additive_not_replace_original_six(self):
        self.assertEqual(len(research.RESEARCH_ROLES),8)
        self.assertEqual(len(personas.RADIO_PROFILES),6)
        self.assertEqual(len(set(personas.PROFILES)),17)
        for role in research.RESEARCH_ROLES:
            self.assertIn(role,personas.PROFILES)
        for role in personas.RADIO_PROFILES:
            self.assertIn(role,personas.PROFILES)

    def test_model_selection_only_installed_no_fictitious_supercomputer(self):
        allowed=frozenset(("qwen3:8b","deepseek-r1:14b","qwen3:14b"))
        self.assertEqual(research.select_model("mathsup",allowed,"qwen3:8b"),"deepseek-r1:14b")
        self.assertEqual(research.select_model("methodes",allowed,"qwen3:8b"),"qwen3:14b")
        self.assertEqual(research.select_model("cairn",allowed,"qwen3:8b"),"qwen3:8b")
        self.assertEqual(research.select_model("mathsup",frozenset(("qwen3:8b",)),"qwen3:8b"),"qwen3:8b")
        with self.assertRaisesRegex(ValueError,"installé"):
            research.select_model("mathsup",frozenset(),"qwen3:8b")
        result=research.research_catalog(frozenset(), "qwen3:8b")
        self.assertFalse(result["base_model_installed"])
        self.assertTrue(all(x["model_if_available"] is None for x in result["roles"]))

    def test_installed_model_names_come_from_ollama_tags_only(self):
        result=research.installed_names({"models":[
            {"name":"qwen3:8b"},{"name":"gpt-oss:20b"},
            {"name":"bad"*100},{},None,{"name":""}]})
        self.assertEqual(result,frozenset(("qwen3:8b","gpt-oss:20b")))
        self.assertFalse(research.installed_names({"models":"malformed"}))

    def test_methodology_does_not_claim_diplomas_or_independent_peer_review(self):
        system=server.prompt_messages("Question originale",[], "pairs",[])[0]["content"]
        for snippet in ("PROTOCOLE SCIENTIFIQUE AVANCE", "MESURÉS",
                        "RECONSTRUITS","CANDIDATS","ARTEFACTS","INCONNUS",
                        "contre-exemple","N'invente", "PAS des confirmations indépendantes"):
            self.assertIn(snippet,system)
        plain=server.prompt_messages("Question originale",[],"cairn",[])[0]["content"]
        self.assertNotIn("PROTOCOLE SCIENTIFIQUE AVANCE",plain)

    def test_research_uses_real_local_model_and_more_tokens(self):
        seen=[]
        def fake_backend(url,data=None,timeout=9):
            seen.append((url,data))
            return {"message":{"role":"assistant","content":"Analyse scientifique factice, non probante"},
                    "prompt_eval_count":71,"eval_count":81}
        with patch.object(server,"fetch_json",side_effect=fake_backend):
            text,usage=server.inference([{"role":"user","content":"Méthode"}],
                                        selected_model="deepseek-r1:14b",scientific=True)
            self.assertEqual(text,"Analyse scientifique factice, non probante")
            self.assertEqual(usage["generated_tokens"],81)
        sent=seen[0][1]
        self.assertEqual(sent["model"],"deepseek-r1:14b")
        self.assertTrue(sent["think"])
        self.assertEqual(sent["options"]["num_predict"],1152)
        self.assertEqual(sent["options"]["num_ctx"],8192)
        self.assertLessEqual(sent["options"]["temperature"],0.3)

    def test_normal_radio_retains_its_small_budget(self):
        seen=[]
        def fake_backend(url,data=None,timeout=9):
            seen.append(data)
            return {"message":{"content":"Radio normale"},"eval_count":2}
        with patch.object(server,"fetch_json",side_effect=fake_backend):
            server.inference([{"role":"user","content":"Bonjour"}])
        self.assertEqual(seen[0]["model"],server.MODEL)
        self.assertFalse(seen[0]["think"])
        self.assertEqual(seen[0]["options"]["num_predict"],server.MAX_REPLY_TOKENS)

    def test_router_rejects_scientific_without_live_worker(self):
        node=cluster.Node("none","http://127.0.0.1:1","qwen3:8b",1)
        scheduler=cluster.Cluster([node],transport=lambda *a,**k: (_ for _ in ()).throw(OSError()))
        with self.assertRaises(RuntimeError):
            scheduler.chat({"profile":"jury","message":"Analyse cet exercice."})
        self.assertEqual(scheduler.status()["usable_slots"],0)

    def test_no_paid_api_in_scientific_paths(self):
        for path in ("research.py","personas.py"):
            source=(ROOT/"selfhost"/path).read_text(encoding="utf-8")
            self.assertNotIn("puter.ai.chat",source)
            self.assertNotIn("api.openai.com",source)
            self.assertNotIn("api.anthropic.com",source)

if __name__=="__main__":
    unittest.main()
