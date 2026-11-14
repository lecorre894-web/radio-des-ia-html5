#!/usr/bin/env bash
# Modèles scientifiques SPARKTIATES sous WSL; aucun abonnement.
# Aucun téléchargement sans --install ou --gpt-oss.
set -Eeuo pipefail
MODE="--check"
if [ "$#" -gt 0 ]; then MODE="$1"; fi
case "$MODE" in
  --check|--install|--gpt-oss) ;;
  *) echo "USAGE: bash setup_research_wsl.sh [--check|--install|--gpt-oss]"; exit 2 ;;
esac
if ! command -v ollama >/dev/null 2>&1; then
  echo "OLLAMA=ABSENT — installer Ollama sur le PC avant d'activer les modèles."
  echo "RADIO_IA=INCHANGEE"
  exit 2
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "PYTHON=ABSENT"; exit 2
fi
if ! python3 - <<'PY'
import json,sys,urllib.request
try:
    with urllib.request.urlopen("http://127.0.0.1:11434/api/tags",timeout=3) as response:
        data=json.load(response)
    ok=isinstance(data.get("models"),list)
except Exception:
    ok=False
print("OLLAMA_SERVICE="+("PRET" if ok else "INACCESSIBLE"))
sys.exit(0 if ok else 2)
PY
then
  echo "Démarrer Ollama avant de poursuivre. Aucun modèle téléchargé."
  exit 2
fi
MODELS=""
if [ "$MODE" = "--install" ]; then
  echo "MODE=TELECHARGEMENT_EXPLICITE"
  echo "MODELES=QWEN3_14B DEEPSEEK_R1_14B"
  echo "Espace disque: prévoir au moins 25 Go libres et mesurer la mémoire GPU."
  MODELS="qwen3:14b deepseek-r1:14b"
elif [ "$MODE" = "--gpt-oss" ]; then
  echo "MODE=TELECHARGEMENT_EXPLICITE_GPT_OSS_20B"
  echo "Attention : téléchargement d'environ 14 Go, mémoire supplémentaire pour le contexte."
  MODELS="gpt-oss:20b"
else
  echo "MODE=VERIFICATION_SANS_TELECHARGEMENT"
fi
for model in $MODELS; do
  echo "OLLAMA_PULL_DEMANDE=$model"
  ollama pull "$model" || { echo "MODELE_TELECHARGEMENT_ECHOUE=$model"; exit 3; }
done
python3 - <<'PY'
import json,urllib.request
with urllib.request.urlopen("http://127.0.0.1:11434/api/tags",timeout=8) as response:
    models=json.load(response).get("models",[])
active=sorted(m["name"] for m in models if isinstance(m,dict)
              and isinstance(m.get("name"),str)
              and m["name"].startswith(("qwen3:","deepseek-r1:","gpt-oss:")))
print("==============================")
print("SPARKTIATES_MODELES_LOCAUX")
for name in active:
    print("MODELE_INSTALLE="+name)
print("MODELE_DOCTORAL_ACTIF="+("A_VALIDER_PAR_CONVERSATION" if active else "AUCUN"))
print("RADIO_ORIGINALE=NON_MODIFIEE")
print("ABONNEMENT_API=NON_REQUIS")
print("GPU_MEMOIRE_PERFORMANCE=NON_BENCHMARKES")
print("==============================")
PY
