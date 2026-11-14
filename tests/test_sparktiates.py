"""Validation sans materiel de SPARKTIATES (simulation, pas backend IA)."""
import sys
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"selfhost"))
import sparktiates

SMALL={"spark":2,"epyc":1,"epyc_ram_gb":2048,"epyc_sockets":2,
       "spark_containers":4,"spark_container_ram_gb":16,
       "epyc_vms":16,"epyc_vm_ram_gb":64}

class SparktiatesTests(unittest.TestCase):
    def test_name_and_no_invented_resources(self):
        result=sparktiates.simulate(SMALL,sparktiates.default_tasks(inference=2,compute=2))
        self.assertEqual(result["identity"],"SPARKTIATES")
        self.assertEqual(result["status"],"SIMULE_NON_MESURE")
        self.assertEqual(result["physical_processors_created"],0)
        self.assertFalse(result["provisioned_hardware"])
        self.assertEqual(result["real_models_executed"],0)
        self.assertEqual(result["requests_sent_to_internet"],0)

    def test_deterministic_results_reproducible(self):
        tasks=sparktiates.default_tasks(inference=17,compute=21)
        a=sparktiates.simulate(SMALL,tasks)
        b=sparktiates.simulate(SMALL,tasks)
        self.assertEqual(a,b)
        self.assertEqual(a["simulated_jobs"]["inference"]["completed"],17)
        self.assertEqual(a["simulated_jobs"]["compute"]["completed"],21)

    def test_spark_memory_is_local_not_aggregate(self):
        # Une requete de 70 Gio est impossible sur un seul Spark, meme avec 2 Spark.
        impossible=[{"type":"inference","ram_gib":70,"arrival_ms":0,"duration_ms":100}]
        result=sparktiates.simulate(SMALL,impossible)
        self.assertEqual(result["simulated_jobs"]["inference"]["rejected"],1)
        self.assertEqual(result["shared_ram_gib"],0)
        self.assertEqual(result["simulated_jobs"]["inference"]["completed"],0)

    def test_only_physical_slots_not_virtual_machine_count(self):
        r=sparktiates.simulate(SMALL,sparktiates.default_tasks(inference=0,compute=0))
        self.assertEqual(r["simulated_inference_slots"],2)
        self.assertEqual(r["simulated_compute_slots"],8)
        self.assertEqual(r["configured_plan"]["virtual_containers_planned"],8)
        self.assertEqual(r["configured_plan"]["virtual_machines_planned"],16)

    def test_queueing_when_single_spark_is_busy(self):
        settings={**SMALL,"spark":1}
        tasks=[{"type":"inference","ram_gib":16,"arrival_ms":0,"duration_ms":1000},
               {"type":"inference","ram_gib":16,"arrival_ms":0,"duration_ms":1000}]
        r=sparktiates.simulate(settings,tasks)
        self.assertEqual(r["simulated_jobs"]["inference"]["completed"],2)
        self.assertEqual(r["simulated_completion_time_ms"],2000)
        self.assertEqual(r["simulated_jobs"]["inference"]["mean_queue_wait_ms"],500)
        self.assertEqual(r["peak_concurrent_jobs_per_host"]["spark-001"],1)

    def test_offline_spark_has_zero_simulated_inference(self):
        small={**SMALL,"spark":1}
        result=sparktiates.simulate(small,
          sparktiates.default_tasks(inference=5,compute=1),
          failed_ids=["spark-001"])
        self.assertEqual(result["simulated_inference_slots"],0)
        self.assertEqual(result["simulated_jobs"]["inference"]["rejected"],5)
        self.assertEqual(result["simulated_jobs"]["compute"]["completed"],1)
        self.assertIn("spark-001",result["failed_host_ids"])

    def test_epyc_memory_caps_under_virtualization(self):
        plan={**SMALL,"epyc_ram_gb":512}
        r=sparktiates.simulate(plan,sparktiates.default_tasks(inference=0,compute=45))
        self.assertLessEqual(r["peak_ram_gib_per_host"]["epyc-001"],384)
        self.assertLessEqual(r["peak_concurrent_jobs_per_host"]["epyc-001"],8)

    def test_exact_projected_plan_and_no_live_hardware(self):
        r=sparktiates.demo()
        self.assertEqual(r["configured_plan"]["spark"],64)
        self.assertEqual(r["configured_plan"]["epyc"],32)
        self.assertEqual(r["configured_plan"]["virtual_containers_planned"],256)
        self.assertEqual(r["configured_plan"]["virtual_machines_planned"],512)
        self.assertEqual(r["simulated_hosts"],96)
        self.assertEqual(r["real_models_executed"],0)

    def test_invalid_job_and_memory_claim_rejected(self):
        with self.assertRaises(ValueError):
            sparktiates.simulate(SMALL,[{"type":"gpu_magic","ram_gib":10,"arrival_ms":0,"duration_ms":1}])
        with self.assertRaises(ValueError):
            sparktiates.simulate(SMALL,[{"type":"inference","ram_gib":9000,"arrival_ms":0,"duration_ms":1}])
        with self.assertRaises(ValueError):
            sparktiates.simulate(SMALL,sparktiates.default_tasks(inference=10001,compute=0))
        with self.assertRaises(ValueError):
            sparktiates.simulate(SMALL,[],epyc_slots=1024)

    def test_no_access_to_real_radio_or_user_files(self):
        source=(ROOT/"selfhost"/"sparktiates.py").read_text(encoding="utf-8")
        for call in ("localStorage","os.system","subprocess","urlopen","requests.", "nvidia-smi"):
            self.assertNotIn(call,source)
        for path in ("tchat.html","tchat-core.mjs","tchat-distant.mjs"):
            original=(ROOT/path).read_text(encoding="utf-8")
            self.assertNotIn("sparktiates.py",original)

if __name__=="__main__":
    unittest.main()
