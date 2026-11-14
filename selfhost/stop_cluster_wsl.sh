#!/usr/bin/env bash
set -Eeuo pipefail
STATE="$HOME/.local/state/radio-des-ia-cluster"
for item in cluster node; do
  path="$STATE/$item.pid"
  if [ ! -f "$path" ]; then
    echo "$item=PID_INCONNU"
    continue
  fi
  read -r pid < "$path"
  if [[ ! "$pid" =~ ^[0-9]+$ ]]; then
    echo "$item=PID_INVALIDE"
    continue
  fi
  cmdline="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
  expected="cluster.py"
  [ "$item" = node ] && expected="server.py"
  if [[ "$cmdline" == *"$expected"* ]]; then
    kill "$pid" || true
    echo "$item=ARRETE"
    rm -f "$path"
  else
    echo "$item=PAS_TOUCHE_AUTRE_PROCESSUS"
  fi
done
echo "RADIO_PUBLIQUE=INCHANGEE"
