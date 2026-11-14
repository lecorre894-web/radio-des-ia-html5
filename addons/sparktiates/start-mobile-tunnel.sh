#!/usr/bin/env bash
# Tunnel mobile facultatif pour SPARKTIATES. Doit être lancé consciemment
# après start-radio.sh dans un second terminal. Ne démarre aucun serveur caché.
set -euo pipefail
if ! command -v cloudflared >/dev/null 2>&1; then
  echo "ERREUR: cloudflared n'est pas installé." >&2
  echo "Consulte la documentation Cloudflare Tunnel ; aucune installation automatique." >&2
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "ERREUR: curl requis." >&2
  exit 1
fi
if ! curl -fsS --max-time 4 http://127.0.0.1:8788/health >/dev/null; then
  echo "ERREUR: SPARKTIATES Radio n'est pas démarré. Lance start-radio.sh d'abord." >&2
  exit 1
fi
echo "SPARKTIATES: ouverture volontaire d'un tunnel HTTPS temporaire."
echo "L'adresse HTTPS affichée par cloudflared peut être recopiée dans la Radio sur Android."
echo "Tout possesseur de l'adresse peut atteindre le serveur, MAIS les routes IA exigent le jeton privé."
echo "Garde ton jeton secret et n'enregistre aucune donnée sensible sur ce pont."
echo "Fermer ce terminal arrête le tunnel ; le nom DNS change au prochain démarrage."
echo
exec cloudflared tunnel --url http://127.0.0.1:8788
