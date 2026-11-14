"""NVIDIA Spark + AMD EPYC : controle de la projection et du materiel mesure."""
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"selfhost"))
import resources
import cluster

class HardwareTests(unittest.TestCase):
    def test_vendor_profiles_are_alternative_architectures(self):
        self.assertEqual(resources.FAMILIES["spark-gb10"]["arch"],"aarch64")
        self.assertEqual(resources.FAMILIES["spark-gb10"]["memory_gb_per_system"],128)
        self.assertEqual(resources.FAMILIES["epyc-9006"]["arch"],"x86_64")
        self.assertEqual(resources.FAMILIES["epyc-9006"]["max_cores_per_socket"],256)
        self.assertEqual(resources.FAMILIES["epyc-9965"]["max_cores_per_socket"],192)

    def test_detected_spark_reports_real_OS_RAM_not_profile_nominal(self):
        ram={"MemTotal":95*1024**3,"MemAvailable":74*1024**3}
        gpu=[{"name":"NVIDIA GB10 Blackwell","vram_total_mb":90000,"vram_free_mb":60000}]
        info=resources.detect_resources(arch="aarch64",threads=20,ram=ram,gpus=gpu,cpu="NVIDIA Grace Blackwell")
        self.assertEqual(info["family"],"spark-gb10")
        self.assertEqual(info["ram_total_bytes"],95*1024**3)
        self.assertEqual(info["cpu_logical_threads"],20)
        self.assertFalse(info["ram_shared_across_network"])

    def test_detected_epyc_and_other_do_not_invent_RAM(self):
        info=resources.detect_resources(arch="x86_64",threads=1024,
          ram={"MemTotal":512*1024**3,"MemAvailable":400*1024**3},gpus=[],
          cpu="AMD EPYC 9006 Venice")
        self.assertEqual(info["family"],"epyc-9006")
        self.assertEqual(info["ram_total_bytes"],512*1024**3)
        self.assertEqual(info["gpus"],[])
        absent=resources.detect_resources(arch="x86_64",threads=None,
          ram={"MemTotal":None,"MemAvailable":None},gpus=[],cpu="Unknown CPU")
        self.assertIsNone(absent["ram_total_bytes"])

    def test_projection_64_sparks_and_32_dual_epyc_is_not_available(self):
        plan=resources.plan_topology()
        self.assertEqual(plan["registered_nodes"],0)
        self.assertEqual(plan["online_nodes"],0)
        self.assertEqual(plan["usable_slots"],0)
        self.assertEqual(plan["spark"]["planned_systems"],64)
        self.assertEqual(plan["spark"]["planned_unified_memory_gb"],8192)
        self.assertEqual(plan["epyc"]["planned_systems"],32)
        self.assertEqual(plan["epyc"]["planned_max_x86_cores_if_equipped"],16384)
        self.assertEqual(plan["epyc"]["planned_ddr5_ram_gb"],65536)
        self.assertEqual(plan["aggregate_planned_memory_gb_not_shared"],73728)
        self.assertEqual(plan["spark"]["planned_virtual_containers"],256)
        self.assertEqual(plan["epyc"]["planned_virtual_machines"],512)

    def test_ram_virtualization_cannot_create_physical_capacity(self):
        with self.assertRaisesRegex(ValueError,"64 Go"):
            resources.plan_topology(spark_containers=8,spark_container_ram_gb=32)
        with self.assertRaisesRegex(ValueError,"75 %"):
            resources.plan_topology(epyc_vms=40,epyc_vm_ram_gb=64)
        with self.assertRaises(ValueError):
            resources.plan_topology(spark=4096,epyc=4096)
        with self.assertRaises(ValueError):
            resources.plan_topology(spark=1,epyc=0,spark_containers=9)

    def test_hardware_profile_must_match_real_verified_worker(self):
        spec={"nodes":[{"id":"spark","url":"http://127.0.0.1:8765",
                         "model":"qwen3:8b","slots":1,"hardware_family":"spark-gb10"}]}
        node=cluster.parse_nodes(spec)[0]
        def other_worker(url,**_):
            return {"ready":True,"model":"qwen3:8b",
                    "hardware":{"family":"wsl-rtx","arch":"x86_64",
                      "measurement":"worker_os_report","ram_total_bytes":64*1024**3}}
        group=cluster.Cluster([node],transport=other_worker)
        self.assertFalse(group.probe(node,force=True))
        self.assertEqual(group.status()["usable_slots"],0)
        self.assertEqual(node.reported_hardware,{})

    def test_real_spark_worker_must_state_the_architecture(self):
        spec={"nodes":[{"id":"spark","url":"http://127.0.0.1:8765",
                         "model":"qwen3:8b","slots":1,"hardware_family":"spark-gb10"}]}
        node=cluster.parse_nodes(spec)[0]
        def real_worker(url,**_):
            return {"ready":True,"model":"qwen3:8b",
                    "hardware":{"family":"spark-gb10","arch":"aarch64",
                       "measurement":"worker_os_report",
                       "ram_total_bytes":100*1024**3,
                       "ram_available_bytes":56*1024**3,
                       "cpu_logical_threads":20,"gpus":[{"name":"NVIDIA GB10"}]}}
        group=cluster.Cluster([node],transport=real_worker)
        self.assertTrue(group.probe(node,force=True))
        status=group.status()
        self.assertEqual(status["online_hardware_families"],["spark-gb10"])
        self.assertEqual(status["reported_ram_gb_online_separate_pools"],100)
        self.assertEqual(status["usable_slots"],1)
        self.assertEqual(status["nodes"][0]["cpu_arch_reported"],"aarch64")

    def test_family_and_memory_sensitive_routing(self):
        def hw(name):
            if name=="spark":
                return {"family":"spark-gb10","arch":"aarch64",
                        "measurement":"worker_os_report","ram_total_bytes":115*1024**3,
                        "ram_available_bytes":70*1024**3}
            return {"family":"epyc-9006","arch":"x86_64",
                    "measurement":"worker_os_report","ram_total_bytes":2048*1024**3,
                    "ram_available_bytes":1500*1024**3}
        nodes=[
          cluster.Node("spark","http://127.0.0.1:8765","qwen3:8b",1,hardware_family="spark-gb10"),
          cluster.Node("epyc","http://localhost:8765","qwen3:8b",1,hardware_family="epyc-9006")
        ]
        def transport(url,**kwargs):
            name="spark" if "127.0.0.1" in url else "epyc"
            if url.endswith("/health"):
                return {"ready":True,"model":"qwen3:8b","hardware":hw(name)}
            return {"answer":"Calcul reel du noeud "+name,"model":"qwen3:8b"}
        scheduler=cluster.Cluster(nodes,transport=transport)
        result=scheduler.chat({"message":"Bonjour","hardware_family":"epyc-9006",
                               "min_available_ram_gb":1000})
        self.assertEqual(result["node_id"],"epyc")
        with self.assertRaisesRegex(RuntimeError,"hors ligne ou occupes"):
            scheduler.chat({"message":"Bonjour","hardware_family":"spark-gb10",
                            "min_available_ram_gb":150})

    def test_wrong_family_or_huge_ram_rejected_before_worker(self):
        group=cluster.Cluster([cluster.Node("node","http://127.0.0.1:8765","qwen3:8b",1)],
                              transport=lambda *a,**k: (_ for _ in ()).throw(AssertionError()))
        with self.assertRaisesRegex(ValueError,"materielle inconnue"):
            group.chat({"message":"hello","hardware_family":"fake-8192"})
        with self.assertRaisesRegex(ValueError,"Memoire RAM"):
            group.chat({"message":"hello","min_available_ram_gb":2**20})

    def test_exemplar_plan_matches_pure_calculation(self):
        document=json.loads((ROOT/"selfhost"/"topology.plan.json").read_text(encoding="utf-8"))
        self.assertEqual(document["kind"],"capacity_plan_only_not_live_cluster")
        result=resources.plan_topology(**document["assumptions"])
        self.assertEqual(result["physical_hardware_provisioned"],False)
        self.assertEqual(result["online_nodes"],0)

if __name__=="__main__":
    unittest.main()
