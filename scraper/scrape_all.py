"""Batch articulation scraper — for every major published on assist.org
for a given (CC, UC) pair, fetch the articulation JSON, parse it, and
upsert everything (target_majors, transfer_paths, courses, articulations,
options, requirements) into Supabase.

Resumable: caches the agreement list and per-key articulation JSONs under
scraper/samples/cache/<uc_id>/. Re-running skips already-fetched keys.

Usage:
    python scraper/scrape_all.py --cc-id dvc --uc-id ucb \\
        --sending "Diablo Valley College" \\
        --receiving "University of California, Berkeley"

    # resume only (no network, re-upsert from cached JSON):
    python scraper/scrape_all.py --cc-id dvc --uc-id ucb --no-fetch

Env: SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

import httpx

# Allow importing parse.py as a sibling module regardless of CWD.
sys.path.insert(0, str(Path(__file__).parent))
from parse import parse_agreement  # type: ignore

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


ASSIST_ORIGIN = "https://assist.org"
ASSIST_BASE = f"{ASSIST_ORIGIN}/api"
SAMPLES = Path(__file__).parent / "samples"
SAMPLES.mkdir(exist_ok=True)

HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "User-Agent": "Mozilla/5.0 TransferPlannerScraper",
    "Referer": f"{ASSIST_ORIGIN}/",
}


# ── Supabase helpers ─────────────────────────────────────────────────────

def connect() -> Client:
    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required", file=sys.stderr)
        sys.exit(1)
    return create_client(url, key)


def _course_id(school_id: str, code: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "", code.lower())
    return f"{school_id}_{slug}"


# ── assist.org session ───────────────────────────────────────────────────

def bootstrap(client: httpx.Client) -> None:
    r = client.get(f"{ASSIST_ORIGIN}/", headers={"Accept": "text/html"})
    r.raise_for_status()
    xsrf = client.cookies.get("X-XSRF-TOKEN")
    if not xsrf:
        raise RuntimeError("No XSRF cookie")
    client.headers["X-XSRF-TOKEN"] = xsrf


def find_institution(institutions: list[dict], name: str) -> dict | None:
    lower = name.lower()
    for inst in institutions:
        for n in inst.get("names") or []:
            if n.get("name", "").lower() == lower:
                return inst
    for inst in institutions:
        for n in inst.get("names") or []:
            if lower in n.get("name", "").lower():
                return inst
    return None


def latest_published_year(
    client: httpx.Client, receiving_id: int, sending_id: int
) -> int:
    years = client.get(f"{ASSIST_BASE}/AcademicYears").json()
    years.sort(key=lambda y: y.get("Id", 0), reverse=True)
    for y in years[:6]:
        cats = client.get(
            f"{ASSIST_BASE}/agreements/categories",
            params={
                "receivingInstitutionId": receiving_id,
                "sendingInstitutionId": sending_id,
                "academicYearId": y["Id"],
            },
        ).json()
        major = next((c for c in cats if c.get("code") == "major"), None)
        if major and major.get("hasReports"):
            return y["Id"]
    raise RuntimeError("No published year with major agreements")


# ── slug / id helpers ────────────────────────────────────────────────────

_DEGREE_RE = re.compile(r",?\s*B\.?(A|S)(?:\.|\s)*( and B\.?(A|S)\.?)?\s*$", re.I)


def major_key(label: str) -> str:
    """'Mathematics/Applied Mathematics, B.A.' -> 'mathematics_applied_mathematics'"""
    # strip trailing degree suffix
    clean = _DEGREE_RE.sub("", label).strip()
    slug = re.sub(r"[^a-z0-9]+", "_", clean.lower()).strip("_")
    return slug or "unknown"


def major_id(uc_id: str, label: str) -> str:
    return f"{uc_id}_{major_key(label)}"


def path_id_for(cc_id: str, uc_id: str, label: str) -> str:
    return f"{cc_id}_{uc_id}_{major_key(label)}"


# ── caching ──────────────────────────────────────────────────────────────

def cache_dir(uc_id: str) -> Path:
    d = SAMPLES / "cache" / uc_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def cached_agreements(uc_id: str) -> Path:
    return cache_dir(uc_id) / "_agreements.json"


def cached_articulation(uc_id: str, key: str) -> Path:
    safe = re.sub(r"[^a-zA-Z0-9_.-]+", "_", key)
    return cache_dir(uc_id) / f"{safe}.json"


# ── pipeline ─────────────────────────────────────────────────────────────

def fetch_all(
    cc_id: str,
    uc_id: str,
    sending_name: str,
    receiving_name: str,
    throttle: float,
    only: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Populate cache with agreement list + per-key articulation JSONs.
    Returns the list of agreement rows."""
    with httpx.Client(timeout=30, headers=HEADERS, follow_redirects=True) as client:
        bootstrap(client)

        institutions = client.get(f"{ASSIST_BASE}/institutions").json()
        sending = find_institution(institutions, sending_name)
        receiving = find_institution(institutions, receiving_name)
        if not sending or not receiving:
            raise RuntimeError(f"institution not found: {sending_name} / {receiving_name}")

        year_id = latest_published_year(client, receiving["id"], sending["id"])
        print(f"  using year_id={year_id}")

        agreements_resp = client.get(
            f"{ASSIST_BASE}/agreements",
            params={
                "receivingInstitutionId": receiving["id"],
                "sendingInstitutionId": sending["id"],
                "academicYearId": year_id,
                "categoryCode": "major",
            },
        ).json()
        reports = agreements_resp.get("reports") or []
        cached_agreements(uc_id).write_text(json.dumps(reports, indent=2))
        print(f"  cached {len(reports)} agreements")

        for i, a in enumerate(reports, 1):
            key = a.get("key") or a.get("Key")
            label = (a.get("label") or "").strip()
            if only and not any(s.lower() in label.lower() for s in only):
                continue
            cache_path = cached_articulation(uc_id, key)
            if cache_path.exists():
                continue
            # fetch with 429-aware exponential backoff
            delay = throttle
            for attempt in range(6):
                try:
                    r = client.get(
                        f"{ASSIST_BASE}/articulation/Agreements",
                        params={"Key": key},
                    )
                    if r.status_code == 429:
                        retry_after = int(r.headers.get("Retry-After", "0")) or int(min(60, max(5, delay * 4)))
                        print(f"  [{i:3d}/{len(reports)}] 429, sleeping {retry_after}s (attempt {attempt+1})")
                        time.sleep(retry_after)
                        delay = min(30, delay * 2)
                        continue
                    r.raise_for_status()
                    cache_path.write_text(r.text)
                    print(f"  [{i:3d}/{len(reports)}] {label[:60]}")
                    break
                except httpx.HTTPError as e:
                    print(f"  [{i:3d}/{len(reports)}] !! {label[:60]}: {e}")
                    break
            time.sleep(throttle)

        return reports


def load_cached_agreements(uc_id: str) -> list[dict[str, Any]]:
    p = cached_agreements(uc_id)
    if not p.exists():
        raise RuntimeError(f"No cached agreements. Run without --no-fetch first.")
    return json.loads(p.read_text())


def ensure_uc_school(client: Client, uc_id: str, uc_name: str) -> None:
    # Only insert if missing — never overwrite an existing row's name. The
    # full assist.org name ("University of California, Davis") is verbose;
    # we want curated short names ("UC Davis") in the schools table, so
    # don't clobber whatever's already there.
    existing = client.table("schools").select("id").eq("id", uc_id).execute()
    if not existing.data:
        client.table("schools").insert(
            {"id": uc_id, "name": uc_name, "type": "UC"}
        ).execute()


def upsert_major_and_path(
    client: Client,
    cc_id: str,
    uc_id: str,
    label: str,
) -> tuple[str, str]:
    tm_id = major_id(uc_id, label)
    pid = path_id_for(cc_id, uc_id, label)
    # target_majors
    client.table("target_majors").upsert(
        {
            "id": tm_id,
            "school_id": uc_id,
            "key": major_key(label),
            "name": _DEGREE_RE.sub("", label).strip() or label,
        },
        on_conflict="id",
    ).execute()
    # transfer_paths
    client.table("transfer_paths").upsert(
        {"id": pid, "cc_school_id": cc_id, "target_major_id": tm_id},
        on_conflict="id",
    ).execute()
    return tm_id, pid


def fetch_course_lookup(client: Client, cc_id: str) -> dict[str, str]:
    res = client.table("courses").select("id,code").eq("school_id", cc_id).execute()
    return {row["code"]: row["id"] for row in (res.data or [])}


def upsert_missing(client: Client, missing: list[dict]) -> None:
    if not missing:
        return
    rows = []
    for m in missing:
        cid = _course_id(m["school_id"], m["code"])
        rows.append(
            {
                "id": cid,
                "school_id": m["school_id"],
                "code": m["code"],
                "name": m.get("name") or m["code"],
                "units": int(m["units"]) if m.get("units") else None,
                "assist_id": m.get("assist_id"),
            }
        )
    for i in range(0, len(rows), 100):
        client.table("courses").upsert(rows[i : i + 100], on_conflict="id").execute()


def _derive_requirements(
    articulations: list[dict], path_id: str, code_lookup: dict[str, str]
) -> list[dict]:
    """First OR branch leaves → path_requirements."""
    out: list[dict] = []
    seen: set[tuple[str, str]] = set()

    def walk(node: dict, acc: list[str]) -> None:
        inner = node.get("items")
        if isinstance(inner, list):
            for x in inner:
                walk(x, acc)
        elif node.get("prefix") and node.get("courseNumber"):
            code = f"{node['prefix']} {node['courseNumber']}".strip()
            cid = code_lookup.get(code)
            if cid:
                acc.append(cid)

    for art in articulations:
        if not art.get("has_articulation"):
            continue
        items = (art.get("sending_logic") or {}).get("items") or []
        if not items:
            continue
        ids: list[str] = []
        walk(items[0], ids)
        for cid in ids:
            key = (path_id, cid)
            if key not in seen:
                seen.add(key)
                out.append({"path_id": path_id, "course_id": cid, "is_required": True})
    return out


def upsert_path_payload(
    client: Client,
    cc_id: str,
    path_id: str,
    parsed: dict[str, Any],
) -> None:
    # Missing courses first (so downstream FKs resolve)
    upsert_missing(client, parsed.get("missing_courses") or [])

    # Dedupe articulations by id — some majors list the same receiving course
    # twice (e.g. in two different requirement groups). Keep the entry with
    # has_articulation=True if present; otherwise last wins.
    raw_arts = parsed.get("articulations") or []
    by_id: dict[str, dict[str, Any]] = {}
    for a in raw_arts:
        existing = by_id.get(a["id"])
        if existing and existing.get("has_articulation") and not a.get("has_articulation"):
            continue
        by_id[a["id"]] = a
    arts = list(by_id.values())
    if arts:
        for i in range(0, len(arts), 50):
            client.table("path_articulations").upsert(
                arts[i : i + 50], on_conflict="id"
            ).execute()

    # Also dedupe options by id (articulation_id + option_index)
    raw_opts = parsed.get("options") or []
    opt_by_id: dict[str, dict[str, Any]] = {}
    for o in raw_opts:
        opt_by_id[o["id"]] = o

    # Replace options for this path's articulations
    art_ids_resp = client.table("path_articulations").select("id").eq(
        "path_id", path_id
    ).execute()
    art_ids = [r["id"] for r in (art_ids_resp.data or [])]
    if art_ids:
        for i in range(0, len(art_ids), 200):
            client.table("path_articulation_options").delete().in_(
                "articulation_id", art_ids[i : i + 200]
            ).execute()
    opts = list(opt_by_id.values())
    if opts:
        for i in range(0, len(opts), 200):
            client.table("path_articulation_options").insert(opts[i : i + 200]).execute()

    # Rebuild requirements using fresh lookup (incl. just-inserted missing ones)
    lookup = fetch_course_lookup(client, cc_id)
    reqs = _derive_requirements(arts, path_id, lookup)
    client.table("path_requirements").delete().eq("path_id", path_id).execute()
    if reqs:
        for i in range(0, len(reqs), 200):
            client.table("path_requirements").insert(reqs[i : i + 200]).execute()


def run(
    cc_id: str,
    uc_id: str,
    uc_name: str,
    sending_name: str,
    receiving_name: str,
    do_fetch: bool,
    throttle: float,
    only: list[str] | None,
    dry_run: bool,
) -> int:
    if do_fetch:
        print("── fetch phase ──")
        fetch_all(cc_id, uc_id, sending_name, receiving_name, throttle, only=only)
    agreements = load_cached_agreements(uc_id)
    print(f"\n── upsert phase ── ({len(agreements)} majors)")

    if dry_run:
        print("(dry run — skipping Supabase writes)")
        return 0

    client = connect()
    ensure_uc_school(client, uc_id, uc_name)

    stats = {"ok": 0, "no_data": 0, "empty": 0, "error": 0, "skipped": 0}
    seen_path_ids: set[str] = set()

    for i, a in enumerate(agreements, 1):
        key = a.get("key") or a.get("Key")
        label = (a.get("label") or "").strip()
        if only and not any(s.lower() in label.lower() for s in only):
            stats["skipped"] += 1
            continue

        cache_path = cached_articulation(uc_id, key)
        if not cache_path.exists():
            print(f"  [{i:3d}/{len(agreements)}] !! no cache for {label[:50]}")
            stats["no_data"] += 1
            continue

        # Some label pairs collide after slug (e.g. same major B.A. vs B.S.).
        # Skip duplicates to avoid re-upsert churn on the same path_id.
        pid = path_id_for(cc_id, uc_id, label)
        if pid in seen_path_ids:
            stats["skipped"] += 1
            continue
        seen_path_ids.add(pid)

        try:
            data = json.loads(cache_path.read_text())
        except Exception as e:
            print(f"  [{i:3d}/{len(agreements)}] !! unreadable cache {label[:50]}: {e}")
            stats["error"] += 1
            continue

        # Pre-check: does this articulation have any data?
        result = data.get("result") or {}
        arts_raw = result.get("articulations")
        if not arts_raw:
            stats["empty"] += 1
            upsert_major_and_path(client, cc_id, uc_id, label)
            continue

        try:
            _, pid2 = upsert_major_and_path(client, cc_id, uc_id, label)
            assert pid2 == pid
            lookup = fetch_course_lookup(client, cc_id)
            parsed = parse_agreement(
                data,
                path_id=pid,
                cc_school_id=cc_id,
                course_lookup=lookup,
            )
            upsert_path_payload(client, cc_id, pid, parsed)
            n_arts = len(parsed.get("articulations") or [])
            n_reqs = len(parsed.get("requirements") or [])
            print(f"  [{i:3d}/{len(agreements)}] {label[:50]:50s} arts={n_arts} reqs={n_reqs}")
            stats["ok"] += 1
        except Exception as e:
            print(f"  [{i:3d}/{len(agreements)}] !! {label[:50]}: {e}")
            stats["error"] += 1

    print(f"\n── done ── {stats}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cc-id", required=True, help="e.g. dvc")
    ap.add_argument("--uc-id", required=True, help="e.g. ucb")
    ap.add_argument("--uc-name", default=None, help="Display name (e.g. 'UC Berkeley')")
    ap.add_argument("--sending", required=True, help="Assist.org sending name")
    ap.add_argument("--receiving", required=True, help="Assist.org receiving name")
    ap.add_argument("--no-fetch", action="store_true", help="Skip network, use cache only")
    ap.add_argument("--throttle", type=float, default=0.6, help="Sleep between requests")
    ap.add_argument("--only", nargs="*", help="Only process majors whose label matches one of these substrings")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    uc_name = args.uc_name or args.receiving
    return run(
        cc_id=args.cc_id,
        uc_id=args.uc_id,
        uc_name=uc_name,
        sending_name=args.sending,
        receiving_name=args.receiving,
        do_fetch=not args.no_fetch,
        throttle=args.throttle,
        only=args.only,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    raise SystemExit(main())
