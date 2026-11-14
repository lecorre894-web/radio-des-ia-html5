#!/usr/bin/env bash
# SPARKTIATES Radio / Ollama launcher
# Lance à la demande uniquement : n'installe ni ne télécharge de modèle.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONF_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/sparktiates"
TOKEN_FILE="$CONF_DIR/radio-access-token"

if ! command -v node >/dev/null 2>&1; then
  echo "ERREUR: Node.js 20+ absent dans WSL." >&2
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "ERREUR: curl est requis pour vérifier Ollama." >&2
  exit 1
fi
if ! curl -fsS --max-time 5 http://127.0.0.1:11434/api/tags >/dev/null; then
  echo "ERREUR: Ollama n'est pas actif sur 127.0.0.1:11434." >&2
  echo "Démarre Ollama sur ce PC et installe au moins un vrai modèle." >&2
  echo "Le pont ne crée pas de GPU et ne remplace pas Ollama." >&2
  exit 1
fi
mkdir -p "$CONF_DIR"
chmod 700 "$CONF_DIR"
if [ ! -s "$TOKEN_FILE" ]; then
  if command -v openssl >/dev/null 2>&1; then
    umask 077
    openssl rand -hex 32 > "$TOKEN_FILE"
  else
    echo "ERREUR: openssl est requis pour générer un jeton sécurisé." >&2
    exit 1
  fi
fi
chmod 600 "$TOKEN_FILE"
export SPARKTIATES_ACCESS_TOKEN="$(cat "$TOKEN_FILE")"
echo "======================================"
echo " SPARKTIATES RADIO / OLLAMA"
echo "======================================"
echo "Passerelle locale : http://127.0.0.1:8788"
echo "Jeton privé : $SPARKTIATES_ACCESS_TOKEN"
echo "Jeton conservé uniquement sur ce PC : $TOKEN_FILE"
echo "Modèles : interrogation dans le Salon Radio des IA"
echo "Aucun crédit Pollinations / Puter consommé"
echo "Depuis Android : créer un tunnel HTTPS authentifié vers le PC"
echo "Ce lanceur NE publie PAS de serveur sur Internet."
echo "Arrêt : Ctrl+C"
echo "======================================"
cd "$ROOT"
exec node addons/sparktiates/radio-server.mjs
