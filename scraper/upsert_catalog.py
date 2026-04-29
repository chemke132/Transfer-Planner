"""Upsert parsed DVC catalog data into Supabase.

Input: JSON produced by scraper/dvc_catalog.py
  { courses: [...], prerequisites: [...] }

Writes:
  - courses table: upserts name/units/description (keeps existing assist_id)
  - prerequisites table: clears and re-inserts for the scraped school

Env: SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY

Usage:
    python scraper/upsert_catalog.py scraper/samples/dvc_catalog_*.json \\
        --school-id dvc
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

try:
    from supabase import Client, create_client  # type: ignore
except ImportError:
    print("pip install supabase", file=sys.stderr)
    raise

try:
    from dotenv import load_dotenv  # type: ignore
    load_dotenv(Path(__file__).parent.parent / ".env")
except ImportError:
    pass


def connect() -> Client:
    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required", file=sys.stderr)
        sys.exit(1)
    return create_client(url, key)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("input", type=Path)
    ap.add_argument("--school-id", required=True)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    data = json.loads(args.input.read_text())
    courses = data.get("courses") or []
    prereqs = data.get("prerequisites") or []
    print(f"input: {len(courses)} courses, {len(prereqs)} prereqs")

    if args.dry_run:
        print("(dry run — skipping Supabase writes)")
        return 0

    client = connect()

    # 1) Upsert courses. Don't clobber assist_id or cal_getc_area (those come
    # from other sources). Use on_conflict=id so Postgres merges.
    rows = []
    for c in courses:
        rows.append(
            {
                "id": c["id"],
                "school_id": c["school_id"],
                "code": c["code"],
                "name": c["name"],
                "units": c["units"],
                "description": c.get("description"),
            }
        )
    # Chunk to stay well under any payload limits.
    for i in range(0, len(rows), 100):
        chunk = rows[i : i + 100]
        client.table("courses").upsert(chunk, on_conflict="id").execute()
    print(f"  ✓ upserted {len(rows)} courses")

    # 2) Replace prereqs only for the courses we just scraped. This preserves
    # prereq rows for courses in other departments that weren't re-scraped.
    scraped_ids = [c["id"] for c in courses]
    if scraped_ids:
        # Chunk deletes (Supabase URL length limits on IN lists)
        for i in range(0, len(scraped_ids), 200):
            chunk = scraped_ids[i : i + 200]
            client.table("prerequisites").delete().in_("course_id", chunk).execute()
        print(f"  ✓ cleared existing prereqs for {len(scraped_ids)} scraped courses")

    if prereqs:
        # Insert in chunks
        for i in range(0, len(prereqs), 200):
            chunk = prereqs[i : i + 200]
            client.table("prerequisites").insert(chunk).execute()
        print(f"  ✓ inserted {len(prereqs)} prerequisites")

    # 3) Replace course_prereq_options for the scraped courses.
    prereq_options = data.get("prereq_options") or []
    if scraped_ids:
        for i in range(0, len(scraped_ids), 200):
            chunk = scraped_ids[i : i + 200]
            client.table("course_prereq_options").delete().in_(
                "course_id", chunk
            ).execute()
        print(f"  ✓ cleared course_prereq_options for {len(scraped_ids)} courses")
    if prereq_options:
        for i in range(0, len(prereq_options), 200):
            chunk = prereq_options[i : i + 200]
            client.table("course_prereq_options").insert(chunk).execute()
        print(f"  ✓ inserted {len(prereq_options)} prereq options")

    print("done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
