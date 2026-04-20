"""Upsert Cal-GETC area assignments into Supabase.

Input: JSON produced by scraper/dvc_calgetc.py
  { areas: { "1A": ["ENGL C1000", ...], ... }, uc_cap_courses: [...] }

Strategy:
  - For each (area, code): look up course by (school_id, code). If found, set
    cal_getc_area = area. If not found, log as missing (the DVC catalog scrape
    doesn't cover that department yet).
  - Before writing: clear cal_getc_area on all DVC courses so the PDF is the
    sole source of truth (prevents stale hand-seeded values).

Env: SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY

Usage:
    python scraper/upsert_calgetc.py scraper/samples/dvc_calgetc.json \\
        --school-id dvc
"""
from __future__ import annotations

import argparse
import json
import os
import re
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


def normalize_code(code: str) -> str:
    """Normalize a course code for fuzzy matching across prefix renames.
    e.g. 'COMM 120' and 'SPCH 120' won't match; but 'MATH 192' and 'MATH-192'
    both become 'math192'. Strip all non-alphanumerics, lowercase."""
    return re.sub(r"[^a-z0-9]+", "", code.lower())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("input", type=Path)
    ap.add_argument("--school-id", required=True)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    data = json.loads(args.input.read_text())
    areas = data.get("areas") or {}
    catalog = data.get("catalog") or {}
    total = sum(len(v) for v in areas.values())
    print(f"input: {len(areas)} areas, {total} course-area mappings, "
          f"{len(catalog)} catalog entries")

    client = connect()

    # 1) Fetch all DVC courses to build code -> id lookup.
    resp = client.table("courses").select("id,code").eq("school_id", args.school_id).execute()
    db_courses = resp.data or []
    code_to_id: dict[str, str] = {}
    for c in db_courses:
        code_to_id[normalize_code(c["code"])] = c["id"]
    print(f"  db has {len(db_courses)} {args.school_id} courses")

    # 2) Build (course_id -> area) mapping. If a course appears in multiple
    # areas, keep the first (a Cal-GETC course can satisfy only one area per
    # student anyway — first-listed is fine for default display).
    # For codes not yet in DB, queue as new-insert using PDF catalog meta.
    def make_id(code: str) -> str:
        return f"{args.school_id}_" + normalize_code(code)

    assignments: dict[str, str] = {}     # existing course_id -> area
    new_inserts: list[dict] = []         # rows for missing courses
    new_assignments: dict[str, str] = {} # new course_id -> area
    seen_new: set[str] = set()

    # Area priority: 6 (Ethnic Studies) overrides any earlier area, since it's
    # a distinct graduation requirement. Other areas: first-listed wins (a
    # course that happens to appear in multiple GE buckets defaults to the
    # earliest / most-common usage).
    def should_override(existing_area: str, new_area: str) -> bool:
        return new_area == "6" and existing_area != "6"

    for area, codes in areas.items():
        for code in codes:
            cid = code_to_id.get(normalize_code(code))
            if cid:
                if cid not in assignments or should_override(assignments[cid], area):
                    assignments[cid] = area
                continue
            # Missing — insert stub from PDF catalog
            meta = catalog.get(code)
            if not meta:
                continue
            new_id = make_id(code)
            if new_id not in seen_new:
                seen_new.add(new_id)
                new_inserts.append({
                    "id": new_id,
                    "school_id": args.school_id,
                    "code": code,
                    "name": meta["name"],
                    "units": meta["units"],
                })
            if new_id not in new_assignments or should_override(new_assignments[new_id], area):
                new_assignments[new_id] = area

    print(f"  matched existing: {len(assignments)} courses")
    print(f"  new inserts: {len(new_inserts)} courses (from PDF catalog)")
    dropped = total - len(assignments) - sum(
        1 for area, codes in areas.items() for c in codes
        if normalize_code(c) not in {normalize_code(x["code"]) for x in new_inserts}
        and code_to_id.get(normalize_code(c)) is None
    )
    # simpler: compute dropped as codes with no catalog entry
    no_meta = [(a, c) for a, codes in areas.items() for c in codes
               if code_to_id.get(normalize_code(c)) is None and c not in catalog]
    print(f"  dropped (no metadata): {len(no_meta)}")
    if no_meta[:3]:
        print(f"    e.g. {no_meta[:3]}")

    if args.dry_run:
        print("(dry run — skipping writes)")
        return 0

    # 3) Insert missing courses (stubs with name/units from PDF).
    if new_inserts:
        for i in range(0, len(new_inserts), 100):
            chunk = new_inserts[i : i + 100]
            client.table("courses").upsert(chunk, on_conflict="id").execute()
        print(f"  ✓ inserted {len(new_inserts)} new courses")

    # 4) Clear existing cal_getc_area for school, then set fresh.
    client.table("courses").update({"cal_getc_area": None}) \
        .eq("school_id", args.school_id).execute()
    print(f"  ✓ cleared cal_getc_area for {args.school_id}")

    # 5) Apply assignments (existing + newly inserted) grouped by area.
    all_assignments = {**assignments, **new_assignments}
    by_area: dict[str, list[str]] = {}
    for cid, area in all_assignments.items():
        by_area.setdefault(area, []).append(cid)

    for area, ids in sorted(by_area.items()):
        for i in range(0, len(ids), 200):
            chunk = ids[i : i + 200]
            client.table("courses").update({"cal_getc_area": area}) \
                .in_("id", chunk).execute()
        print(f"  ✓ {area}: {len(ids)} courses")

    print("done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
