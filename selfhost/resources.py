"""Capacites declarees vs detectees pour Radio des IA.
Les profils NVIDIA/AMD servent a DIMENSIONNER, jamais a emuler du materiel.
"""
from __future__ import annotations

import os
import platform
import re
import subprocess
from collections import Counter

GB = 1024 ** 3
FAMILIES = {
    "spark-gb10": {"arch": "aarch64", "cpu_cores_per_system": 20,
                   "memory_gb_per_system": 128, "gpu": "Blackwell GB10",
                   "memory_kind": "unifiee_LPDDR5x", "virtualization": "arm64-containers"},
    "epyc-9006": {"arch": "x86_64", "max_cores_per_socket": 256,
                  "threads_per_socket": 512, "memory_channels_per_socket": 16,
                  "virtualization": "KVM-x86_64"},
    "epyc-9965": {"arch": "x86_64", "max_cores_per_socket": 192,
                  "threads_per_socket": 384, "memory_channels_per_socket": 12,
                  "virtualization": "KVM-x86_64"},
    "wsl-rtx": {"arch": "x86_64", "virtualization": "WSL2"}
}


def read_ram_bytes(proc_path="/proc/meminfo"):
    """RAM accessible au noyau/cgroup courant, et non RAM de tout le reseau."""
    try:
        text = open(proc_path, encoding="ascii").read(20_000)
        found = {}
        for label in ("MemTotal", "MemAvailable"):
            match = re.search(r"^"+label+r":\s+(\d+)\s+kB", text, re.M)
            found[label] = int(match.group(1))*1024 if match else None
        return found
    except (OSError, ValueError):
        return {"MemTotal": None, "MemAvailable": None}


def gpu_info(runner=subprocess.run):
    """Lecture instrumentee NVIDIA, ne suppose pas que nvidia-smi existe sur WSL."""
    try:
        p = runner(["nvidia-smi", "--query-gpu=name,memory.total,memory.free",
                    "--format=csv,noheader,nounits"],
                   capture_output=True, text=True, timeout=3, check=False)
        if p.returncode != 0:
            return []
        cards=[]
        for line in p.stdout.strip().splitlines()[:16]:
            parts=[s.strip() for s in line.split(",")]
            if len(parts)!=3:
                continue
            name=parts[0][:140]
            try:
                total,free=(int(parts[1]),int(parts[2]))
            except ValueError:
                continue
            if total<=0 or free<0 or free>total:
                continue
            cards.append({"name":name,"vram_total_mb":total,"vram_free_mb":free})
        return cards
    except (OSError, subprocess.TimeoutExpired, ValueError):
        return []


def cpu_model():
    try:
        with open("/proc/cpuinfo", encoding="utf-8", errors="replace") as stream:
            for line in stream:
                if line.lower().startswith(("model name", "hardware", "processor")) and ":" in line:
                    name=line.split(":",1)[1].strip()
                    if name and not name.isdecimal():
                        return name[:160]
    except OSError:
        pass
    return ""


def detect_resources(*, arch=None, threads=None, ram=None, gpus=None, cpu=None):
    """Rapport du systeme execute seulement; aucune CPU ou RAM synthetique."""
    arch = arch if arch is not None else platform.machine().lower()
    threads = threads if threads is not None else os.cpu_count()
    ram = ram if ram is not None else read_ram_bytes()
    gpus = gpus if gpus is not None else gpu_info()
    cpu = cpu if cpu is not None else cpu_model()
    cpu_normal=cpu.casefold()
    gpu_names=" ".join(g["name"] for g in gpus).casefold()
    if arch in ("aarch64","arm64") and ("gb10" in gpu_names or "grace blackwell" in cpu_normal):
        family="spark-gb10"
    elif "epyc" in cpu_normal and arch in ("x86_64","amd64"):
        family="epyc-9006" if re.search(r"(9006|venice)",cpu_normal) else (
            "epyc-9965" if "9965" in cpu_normal else "epyc-other")
    elif arch in ("x86_64","amd64") and gpus:
        family="wsl-rtx" if "microsoft" in platform.release().lower() else "x86-gpu"
    else:
        family="other"
    total = ram.get("MemTotal") if isinstance(ram,dict) else None
    available = ram.get("MemAvailable") if isinstance(ram,dict) else None
    return {
        "family":family, "arch":"aarch64" if arch=="arm64" else (
            "x86_64" if arch=="amd64" else arch),
        "cpu_model":cpu[:160], "cpu_logical_threads":int(threads) if isinstance(threads,int) and threads>0 else None,
        "ram_total_bytes":int(total) if isinstance(total,int) and total>0 else None,
        "ram_available_bytes":int(available) if isinstance(available,int) and available>=0 else None,
        "gpus":gpus[:16], "measurement":"worker_os_report",
        "ram_shared_across_network":False
    }


def plan_topology(*, spark=64, epyc=32, epyc_ram_gb=2048,
                  epyc_sockets=2, spark_containers=4, epyc_vms=16,
                  spark_container_ram_gb=16, epyc_vm_ram_gb=64):
    """Scenario HYPOTHETIQUE, jamais un inventaire. Les VM ne creent pas de RAM."""
    inputs=(spark,epyc,epyc_ram_gb,epyc_sockets,spark_containers,epyc_vms,
            spark_container_ram_gb,epyc_vm_ram_gb)
    if any(type(v) is not int for v in inputs):
        raise ValueError("Parametres entiers requis.")
    if not 0<=spark<=4096 or not 0<=epyc<=4096 or not 1<=spark+epyc<=4096:
        raise ValueError("Nombre de machines hors limites (1 a 4096).")
    if epyc_sockets not in (1,2) or not 1<=epyc_ram_gb<=8192:
        raise ValueError("Configuration EPYC non raisonnable ou non precisee.")
    if not 1<=spark_containers<=8 or not 1<=epyc_vms<=64:
        raise ValueError("Nombre de conteneurs ou VM hors limites.")
    if spark_containers*spark_container_ram_gb>64:
        raise ValueError("Conserver au moins 64 Go unifies par Spark pour le modele, l'OS et les services.")
    if epyc_vms*epyc_vm_ram_gb>epyc_ram_gb*0.75:
        raise ValueError("Ne pas depasser 75 % de la RAM EPYC en allocations de VM.")
    spark_ram=spark*128
    epyc_ram=epyc*epyc_ram_gb
    return {
        "mode":"simulation_capacite_seulement",
        "physical_hardware_provisioned":False,
        "registered_nodes":0,
        "online_nodes":0,
        "usable_slots":0,
        "spark":{"planned_systems":spark,"arm_cores_per_system":20,
                 "planned_arm_cores":spark*20,
                 "planned_unified_memory_gb":spark_ram,
                 "virtual_containers_per_system":spark_containers,
                 "planned_virtual_containers":spark*spark_containers,
                 "container_memory_cap_gb":spark_container_ram_gb},
        "epyc":{"planned_systems":epyc,"sockets_per_system":epyc_sockets,
                "max_cores_per_socket_architecture":256,
                "planned_max_x86_cores_if_equipped":epyc*epyc_sockets*256,
                "assumed_ddr5_ram_gb_per_system":epyc_ram_gb,
                "planned_ddr5_ram_gb":epyc_ram,
                "virtual_machines_per_system":epyc_vms,
                "planned_virtual_machines":epyc*epyc_vms,
                "vm_memory_cap_gb":epyc_vm_ram_gb},
        "aggregate_planned_memory_gb_not_shared":spark_ram+epyc_ram,
        "notes":["Les maxima de processeur ne sont pas des machines installees.",
                 "La RAM des DGX Spark est unifiee CPU/GPU, non extensible par ajout logiciel.",
                 "La RAM des machines ne forme pas automatiquement une memoire partagee.",
                 "ARM64 et x86-64 exigent des images de conteneur adapteees.",
                 "Le materiel, les serveurs, la DDR5, les reseaux et l'electricite ont un cout.",
                 "Les vrais noeuds doivent etre ajoutes separement au registre et controles par /health."]
    }
