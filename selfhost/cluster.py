#!/usr/bin/env python3
"""Radio des IA — addition de vrais noeuds Ollama (aucun coeur fictif).
Orchestrateur LOCAL : HTTP 127.0.0.1:8766, sans CORS public.
"""
from __future__ import annotations
import hmac
from concurrent.futures import ThreadPoolExecutor
import json
import logging
import os
import re
import threading
import time
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from resources import FAMILIES, plan_topology

BASE = Path(__file__).resolve().parent
HOST = "127.0.0.1"
PORT = int(os.environ.get("RADIO_CLUSTER_PORT", "8766"))
MAX_BYTES = 24000
MAX_NODES = 4096  # Garde-fou de configuration, PAS une promesse de puissance.
MAX_SLOTS_PER_NODE = 64
PROBE_TTL_SECONDS = 15
FAILURE_COOLDOWN_SECONDS = 30
REFRESH_BATCH = 64
CLUSTER_KEY = os.environ.get("RADIO_CLUSTER_KEY", "").strip()
DEFAULT_CONFIG = BASE / "cluster.nodes.json"
CONFIG = Path(os.environ.get("RADIO_CLUSTER_CONFIG", str(DEFAULT_CONFIG))).resolve()
ID_PATTERN = re.compile(r"^[a-zA-Z][a-zA-Z0-9_.-]{0,47}$")


class ConfigError(ValueError):
    pass


def parse_nodes(document: dict) -> list["Node"]:
    if not isinstance(document, dict) or not isinstance(document.get("nodes"), list):
        raise ConfigError("Fichier attendu : {\"nodes\": [...]}")
    raw_nodes = document["nodes"]
    if not raw_nodes or len(raw_nodes) > MAX_NODES:
        raise ConfigError("Il faut entre 1 et 4096 noeuds configures.")
    names = set()
    nodes = []
    for entry in raw_nodes:
        if not isinstance(entry, dict):
            raise ConfigError("Noeud incorrect.")
        name = str(entry.get("id", ""))
        url = str(entry.get("url", "")).rstrip("/")
        model = str(entry.get("model", "")).strip()
        try:
            slots = int(entry.get("slots", 1))
        except (TypeError, ValueError) as exc:
            raise ConfigError("slots doit etre un entier.") from exc
        token_env = str(entry.get("token_env", "")).strip()
        family = str(entry.get("hardware_family", "auto")).strip()
        if family not in ("auto", *FAMILIES):
            raise ConfigError("Famille de processeur inconnue. Selectionner un profil materiel reel.")
        if not ID_PATTERN.fullmatch(name) or name in names:
            raise ConfigError("Identifiant de noeud invalide ou duplique.")
        parts = urlsplit(url)
        if parts.username or parts.password or parts.query or parts.fragment or parts.path not in ("", "/"):
            raise ConfigError("Les noeuds doivent etre des origines Web sans chemin ou identifiants.")
        is_local = parts.scheme == "http" and parts.hostname in ("127.0.0.1", "localhost")
        if not is_local and (parts.scheme != "https" or not parts.hostname or "." not in parts.hostname):
            raise ConfigError("Un noeud distant doit employer HTTPS et une adresse explicite.")
        if not is_local and not token_env:
            raise ConfigError("Chaque noeud distant doit avoir un jeton defini par variable d'environnement.")
        if token_env and not re.fullmatch(r"[A-Z_][A-Z0-9_]{1,79}", token_env):
            raise ConfigError("Nom de variable d'environnement du jeton incorrect.")
        if not model or len(model) > 128 or not 1 <= slots <= MAX_SLOTS_PER_NODE:
            raise ConfigError("Modele ou capacite physique du noeud incorrects.")
        names.add(name)
        nodes.append(Node(name, url, model, slots, token_env, hardware_family=family))
    return nodes


def load_nodes(path: Path = CONFIG) -> list["Node"]:
    if not path.is_file():
        raise ConfigError(f"Configuration absente : {path}. Copier cluster.example.json et l'adapter.")
    raw = path.read_text(encoding="utf-8")
    if len(raw) > 700_000:
        raise ConfigError("Configuration de taille excessive.")
    return parse_nodes(json.loads(raw))


@dataclass
class Node:
    id: str
    url: str
    model: str
    slots: int
    token_env: str = ""
    ready: bool = False
    last_check: float = 0.0
    active: int = 0
    completed: int = 0
    errors: int = 0
    cooldown_until: float = 0.0
    last_error: str = ""
    hardware_family: str = "auto"
    reported_hardware: dict = field(default_factory=dict)

    def public(self) -> dict:
        return {"id": self.id, "model": self.model, "configured_slots": self.slots,
                "ready": self.ready, "active": self.active,
                "free_slots": max(0, self.slots-self.active) if self.ready else 0,
                "completed": self.completed, "failures": self.errors,
                "cooldown": self.cooldown_until > time.monotonic(),
                "hardware_family_expected": self.hardware_family,
                "hardware_family_reported": self.reported_hardware.get("family") if self.ready else None,
                "cpu_arch_reported": self.reported_hardware.get("arch") if self.ready else None,
                "cpu_logical_threads_reported": self.reported_hardware.get("cpu_logical_threads") if self.ready else None,
                "ram_total_bytes_reported": self.reported_hardware.get("ram_total_bytes") if self.ready else None,
                "ram_available_bytes_reported": self.reported_hardware.get("ram_available_bytes") if self.ready else None,
                "gpus_reported": len(self.reported_hardware.get("gpus", [])) if self.ready else 0,
                "resource_source": "worker_os_report" if self.ready and self.reported_hardware else "unmeasured"}


def fetch_json(url: str, *, payload: dict | None = None, token: str = "", timeout: float = 4) -> dict:
    headers = {"Accept": "application/json", "User-Agent": "RadioIA-Cluster/0.1"}
    body = None
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = "Bearer " + token
    request = Request(url, data=body, headers=headers)
    with urlopen(request, timeout=timeout) as response:
        data = response.read(120_001)
        if len(data) > 120_000:
            raise ValueError("La reponse du noeud depasse la limite.")
        value = json.loads(data.decode("utf-8"))
        if not isinstance(value, dict):
            raise ValueError("Le noeud ne retourne pas d'objet JSON.")
        return value


class Cluster:
    """Ordonnanceur cooperatif : addition de noeuds, jamais multiplication fictive."""
    def __init__(self, nodes: list[Node], transport=fetch_json, clock=time.monotonic):
        self.nodes = nodes
        self.transport = transport
        self.clock = clock
        self.lock = threading.RLock()
        self.rr = 0
        self.total_requests = 0
        self.refresh_gate = threading.Lock()
        self.refresh_cursor = 0

    def probe(self, node: Node, *, force: bool = False) -> bool:
        now = self.clock()
        with self.lock:
            if not force and now-node.last_check < PROBE_TTL_SECONDS:
                return node.ready and node.cooldown_until <= now
            if node.cooldown_until > now and not force:
                return False
            node.last_check = now
        try:
            if node.token_env and len(os.environ.get(node.token_env, "")) < 32:
                raise RuntimeError("Jeton distant absent, nœud indisponible.")
            token = os.environ.get(node.token_env, "") if node.token_env else ""
            response = self.transport(node.url+"/health", token=token, timeout=3)
            hw = response.get("hardware") if isinstance(response.get("hardware"), dict) else {}
            ready = response.get("ready") is True and response.get("model") == node.model
            reason = "Modèle absent ou non prêt" if not ready else ""
            if ready and node.hardware_family != "auto":
                profile=FAMILIES[node.hardware_family]
                if hw.get("family") != node.hardware_family or hw.get("arch") != profile["arch"]:
                    ready=False
                    reason="Profil physique non détecté : noeud exclu du cluster"
            if ready and hw and hw.get("measurement") != "worker_os_report":
                ready=False
                reason="Rapport materiel sans provenance instrumentee"

        except (OSError, HTTPError, URLError, ValueError, TimeoutError, RuntimeError) as exc:
            ready, reason = False, type(exc).__name__
            hw = {}
        with self.lock:
            node.ready = ready
            node.reported_hardware = hw if ready else {}
            node.last_error = reason
            if ready:
                node.cooldown_until = 0
            return node.ready

    def refresh(self) -> None:
        # Actualisation bornee pour eviter que 4096 machines hors ligne bloquent le controle.
        if not self.refresh_gate.acquire(blocking=False):
            return
        try:
            count = len(self.nodes)
            if not count:
                return
            with self.lock:
                order = [self.nodes[(self.refresh_cursor+i) % count]
                         for i in range(min(REFRESH_BATCH, count))]
                self.refresh_cursor = (self.refresh_cursor + len(order)) % count
            expired = [n for n in order if self.clock()-n.last_check >= PROBE_TTL_SECONDS
                       and n.cooldown_until <= self.clock()]
            if expired:
                with ThreadPoolExecutor(max_workers=min(16, len(expired))) as pool:
                    list(pool.map(self.probe, expired))
        finally:
            self.refresh_gate.release()

    def status(self) -> dict:
        with self.lock:
            result = [n.public() for n in self.nodes]
            return {
                "mode": "cluster_additif", "remote_public_access": False,
                "registered_nodes": len(result),
                "online_nodes": sum(1 for n in result if n["ready"] and not n["cooldown"]),
                "configured_slots": sum(n.slots for n in self.nodes),
                "usable_slots": sum(n["configured_slots"] for n in result if n["ready"] and not n["cooldown"]),
                "free_slots": sum(n["free_slots"] for n in result if not n["cooldown"]),
                "running_jobs": sum(n["active"] for n in result),
                "completed_jobs": sum(n["completed"] for n in result),
                "failed_jobs": sum(n["failures"] for n in result),
                "requests": self.total_requests,
                "nodes": result,
                "reported_ram_gb_online_separate_pools": round(
                    sum(n.reported_hardware.get("ram_total_bytes", 0) or 0
                        for n in self.nodes if n.ready and n.cooldown_until <= self.clock())/1024**3,2),
                "reported_free_ram_gb_online_separate_pools": round(
                    sum(n.reported_hardware.get("ram_available_bytes", 0) or 0
                        for n in self.nodes if n.ready and n.cooldown_until <= self.clock())/1024**3,2),
                "online_hardware_families": sorted(set(n.reported_hardware.get("family")
                    for n in self.nodes if n.ready and n.reported_hardware.get("family"))),
                "notice": "Les slots ne sont pas des coeurs physiques. Les RAM restent separees par machine ; mesures declarees par les OS des noeuds, sans certification tierce."
            }

    def reserve(self, profile: str | None = None, hardware_family: str | None = None,
                min_available_ram_gb: int = 0) -> Node | None:
        with self.lock:
            now = self.clock()
            candidates = [n for n in self.nodes if n.ready and n.cooldown_until <= now
                          and n.active < n.slots
                          and (not profile or profile in ("analyste", "mathematique", "explorateur"))
                          and (not hardware_family or n.reported_hardware.get("family")==hardware_family)
                          and (min_available_ram_gb == 0 or
                               (n.reported_hardware.get("ram_available_bytes") or 0)
                               >= min_available_ram_gb*1024**3)]
            if not candidates:
                return None
            # Moins occupe par slot, egalite avec rotation deterministe.
            count = len(self.nodes)
            ordered = sorted(candidates, key=lambda n:
                (n.active/n.slots, (self.nodes.index(n)-self.rr)%count, n.id))
            selected = ordered[0]
            self.rr = (self.nodes.index(selected)+1)%count
            selected.active += 1
            self.total_requests += 1
            return selected

    def complete(self, node: Node, ok: bool) -> None:
        with self.lock:
            node.active = max(0, node.active-1)
            if ok:
                node.completed += 1
                node.last_error = ""
            else:
                node.errors += 1
                node.ready = False
                node.cooldown_until = self.clock()+FAILURE_COOLDOWN_SECONDS

    def chat(self, payload: dict) -> dict:
        if not isinstance(payload, dict):
            raise ValueError("Charge utile JSON requise.")
        message = payload.get("message")
        if not isinstance(message, str) or not 1 <= len(message.strip()) <= 2600:
            raise ValueError("Message requis, longueur maximale de 2600 caracteres.")
        profile = payload.get("profile", "analyste")
        if profile not in ("analyste", "mathematique", "explorateur"):
            raise ValueError("Profil inconnu.")
        history = payload.get("history", [])
        if not isinstance(history, list) or len(history) > 12:
            raise ValueError("Historique invalide (maximum 12 tours).")
        for entry in history:
            if not isinstance(entry, dict) or entry.get("role") not in ("user", "assistant") \
               or not isinstance(entry.get("content"), str) or len(entry["content"]) > 900:
                raise ValueError("Un element de l'historique est incorrect.")
        family = payload.get("hardware_family")
        if family is not None and family not in FAMILIES:
            raise ValueError("Famille materielle inconnue.")
        min_ram = payload.get("min_available_ram_gb", 0)
        if type(min_ram) is not int or min_ram < 0 or min_ram > 8192:
            raise ValueError("Memoire RAM demandee incorrecte.")
        self.refresh()
        node = self.reserve(profile, family, min_ram)
        if node is None:
            raise RuntimeError("Tous les noeuds reels sont hors ligne ou occupes.")
        try:
            token = os.environ.get(node.token_env, "") if node.token_env else ""
            if node.token_env and len(token) < 32:
                raise RuntimeError("Jeton de noeud absent ou insuffisant.")
            answer = self.transport(node.url+"/api/chat", payload={
                "message": message, "history": history, "profile": profile,
                "web": payload.get("web") is True
            }, token=token, timeout=195)
            if not isinstance(answer.get("answer"), str) or not answer["answer"].strip():
                raise RuntimeError("Le noeud n'a pas rendu de reponse exploitable.")
            self.complete(node, True)
            return {
                "answer": answer["answer"][:12000], "node_id": node.id,
                "model": answer.get("model", node.model), "provider": "Radio des IA WSL — Ollama",
                "sources": answer.get("sources", [])[:8] if isinstance(answer.get("sources"), list) else [],
                "web_warnings": answer.get("web_warnings", [])[:5] if isinstance(answer.get("web_warnings"), list) else [],
                "usage": answer.get("usage", {})
            }
        except Exception:
            self.complete(node, False)
            raise


class Handler(BaseHTTPRequestHandler):
    """Interface locale, sans acces navigateur externe ni divulgation de jeton."""
    protocol_version = "HTTP/1.1"
    cluster: Cluster = None

    def log_message(self, *_args):
        pass

    def reply(self, status: int, data: dict) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.end_headers()
        self.wfile.write(body)

    def auth_ok(self) -> bool:
        # Meme derriere un futur tunnel, refuser les origines publiques
        # tant qu'une passerelle securisee n'a pas ete validee.
        host = self.headers.get("Host", "")
        origin = self.headers.get("Origin")
        if origin and origin not in ("http://"+host, "https://"+host):
            return False
        if not CLUSTER_KEY:
            return True  # Port 127.0.0.1 seulement.
        return hmac.compare_digest(self.headers.get("Authorization", ""),
                                   "Bearer "+CLUSTER_KEY)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/v1/status":
            if not self.auth_ok():
                return self.reply(403, {"error": "Origine ou jeton invalide."})
            self.cluster.refresh()
            return self.reply(200, self.cluster.status())
        if path == "/api/v1/plan":
            if not self.auth_ok():
                return self.reply(403, {"error": "Origine ou jeton invalide."})
            try:
                document=json.loads((BASE / "topology.plan.json").read_text(encoding="utf-8"))
                if document.get("kind") != "capacity_plan_only_not_live_cluster":
                    raise ValueError("Type de plan invalide.")
                return self.reply(200, plan_topology(**document["assumptions"]))
            except (OSError, ValueError, KeyError, TypeError) as error:
                return self.reply(503, {"error": "Plan de simulation indisponible ("+
                                   type(error).__name__+")."})
        assets = {
            "/": ("cluster-console.html", "text/html; charset=utf-8"),
            "/cluster-console.mjs": ("cluster-console.mjs", "text/javascript; charset=utf-8"),
            "/node-ui.css": ("node-ui.css", "text/css; charset=utf-8")
        }
        if path not in assets:
            return self.reply(404, {"error": "Route inconnue."})
        filename, mime = assets[path]
        data = (BASE / filename).read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'")
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if self.path != "/api/v1/chat":
            return self.reply(404, {"error": "Route inconnue."})
        if not self.auth_ok():
            return self.reply(403, {"error": "Acces refuse : origine ou jeton."})
        if not self.headers.get("Content-Type", "").lower().startswith("application/json"):
            return self.reply(415, {"error": "JSON requis."})
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            size = 0
        if size <= 0 or size > MAX_BYTES:
            return self.reply(413, {"error": "Requete trop volumineuse."})
        try:
            data = json.loads(self.rfile.read(size).decode("utf-8"))
            response = self.cluster.chat(data)
            self.reply(200, response)
        except ValueError as exc:
            self.reply(400, {"error": str(exc)[:220]})
        except RuntimeError as exc:
            self.reply(503, {"error": str(exc)[:220]})
        except Exception:
            logging.exception("Echec du dispatch, texte du prompt non journalise")
            self.reply(502, {"error": "Noeud non disponible. Aucun retry automatique."})


def main() -> None:
    nodes = load_nodes()
    cluster = Cluster(nodes)
    Handler.cluster = cluster
    def maintenance():
        while True:
            try:
                cluster.refresh()
            except Exception:
                logging.exception("Vérification des nœuds indisponible.")
            time.sleep(3)
    threading.Thread(target=maintenance, daemon=True, name="radio-cluster-health").start()
    print("RADIO_CLUSTER=LOCAL_READY", flush=True)
    print(f"NODES_CONFIGURES={len(nodes)} SLOTS_CONFIGURES={sum(n.slots for n in nodes)}", flush=True)
    print("ACCES_PUBLIC=DESACTIVE 127.0.0.1:"+str(PORT), flush=True)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    try:
        server.serve_forever()
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
