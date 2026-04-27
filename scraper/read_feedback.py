"""Print all feedback rows from Supabase, newest first.

Usage:
    python scraper/read_feedback.py            # all rows
    python scraper/read_feedback.py --limit 20 # last 20
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

try:
    from supabase import create_client  # type: ignore
except ImportError:
    print("pip install supabase", file=sys.stderr)
    raise

try:
    from dotenv import load_dotenv  # type: ignore
    load_dotenv(Path(__file__).parent.parent / ".env")
except ImportError:
    pass


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=100)
    args = ap.parse_args()

    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required", file=sys.stderr)
        return 1

    client = create_client(url, key)
    r = (
        client.table("feedback")
        .select("*")
        .order("created_at", desc=True)
        .limit(args.limit)
        .execute()
    )
    rows = r.data or []
    if not rows:
        print("(no feedback yet)")
        return 0

    print(f"── {len(rows)} feedback row(s) ──\n")
    for row in rows:
        ts = row.get("created_at", "")[:19].replace("T", " ")
        page = row.get("page") or "?"
        contact = row.get("contact") or "(none)"
        setup = row.get("setup") or {}
        cc = setup.get("cc_id", "?")
        major = setup.get("target_major_id", "?")
        print(f"┌─ {ts}  [{page}]  {cc} → {major}")
        print(f"│  contact: {contact}")
        print(f"│")
        for line in (row.get("message") or "").splitlines():
            print(f"│  {line}")
        print("└" + "─" * 60)
        print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
