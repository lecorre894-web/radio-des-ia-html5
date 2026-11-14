#!/usr/bin/env python3
"""SPARKTIATES: simulateur deterministe du cluster Radio des IA.
SIMULATION D'ORDONNANCEMENT, pas emulateur ISA/CUDA et pas de materiel cree.
Aucun appel de modele, fournisseur, reseau, GPU, VM ou serveur cloud.
"""
from __future__ import annotations

import heapq
import json
from dataclasses import dataclass, field
from pathlib import Path

from resources import plan_topology

BASE=Path(__file__).resolve().parent
MAX_TASKS=10000
MAX_HOSTS=4096
VALID_KINDS=("inference","compute")


@dataclass
class Host:
    name: str
    kind: str
    slots: int
    ram_budget_gib: int
    active: list=field(default_factory=list)
    completed: int=0
    peak_ram_gib: int=0
    peak_jobs: int=0

    def earliest(self,arrival_ms:int,memory_gib:int):
        """Retourne le premier instant possible sans depasser slots ou RAM de l'hote."""
        if memory_gib>self.ram_budget_gib:return None
        current_ram=sum(item[1] for item in self.active)
        active=list(self.active)
        heapq.heapify(active)
        t=arrival_ms
        while active and active[0][0]<=t:
            _,ram=heapq.heappop(active)
            current_ram-=ram
        while len(active)>=self.slots or current_ram+memory_gib>self.ram_budget_gib:
            if not active:return None
            t=max(t,active[0][0])
            while active and active[0][0]<=t:
                _,ram=heapq.heappop(active)
                current_ram-=ram
        return t

    def allocate(self,start_ms:int,finish_ms:int,memory_gib:int):
        while self.active and self.active[0][0]<=start_ms:
            heapq.heappop(self.active)
        heapq.heappush(self.active,(finish_ms,memory_gib))
        self.completed+=1
        used=sum(ram for _,ram in self.active)
        self.peak_ram_gib=max(self.peak_ram_gib,used)
        self.peak_jobs=max(self.peak_jobs,len(self.active))
        if used>self.ram_budget_gib or len(self.active)>self.slots:
            raise AssertionError("Limite RAM/slots violee")


def scenario_hosts(assumptions:dict, *,spark_slots=1,epyc_slots=8,failed_ids=()):
    """Profils fictifs exclusifs et memoire locale par machine."""
    plan=plan_topology(**assumptions)
    for n in (spark_slots,epyc_slots):
        if type(n) is not int or not 1<=n<=32:
            raise ValueError("Slots de simulation incorrects (1-32).")
    failed=set(failed_ids)
    hosts=[]
    spark=plan["spark"]
    epyc=plan["epyc"]
    for i in range(spark["planned_systems"]):
        name="spark-"+str(i+1).zfill(3)
        if name in failed:continue
        # Sur Spark : 128 Gio unifies au total, 64 Gio reserves.
        hosts.append(Host(name,"inference",spark_slots,64))
    for i in range(epyc["planned_systems"]):
        name="epyc-"+str(i+1).zfill(3)
        if name in failed:continue
        # Au maximum 75 % de RAM de l'hote en VM, jamais 100 %.
        hosts.append(Host(name,"compute",epyc_slots,
                          int(epyc["assumed_ddr5_ram_gb_per_system"]*0.75)))
    return hosts,plan


def default_tasks(*,inference=320,compute=320,arrival_spacing_ms=30):
    """Charge synthetique : durees fixees pour tester l'ordonnanceur, PAS un benchmark."""
    if type(inference) is not int or type(compute) is not int or \
       inference<0 or compute<0 or inference+compute>MAX_TASKS:
        raise ValueError("Nombre de taches hypothetique invalide.")
    if type(arrival_spacing_ms) is not int or not 0<=arrival_spacing_ms<=60000:
        raise ValueError("Intervalle d'arrivee incorrect.")
    kinds=["inference"]*inference+["compute"]*compute
    # Alternance deterministe sans aleatoire, pas de generation de reponse IA.
    ordered=[]
    for i in range(max(inference,compute)):
        if i<inference:ordered.append("inference")
        if i<compute:ordered.append("compute")
    specs={
        "inference":(16,1800),  # 16 Gio, 1800 ms supposes, non mesures
        "compute":(64,800)      # 64 Gio, 800 ms supposes, non mesures
    }
    return [{"type":kind,"ram_gib":specs[kind][0],
             "duration_ms":specs[kind][1],
             "arrival_ms":i*arrival_spacing_ms}
            for i,kind in enumerate(ordered)]


def simulate(assumptions:dict, jobs:list[dict], *,failed_ids=(),
             spark_slots=1,epyc_slots=8):
    if not isinstance(jobs,list) or len(jobs)>MAX_TASKS:
        raise ValueError("Maximum 10000 taches de simulation.")
    hosts,plan=scenario_hosts(assumptions,spark_slots=spark_slots,
                              epyc_slots=epyc_slots,failed_ids=failed_ids)
    if len(hosts)>MAX_HOSTS:
        raise ValueError("Nombre de machines simulees excessif.")
    summary={"inference":{"submitted":0,"completed":0,"rejected":0,
                           "wait_ms_total":0,"end_ms":0},
             "compute":{"submitted":0,"completed":0,"rejected":0,
                        "wait_ms_total":0,"end_ms":0}}
    end_ms=0
    for job in jobs:
        if not isinstance(job,dict) or job.get("type") not in VALID_KINDS:
            raise ValueError("Type de travail simule invalide.")
        kind=job["type"]
        arrival,ram,duration=(job.get("arrival_ms"),job.get("ram_gib"),
                              job.get("duration_ms"))
        if any(type(v) is not int for v in (arrival,ram,duration)):
            raise ValueError("Entiers de simulation requis.")
        if not 0<=arrival<=600000000 or not 1<=ram<=8192 or not 1<=duration<=3600000:
            raise ValueError("Charge de simulation hors limites.")
        result=summary[kind]
        result["submitted"]+=1
        feasible=[]
        for host in hosts:
            if host.kind!=kind:continue
            when=host.earliest(arrival,ram)
            if when is not None:
                feasible.append((when+duration,when,host.name,host))
        if not feasible:
            result["rejected"]+=1
            continue
        finish,start,_,winner=min(feasible,key=lambda item:item[:3])
        winner.allocate(start,finish,ram)
        result["completed"]+=1
        result["wait_ms_total"]+=start-arrival
        result["end_ms"]=max(result["end_ms"],finish)
        end_ms=max(end_ms,finish)
    for result in summary.values():
        completed=result["completed"]
        result["mean_queue_wait_ms"]=round(result["wait_ms_total"]/completed,3) if completed else None
        del result["wait_ms_total"]
    active_ram_gib=sum(host.ram_budget_gib for host in hosts)
    return {
        "identity":"SPARKTIATES",
        "status":"SIMULE_NON_MESURE",
        "backend":"simulation_pure_software",
        "provisioned_hardware":False,
        "physical_processors_created":0,
        "real_models_executed":0,
        "requests_sent_to_internet":0,
        "is_instruction_set_emulator":False,
        "is_gpu_emulator":False,
        "configured_plan":{"spark":plan["spark"]["planned_systems"],
                           "epyc":plan["epyc"]["planned_systems"],
                           "virtual_containers_planned":plan["spark"]["planned_virtual_containers"],
                           "virtual_machines_planned":plan["epyc"]["planned_virtual_machines"]},
        "simulated_hosts":len(hosts),
        "simulated_inference_slots":sum(h.slots for h in hosts if h.kind=="inference"),
        "simulated_compute_slots":sum(h.slots for h in hosts if h.kind=="compute"),
        "host_local_ram_budget_gib_sum":active_ram_gib,
        "shared_ram_gib":0,
        "failed_host_ids":sorted(set(failed_ids)),
        "simulated_jobs":summary,
        "simulated_completion_time_ms":end_ms,
        "peak_ram_gib_per_host":{h.name:h.peak_ram_gib for h in hosts if h.completed},
        "peak_concurrent_jobs_per_host":{h.name:h.peak_jobs for h in hosts if h.completed},
        "assumptions":{
            "spark_ram_budget_gib":64,
            "epyc_ram_budget_fraction":0.75,
            "spark_slots_per_host":spark_slots,
            "epyc_slots_per_host":epyc_slots,
            "synthetic_inference_job_ms":1800,
            "synthetic_compute_job_ms":800,
            "synthetic_job_ram_gib":{"inference":16,"compute":64}
        },
        "disclaimer":"Les temps, slots, VM, RAM et machines sont simules. Aucun calcul GPU/CPU reel ni mesure de performance n'a ete realise."
    }


def demo():
    document=json.loads((BASE/"topology.plan.json").read_text(encoding="utf-8"))
    if document.get("kind")!="capacity_plan_only_not_live_cluster":
        raise ValueError("Le scenario charge doit etre explicitement un projet non provisionne.")
    return simulate(document["assumptions"],default_tasks())


def main():
    print(json.dumps(demo(),ensure_ascii=False,indent=2))


if __name__=="__main__":
    main()
