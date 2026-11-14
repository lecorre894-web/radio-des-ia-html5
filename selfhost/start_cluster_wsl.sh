#!/usr/bin/env bash
# Radio des IA — lancement WSL local additif. Rien ne touche au Salon GitHub Pages.
set -Eeuo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
PORT_NODE="$(printenv RADIO_NODE_PORT || echo 8765)"
PORT_CLUSTER="$(printenv RADIO_CLUSTER_PORT || echo 8766)"
MODEL="$(printenv RADIO_LOCAL_MODEL || echo qwen3:8b)"
STATE="$HOME/.local/state/radio-des-ia-cluster"
mkdir -p "$STATE"
for cmd in python3 curl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "PREREQUIS_ABSENT=$cmd"; exit 2
  fi
done
if [ ! -f cluster.nodes.json ]; then
  cp cluster.example.json cluster.nodes.json
  echo "CONFIG_CLUSTER=CREEE_LOCAL_SEULEMENT"
fi
python3 -m py_compile server.py cluster.py
if ! RADIO_LOCAL_MODEL="$MODEL" python3 - <<'PY'
import json,os,sys,urllib.request
model=os.environ.get("RADIO_LOCAL_MODEL","qwen3:8b")
try:
    with urllib.request.urlopen("http://127.0.0.1:11434/api/tags",timeout=4) as r:
        models=json.load(r).get("models",[])
    valid=any(m.get("name")==model or m.get("model")==model for m in models)
except Exception:
    valid=False
if not valid:
    print("OLLAMA_MODELE_ABSENT="+model)
    print("Installer Ollama puis, si accepte : ollama pull "+model)
sys.exit(0 if valid else 2)
PY
then
  exit 2
fi
for port in "$PORT_NODE" "$PORT_CLUSTER"; do
  if python3 - "$port" <<'PY'
import socket,sys
s=socket.socket()
result=s.connect_ex(("127.0.0.1",int(sys.argv[1])))
s.close()
sys.exit(0 if result==0 else 1)
PY
  then
    echo "PORT_DEJA_OCCUPE=$port — aucun processus modifie"
    exit 3
  fi
done
nodepid=""
clusterpid=""
cleanup(){
  if [ -n "$clusterpid" ]; then kill "$clusterpid" 2>/dev/null || true; fi
  if [ -n "$nodepid" ]; then kill "$nodepid" 2>/dev/null || true; fi
}
trap cleanup ERR
nohup python3 -u server.py > "$STATE/node.log" 2>&1 < /dev/null &
nodepid=$!
nohup python3 -u cluster.py > "$STATE/cluster.log" 2>&1 < /dev/null &
clusterpid=$!
sleep 2
if ! curl --fail --silent --max-time 5 "http://127.0.0.1:$PORT_NODE/health" > "$STATE/health.json"; then
  echo "ERREUR_NODE=NOT_READY"; tail -n 10 "$STATE/node.log"; exit 4
fi
if ! curl --fail --silent --max-time 5 "http://127.0.0.1:$PORT_CLUSTER/api/v1/status" > "$STATE/status.json"; then
  echo "ERREUR_CLUSTER=NOT_READY"; tail -n 10 "$STATE/cluster.log"; exit 5
fi
printf "%s\n" "$nodepid" > "$STATE/node.pid"
printf "%s\n" "$clusterpid" > "$STATE/cluster.pid"
trap - ERR
echo "=============================="
echo "RADIO_IA_CLUSTER=STARTED_LOCAL_ONLY"
echo "WSL_NODE_PID=$nodepid"
echo "WSL_CLUSTER_PID=$clusterpid"
echo "NODE_HEALTH=http://127.0.0.1:$PORT_NODE/health"
echo "CLUSTER_DASHBOARD=http://127.0.0.1:$PORT_CLUSTER/"
echo "RADIO_PUBLIQUE=INCHANGEE"
echo "WEB_RECHERCHE=DESACTIVEE_PAR_DEFAUT"
echo "MESURES_PHYSIQUES=NON_BENCHMARKEES"
echo "LOGS=$STATE"
echo "=============================="
