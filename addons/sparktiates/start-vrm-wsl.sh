#!/usr/bin/env bash
# SPARKTIATES VRM — lancement réel sous WSL/Linux.
# Ne crée aucun serveur distant imaginaire et n'expose aucune API sur Internet.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
if ! command -v node >/dev/null 2>&1; then
  echo "ERREUR : Node.js n'est pas installé dans WSL." >&2
  exit 1
fi
if [ ! -f "$ROOT/addons/sparktiates/radio-server.mjs" ]; then
  echo "ERREUR : sources SPARKTIATES introuvables." >&2
  exit 1
fi
export SPARKTIATES_VRM_FILE="$HOME/.sparktiates/radio-vrm/events.jsonl"
TOKEN_FILE="$HOME/.sparktiates/radio-vrm/access-token"
mkdir -p "$(dirname "$TOKEN_FILE")"
chmod 700 "$(dirname "$TOKEN_FILE")"
if [ ! -s "$TOKEN_FILE" ]; then
  umask 077
  node --input-type=commonjs -e \
    'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex")+"\n")' > "$TOKEN_FILE"
  chmod 600 "$TOKEN_FILE"
fi
export SPARKTIATES_ACCESS_TOKEN="$(tr -d '\r\n' < "$TOKEN_FILE")"
export SPARKTIATES_RADIO_PORT="8788"
echo "================================================"
echo " SPARKTIATES — MÉMOIRE VRM PERSISTANTE"
echo "================================================"
echo " Fichier : $SPARKTIATES_VRM_FILE"
echo " API locale : http://127.0.0.1:8788"
echo " Jeton privé : conservé dans $TOKEN_FILE"
echo " Le jeton n'est pas imprimé."
echo " Pour le téléphone : HTTPS authentifié nécessaire."
echo " Ollama reste facultatif pour les archives VRM."
echo "================================================"
cd "$ROOT"
exec node addons/sparktiates/radio-server.mjs
