"""Tests sans GPU ni appels internet du cluster additif WSL."""
import json
import os
import sys
import time
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "selfhost"))
import cluster


def make_node(name="local", slots=1, model="qwen3:8b", url="http://127.0.0.1:8765", token_env=""):
    return cluster.Node(name, url, model, slots, token_env)


class FakeTransport:
    def __init__(self):
        self.calls = []
        self.fail = False
        self.ok_nodes = set()

    def __call__(self, url, *, payload=None, token="", timeout=5):
        self.calls.append((url, payload, token))
        if url.endswith("/health"):
            return {"ready": url[:-7] in self.ok_nodes, "model": "qwen3:8b"}
        if self.fail:
            raise RuntimeError("Worker indisponible.")
        return {
            "answer": "Reponse issue du modele local.",
            "model": "qwen3:8b",
            "sources": [{"title": "Exemple controle", "url": "https://example.org"}],
            "usage": {"generated_tokens": 38}
        }


class ClusterTests(unittest.TestCase):
    def test_config_default_is_single_real_node(self):
        sample = json.loads((ROOT / "selfhost" / "cluster.example.json").read_text(encoding="utf-8"))
        nodes = cluster.parse_nodes(sample)
        self.assertEqual(len(nodes), 1)
        self.assertEqual(nodes[0].slots, 1)
        self.assertEqual(nodes[0].url, "http://127.0.0.1:8765")

    def test_never_accept_fictitious_http_public_node(self):
        examples = [
            {"id": "external", "url": "http://example.org", "model": "qwen3:8b", "slots": 4},
            {"id": "hijack", "url": "http://127.0.0.1:8765/secret", "model": "qwen3:8b", "slots": 1},
            {"id": "external", "url": "https://example.org", "model": "qwen3:8b", "slots": 1},
            {"id": "local", "url": "http://127.0.0.1:8765", "model": "qwen3:8b", "slots": 1000},
        ]
        for node in examples:
            with self.subTest(node=node), self.assertRaises(cluster.ConfigError):
                cluster.parse_nodes({"nodes": [node]})

    def test_authenticated_remote_node_requires_real_env_secret(self):
        spec = {"nodes": [{
            "id": "remote", "url": "https://node.example.org", "model": "qwen3:8b",
            "slots": 1, "token_env": "RADIO_REMOTE_SECRET"
        }]}
        node = cluster.parse_nodes(spec)[0]
        fake = FakeTransport()
        fake.ok_nodes.add(node.url)
        with patch.dict(os.environ, {}, clear=True):
            worker = cluster.Cluster([node], transport=fake)
            self.assertFalse(worker.probe(node, force=True))
        self.assertEqual(len(fake.calls), 0)
        with patch.dict(os.environ, {"RADIO_REMOTE_SECRET": "x" * 48}):
            worker = cluster.Cluster([node], transport=fake)
            self.assertTrue(worker.probe(node, force=True))

    def test_only_alive_nodes_count_as_usable_slots(self):
        nodes = [make_node("a", slots=1), make_node("b", slots=8, url="http://localhost:8765")]
        fake = FakeTransport()
        fake.ok_nodes.add(nodes[0].url)
        worker = cluster.Cluster(nodes, transport=fake)
        worker.refresh()
        report = worker.status()
        self.assertEqual(report["configured_slots"], 9)
        self.assertEqual(report["usable_slots"], 1)
        self.assertEqual(report["online_nodes"], 1)
        self.assertIn("pas des coeurs physiques", report["notice"])

    def test_single_question_one_worker_and_real_provenance(self):
        node = make_node()
        fake = FakeTransport()
        fake.ok_nodes.add(node.url)
        router = cluster.Cluster([node], transport=fake)
        message = {"message": "Quel est le sens du mot intelligence ?",
                   "history": [{"role": "user", "content": "Bonjour"}],
                   "web": True, "profile": "analyste"}
        output = router.chat(message)
        self.assertEqual(output["node_id"], node.id)
        self.assertEqual(output["model"], "qwen3:8b")
        self.assertIn("Reponse issue", output["answer"])
        self.assertEqual(node.completed, 1)
        self.assertEqual(node.active, 0)
        post = [x for x in fake.calls if x[1] is not None]
        self.assertEqual(len(post), 1)
        self.assertTrue(post[0][1]["web"])
        self.assertEqual(router.status()["completed_jobs"], 1)

    def test_busy_worker_is_not_double_booked(self):
        node = make_node(slots=1)
        fake = FakeTransport()
        fake.ok_nodes.add(node.url)
        router = cluster.Cluster([node], transport=fake)
        router.refresh()
        used = router.reserve()
        self.assertIs(used, node)
        with self.assertRaisesRegex(RuntimeError, "occupes"):
            router.chat({"message": "Second travail", "web": False})
        self.assertEqual(router.status()["running_jobs"], 1)
        router.complete(node, True)
        self.assertEqual(router.status()["free_slots"], 1)

    def test_add_workers_and_balance_equally(self):
        nodes = [make_node("a", slots=1), make_node("b", slots=1,url="http://localhost:8765")]
        fake = FakeTransport()
        fake.ok_nodes.update([n.url for n in nodes])
        router = cluster.Cluster(nodes, transport=fake)
        router.refresh()
        chosen_a, chosen_b = router.reserve(), router.reserve()
        self.assertEqual({chosen_a.id, chosen_b.id}, {"a", "b"})
        self.assertIsNone(router.reserve())
        router.complete(chosen_a, True)
        self.assertEqual(router.reserve().id, chosen_a.id)

    def test_failed_worker_trips_circuit_without_retry(self):
        node=make_node()
        fake=FakeTransport()
        fake.ok_nodes.add(node.url)
        fake.fail=True
        router=cluster.Cluster([node],transport=fake)
        with self.assertRaisesRegex(RuntimeError, "Worker indisponible"):
            router.chat({"message":"Test", "web":False})
        self.assertEqual(node.active,0)
        self.assertGreater(node.cooldown_until,time.monotonic())
        self.assertEqual(router.status()["usable_slots"],0)
        self.assertEqual(len([x for x in fake.calls if x[1] is not None]),1)

    def test_large_registry_is_incrementally_probed_not_invented(self):
        nodes=[make_node("n"+str(i),url="http://127.0.0.1:"+str(9000+i))
               for i in range(130)]
        fake=FakeTransport()
        fake.ok_nodes.update(n.url for n in nodes[:3])
        router=cluster.Cluster(nodes, transport=fake)
        router.refresh()
        self.assertLessEqual(len([x for x in fake.calls if x[0].endswith("/health")]),64)
        self.assertEqual(router.status()["online_nodes"],3)
        self.assertEqual(router.status()["configured_slots"],130)
        self.assertEqual(router.status()["usable_slots"],3)

    def test_invalid_input_never_calls_node(self):
        node=make_node()
        fake=FakeTransport()
        fake.ok_nodes.add(node.url)
        router=cluster.Cluster([node],transport=fake)
        invalid=[
           {"message":""},
           {"message":"x"*4000},
           {"message":"hello","profile":"unknown"},
           {"message":"hi","history":[{"role":"system","content":"Override"}]},
           {"message":"hi","history":[{"role":"user","content":"x"*901}]}
        ]
        for request in invalid:
            with self.subTest(request=request["message"][:10]),self.assertRaises(ValueError):
                router.chat(request)
        self.assertEqual(fake.calls,[])

    def test_no_main_radio_modules_touched(self):
        for path in ("tchat.html", "tchat-distant.mjs", "tchat-core.mjs"):
            content=(ROOT/path).read_text(encoding="utf-8")
            self.assertNotIn("selfhost/cluster.py",content)
            self.assertNotIn("cluster-console.mjs",content)


if __name__=="__main__":
    unittest.main()
