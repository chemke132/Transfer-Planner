"""assist.org scraper — pulls articulation data for a given CC/major/target.

Strategy:
  1) Try the unofficial JSON endpoints first (fast, stable-ish).
  2) Fall back to Playwright if the JSON shape changes or blocks us.

Env vars:
  SUPABASE_URL, SUPABASE_SERVICE_KEY — for upserts.
"""
from __future__ import annotations

import os
import sys
import json
from typing import Any

import httpx
from dotenv import load_dotenv

load_dotenv()

ASSIST_BASE = "https://assist.org/api"


def fetch_institutions() -> list[dict[str, Any]]:
    r = httpx.get(f"{ASSIST_BASE}/institutions", timeout=30)
    r.raise_for_status()
    return r.json()


def fetch_agreements(sending_id: int, receiving_id: int) -> dict[str, Any]:
    url = f"{ASSIST_BASE}/agreements"
    r = httpx.get(
        url,
        params={"receivingInstitutionId": receiving_id, "sendingInstitutionId": sending_id},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


def upsert_to_supabase(table: str, rows: list[dict[str, Any]]) -> None:
    from supabase import create_client

    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]
    client = create_client(url, key)
    if not rows:
        return
    client.table(table).upsert(rows).execute()


def main() -> int:
    institutions = fetch_institutions()
    dvc = next((i for i in institutions if "Diablo Valley" in i.get("names", [{}])[0].get("name", "")), None)
    if not dvc:
        print("Could not find DVC in institutions list", file=sys.stderr)
        return 1
    print(json.dumps({"dvc_id": dvc.get("id")}, indent=2))
    # TODO: walk agreements for each UC target, normalize to our schema, upsert.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
