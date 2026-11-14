"""Verifie le sens exact de «SPARKTIATES offline» avec de vraies requetes HTTP
sur localhost seulement. Aucun modele externe ou credit API n'est utilise."""
import json
import sys
import threading
import unittest
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"selfhost"))
import server as worker
import cluster
import resources


@contextmanager
def running(handler):
    local=ThreadingHTTPServer(("127.0.0.1",0),handler)
    task=threading.Thread(target=local.serve_forever,daemon=True)
    task.start()
    try:
        yield "http://127.0.0.1:"+str(local.server_address[1])
    finally:
        local.shutdown()
        local.server_close()
        task.join(timeout=3)


def json_http(url,payload=None):
    body=json.dumps(payload).encode() if payload is not None else None
    headers={"Content-Type":"application/json"} if body is not None else {}
    req=Request(url,data=body,headers=headers)
    try:
        with urlopen(req,timeout=4) as response:
            return response.status,json.loads(response.read().decode())
    except HTTPError as err:
        return err.code,json.loads(err.read().decode())


class FakeOllama(BaseHTTPRequestHandler):
    """Simule uniquement le protocole Ollama, PAS un modele d'IA."""
    requests=[]
    def log_message(self,*args):
        pass
    def reply(self,status,body):
        raw=json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type","application/json")
        self.send_header("Content-Length",str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)
    def do_GET(self):
        self.requests.append(("GET",self.path))
        if self.path=="/api/tags":
            self.reply(200,{"models":[{"name":"qwen3:8b"}]})
        else:
            self.reply(404,{"error":"not found"})
    def do_POST(self):
        self.requests.append(("POST",self.path))
        if self.path=="/api/chat":
            length=int(self.headers.get("Content-Length",0))
            body=json.loads(self.rfile.read(length))
            assert body.get("model")=="qwen3:8b"
            self.reply(200,{"message":{"role":"assistant","content":"REPONSE SIMULEE, PAS UNE IA"},
                            "prompt_eval_count":20,"eval_count":8})
        else:
            self.reply(404,{"error":"not found"})


class OfflineLoopTests(unittest.TestCase):
    def test_entirely_emulated_cluster_has_no_physical_capacity(self):
        projected=resources.plan_topology()
        self.assertEqual(projected["online_nodes"],0)
        self.assertEqual(projected["usable_slots"],0)
        self.assertFalse(projected["physical_hardware_provisioned"])
        self.assertEqual(projected["spark"]["planned_systems"],64)
        self.assertEqual(projected["epyc"]["planned_systems"],32)

    def test_without_ollama_local_http_health_and_inference_fail(self):
        with patch.object(worker,"OLLAMA","http://127.0.0.1:1"), \
             patch.object(worker,"NODE_TOKEN",""), \
             running(worker.Handler) as url:
            status,health=json_http(url+"/health")
            self.assertEqual(status,503)
            self.assertFalse(health["ready"])
            code,payload=json_http(url+"/api/chat",
                {"message":"Reponds sans aucun modele local", "web":False})
            self.assertEqual(code,502)
            self.assertIn("Modele indisponible",payload["error"])

    def test_fake_ollama_can_close_loop_but_does_not_create_an_ai(self):
        FakeOllama.requests=[]
        with running(FakeOllama) as fake, \
             patch.object(worker,"OLLAMA",fake), \
             patch.object(worker,"NODE_TOKEN",""), \
             running(worker.Handler) as url:
            status,health=json_http(url+"/health")
            self.assertEqual(status,200)
            self.assertTrue(health["ready"])
            status,response=json_http(url+"/api/chat",
                {"message":"Bonjour Radio", "web":False})
            self.assertEqual(status,200)
            self.assertEqual(response["answer"],"REPONSE SIMULEE, PAS UNE IA")
            self.assertEqual(response["model"],"qwen3:8b")
            self.assertEqual(response["usage"]["generated_tokens"],8)
        self.assertIn(("GET","/api/tags"),FakeOllama.requests)
        self.assertIn(("POST","/api/chat"),FakeOllama.requests)

    def test_router_refuses_inference_when_node_is_fictional_or_offline(self):
        physical=cluster.parse_nodes({
            "nodes":[{"id":"wsl","url":"http://127.0.0.1:8765",
                "model":"qwen3:8b","slots":64}]
        })
        calls=[]
        def no_worker(url,**kwargs):
            calls.append(url)
            raise URLError("Il n'existe aucun worker")
        scheduler=cluster.Cluster(physical,transport=no_worker)
        with self.assertRaisesRegex(RuntimeError,"hors ligne ou occupes"):
            scheduler.chat({"message":"Une vraie réponse d'IA"})
        metrics=scheduler.status()
        self.assertEqual(metrics["configured_slots"],64)
        self.assertEqual(metrics["online_nodes"],0)
        self.assertEqual(metrics["usable_slots"],0)
        self.assertFalse(any("/api/chat" in url for url in calls))

    def test_main_radio_still_needs_the_actual_puter_model(self):
        script=(ROOT/"tchat-distant.mjs").read_text(encoding="utf-8")
        html=(ROOT/"tchat.html").read_text(encoding="utf-8")
        self.assertIn("puter.ai.chat",script)
        self.assertNotIn("cluster-client.mjs",html)
        self.assertNotIn("cluster-client.mjs",script)


if __name__=="__main__":
    unittest.main()
