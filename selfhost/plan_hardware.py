#!/usr/bin/env python3
"""Plan de dimensionnement uniquement: pas de VM creee ni de calcul facturable."""
from __future__ import annotations
import json
from pathlib import Path
from resources import plan_topology

path=Path(__file__).with_name("topology.plan.json")
with path.open(encoding="utf-8") as f:
    plan=json.load(f)
if plan.get("kind")!="capacity_plan_only_not_live_cluster":
    raise ValueError("Ce plan n'est pas un inventaire de vrais serveurs.")
values=plan_topology(**plan["assumptions"])
print(json.dumps({"scenario":values,"disclosure":plan["disclosure"]},
                 ensure_ascii=False,indent=2))
