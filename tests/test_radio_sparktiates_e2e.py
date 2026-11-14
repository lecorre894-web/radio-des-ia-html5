"""Test d'integration de Radio des IA sous SPARKTIATES :
vrai serveur HTTP local -> ordonnanceur -> worker -> protocole Ollama SIMULE.
Ce test ne prouve pas qu'un modèle d'IA a ete execute.
"""
from __future__ import annotations
import json
import sys
import threading
import unittest
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"selfhost"))
import cluster
import server


@contextmanager
def serve(handler):
    instance=ThreadingHTTPServer(("127.0.0.1",0),handler)
    thread=threading.Thread(target=instance.serve_forever,daemon=True)
    thread.start()
    try: yield "http://127.0.0.1:"+str(instance.server_address[1])
    finally:
        instance.shutdown()
        instance.server_close()
        thread.join(timeout=4)


def http(url,payload=None,headers=None):
    body=json.dumps(payload).encode() if payload is not None else None
    extra={"Content-Type":"application/json"} if body is not None else {}
    extra.update(headers or {})
    request=Request(url, data=body,headers=extra)
    try:
        with urlopen(request,timeout=5) as response:
            content=response.read(120000)
            return response.status,content,response.headers
    except HTTPError as response:
        return response.code,response.read(120000),response.headers


class FakeInference(BaseHTTPRequestHandler):
    chat_payloads=[]
    def log_message(self,*args):pass
    def reply(self,data):
        payload=json.dumps(data).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Length",str(len(payload)))
        self.send_header("Content-Type","application/json")
        self.end_headers()
        self.wfile.write(payload)
    def do_GET(self):
        if self.path=="/api/tags":
            self.reply({"models":[{"name":"qwen3:8b"}]})
        else:
            self.send_error(404)
    def do_POST(self):
        if self.path!="/api/chat":
            return self.send_error(404)
        size=int(self.headers.get("Content-Length","0"))
        posted=json.loads(self.rfile.read(size))
        type(self).chat_payloads.append(posted)
        self.reply({"message":{"role":"assistant","content":"TEXTE DU FAUX OLLAMA, PAS UNE IA"},
                    "prompt_eval_count":40,"eval_count":9})


class RadioLoopTests(unittest.TestCase):
    def test_all_local_six_speakers_with_static_pages_and_offline_transport(self):
        FakeInference.chat_payloads=[]
        with serve(FakeInference) as fake,patch.object(server,"OLLAMA",fake),\
             patch.object(server,"BUCKETS",{}),patch.object(server,"NODE_TOKEN",""),\
             serve(server.Handler) as work:
            assigned=cluster.Cluster([cluster.Node("wsl-test",work,"qwen3:8b",slots=1)])
            with patch.object(cluster.Handler,"cluster",assigned),\
                 patch.object(cluster,"CLUSTER_KEY",""),serve(cluster.Handler) as radio:
                for path,expected in (
                    ("/radio",b"Radio des IA locale"),
                    ("/radio-sparktiates.mjs",b"/api/v1/chat"),
                    ("/radio-sparktiates-core.mjs",b"LOCAL_SPEAKERS"),
                    ("/node-ui.css",b"font:")):
                    code,body,_=http(radio+path)
                    self.assertEqual(code,200,path)
                    self.assertIn(expected,body,path)
                code,body,_=http(radio+"/api/v1/status")
                self.assertEqual(code,200)
                self.assertEqual(json.loads(body)["online_nodes"],1)
                code,body,_=http(radio+"/api/v1/personas")
                self.assertEqual(code,200)
                persona=json.loads(body)
                self.assertEqual(len(persona["agents"]),6)
                self.assertFalse(persona["has_proprietary_provider_clones"])
                self.assertEqual(persona["model"],"qwen3:8b")
                roles=("cairn","brume","aurore","controle","recherche","ia4")
                history=[{"role":"user","content":"Question initiale du salon"}]
                for role in roles:
                    code,body,_=http(radio+"/api/v1/chat",{
                        "message":"Comment améliorer Radio des IA ?",
                        "profile":role,"web":False,"history":history
                    })
                    self.assertEqual(code,200,(role,body))
                    data=json.loads(body)
                    self.assertEqual(data["answer"],"TEXTE DU FAUX OLLAMA, PAS UNE IA")
                    self.assertEqual(data["node_id"],"wsl-test")
                    self.assertEqual(data["model"],"qwen3:8b")
                    history.append({"role":"assistant","content":role+" : "+data["answer"]})
                self.assertEqual(assigned.status()["completed_jobs"],6)
                self.assertEqual(len(FakeInference.chat_payloads),6)
                for call,role in zip(FakeInference.chat_payloads,roles):
                    self.assertEqual(call["model"],"qwen3:8b")
                    self.assertEqual(call["messages"][0]["role"],"system")
                    self.assertIn("Profil de rôle local",call["messages"][0]["content"])
                    self.assertIn("Ollama",str(call["messages"]))

                self.assertTrue(all(call["stream"] is False for call in FakeInference.chat_payloads))

    def test_public_origin_cannot_post_from_other_site(self):
        assigned=cluster.Cluster([cluster.Node("offline","http://127.0.0.1:1","qwen3:8b",1)])
        with patch.object(cluster.Handler,"cluster",assigned),serve(cluster.Handler) as url:
            code,body,_=http(url+"/api/v1/chat",
               {"message":"Doit être rejeté","profile":"cairn"},
               headers={"Origin":"https://not-the-radio.example"})
            self.assertEqual(code,403)
            self.assertIn(b"origine",body.lower())
            self.assertEqual(assigned.total_requests,0)

    def test_no_local_ollama_never_claims_inference(self):
        assigned=cluster.Cluster([cluster.Node("offline","http://127.0.0.1:1","qwen3:8b",1)])
        with patch.object(cluster.Handler,"cluster",assigned),serve(cluster.Handler) as url:
            code,body,_=http(url+"/api/v1/personas")
            self.assertEqual(code,200)
            self.assertEqual(json.loads(body)["model"],"aucun modèle actif")
            code,body,_=http(url+"/api/v1/chat",{"message":"Question","profile":"cairn"})
            self.assertEqual(code,503)
            self.assertIn(b"hors ligne",body)
            code,body,_=http(url+"/api/v1/status")
            self.assertEqual(json.loads(body)["usable_slots"],0)

    def test_original_radio_files_untouched_and_no_puter_in_local_page(self):
        original=(ROOT/"tchat.html").read_text(encoding="utf-8")
        source=(ROOT/"tchat-distant.mjs").read_text(encoding="utf-8")
        local=(ROOT/"selfhost"/"radio-sparktiates.mjs").read_text(encoding="utf-8")
        self.assertIn("puter.ai.chat",source)
        self.assertNotIn("radio-sparktiates.mjs",original)
        self.assertNotIn("puter.ai.chat",local)
        self.assertIn("localStorage",local)
        self.assertIn('"/api/v1/chat"',local)

if __name__=="__main__":
    unittest.main()
