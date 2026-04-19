"""assist.org probe — dump raw JSON to figure out the API shape.

Throw-away exploration script. Does NOT parse or write to the DB.
Goal: confirm we can fetch enough data to reconstruct DVC → UCB CS articulation.

Usage:
    python probe.py                       # defaults to DVC -> UCB, CS
    python probe.py --sending "Diablo Valley College" --receiving "University of California, Berkeley"

Outputs JSON dumps to scraper/samples/ with timestamped filenames.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

import httpx

ASSIST_ORIGIN = "https://assist.org"
ASSIST_BASE = f"{ASSIST_ORIGIN}/api"
SAMPLES_DIR = Path(__file__).parent / "samples"

DEFAULT_SENDING = "Diablo Valley College"
DEFAULT_RECEIVING = "University of California, Berkeley"
DEFAULT_MAJOR_KEYWORD = "Computer Science"

HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/120 Safari/537.36",
    "Referer": f"{ASSIST_ORIGIN}/",
}


def bootstrap_session(client: httpx.Client) -> None:
    """Hit the home page once so the server sets the XSRF cookie, then wire
    that cookie value into the X-XSRF-TOKEN header for subsequent /api calls."""
    r = client.get(f"{ASSIST_ORIGIN}/", headers={"Accept": "text/html"})
    r.raise_for_status()
    xsrf = client.cookies.get("X-XSRF-TOKEN")
    if not xsrf:
        raise RuntimeError("Did not receive X-XSRF-TOKEN cookie from assist.org")
    client.headers["X-XSRF-TOKEN"] = xsrf
    print(f"  bootstrapped session (xsrf token {xsrf[:20]}…)")


def write_sample(name: str, data: Any) -> Path:
    SAMPLES_DIR.mkdir(exist_ok=True)
    ts = time.strftime("%Y%m%d-%H%M%S")
    path = SAMPLES_DIR / f"{ts}_{name}.json"
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    return path


def get(client: httpx.Client, path: str, **params: Any) -> Any:
    r = client.get(f"{ASSIST_BASE}{path}", params=params or None)
    print(f"  GET {r.request.url} -> {r.status_code}")
    r.raise_for_status()
    return r.json()


def find_institution(institutions: list[dict[str, Any]], name: str) -> dict[str, Any] | None:
    lower = name.lower()
    for inst in institutions:
        names = inst.get("names") or []
        for n in names:
            if n.get("name", "").lower() == lower:
                return inst
    # fallback: partial match
    for inst in institutions:
        names = inst.get("names") or []
        for n in names:
            if lower in n.get("name", "").lower():
                return inst
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sending", default=DEFAULT_SENDING)
    ap.add_argument("--receiving", default=DEFAULT_RECEIVING)
    ap.add_argument("--major", default=DEFAULT_MAJOR_KEYWORD)
    args = ap.parse_args()

    print("── assist.org probe ──")
    print(f"sending:   {args.sending}")
    print(f"receiving: {args.receiving}")
    print(f"major:     {args.major}")
    print()

    with httpx.Client(timeout=30, headers=HEADERS, follow_redirects=True) as client:
        print("[0] bootstrap session")
        bootstrap_session(client)
        print()

        # 1. Institutions
        print("[1] institutions")
        institutions = get(client, "/institutions")
        p = write_sample("institutions", institutions)
        print(f"  wrote {p.name} ({len(institutions)} institutions)")

        sending = find_institution(institutions, args.sending)
        receiving = find_institution(institutions, args.receiving)
        if not sending:
            print(f"!! could not find sending '{args.sending}'", file=sys.stderr)
            return 1
        if not receiving:
            print(f"!! could not find receiving '{args.receiving}'", file=sys.stderr)
            return 1
        print(f"  sending   id={sending.get('id')}  names={[n.get('name') for n in (sending.get('names') or [])][:2]}")
        print(f"  receiving id={receiving.get('id')} names={[n.get('name') for n in (receiving.get('names') or [])][:2]}")
        print()

        # 2. Academic years
        print("[2] AcademicYears")
        years = get(client, "/AcademicYears")
        p = write_sample("academic_years", years)
        print(f"  wrote {p.name} ({len(years)} years)")
        # find the most recent year that actually has published major agreements
        recent = sorted(years, key=lambda y: y.get("Id", 0), reverse=True)[:6]
        print(f"  recent 6: {[(y.get('Id'), y.get('FallYear')) for y in recent]}")
        year_id = None
        for y in recent:
            cats_try = get(
                client,
                "/agreements/categories",
                receivingInstitutionId=receiving["id"],
                sendingInstitutionId=sending["id"],
                academicYearId=y["Id"],
            )
            major_cat = next((c for c in cats_try if c.get("code") == "major"), None)
            has_reports = bool(major_cat and major_cat.get("hasReports"))
            print(f"    year {y['FallYear']} (id={y['Id']}) major.hasReports={has_reports}")
            if has_reports:
                year_id = y["Id"]
                break
        if year_id is None:
            print("!! no year with published major agreements for this pair", file=sys.stderr)
            return 2
        print(f"  using year_id={year_id}")
        print()

        # 3. Agreement categories (which categoryCode values are valid?)
        print("[3] agreement categories")
        cats = get(
            client,
            "/agreements/categories",
            receivingInstitutionId=receiving["id"],
            sendingInstitutionId=sending["id"],
            academicYearId=year_id,
        )
        p = write_sample("agreement_categories", cats)
        print(f"  wrote {p.name}")
        if isinstance(cats, list):
            for c in cats[:8]:
                print(f"    code={c.get('code')!r}  label={c.get('label')!r}  hasReports={c.get('hasReports')}")
        print()

        # 4. Agreements under categoryCode=major
        print("[4] agreements?categoryCode=major")
        agreements = get(
            client,
            "/agreements",
            receivingInstitutionId=receiving["id"],
            sendingInstitutionId=sending["id"],
            academicYearId=year_id,
            categoryCode="major",
        )
        p = write_sample("agreements_major", agreements)
        if isinstance(agreements, list):
            print(f"  wrote {p.name} ({len(agreements)} rows)")
            for a in agreements[:5]:
                print(f"    keys={list(a.keys())[:6]}  sample={a}")
        else:
            print(f"  wrote {p.name} (dict keys={list(agreements.keys())[:10]})")
        print()

        # 5. Find CS row and fetch its articulation detail
        print(f"[5] looking for '{args.major}' in agreements list")
        reports = (agreements.get("reports") if isinstance(agreements, dict) else agreements) or []
        cs_rows = []
        for a in reports:
            label = a.get("label") or a.get("Label") or a.get("Name") or ""
            if args.major.lower() in label.lower():
                cs_rows.append(a)
        print(f"  matches: {len(cs_rows)}")
        for a in cs_rows[:10]:
            print(f"    key={a.get('key')!r}  label={a.get('label')!r}")

        if cs_rows:
            target = cs_rows[0]
            key = target.get("key") or target.get("Key")
            print(f"\n[6] fetching articulation detail for key={key!r}")
            try:
                art = get(client, f"/articulation/Agreements", Key=key)
                p = write_sample("articulation_detail_cs", art)
                print(f"  wrote {p.name}")
                # Preview structure
                if isinstance(art, dict):
                    print(f"  top-level keys: {list(art.keys())[:15]}")
                    arts_list = art.get("articulations") or art.get("Articulations")
                    if arts_list:
                        print(f"  articulations count: {len(arts_list)}")
                        print(f"  first item keys: {list(arts_list[0].keys())[:15] if arts_list else []}")
            except httpx.HTTPStatusError as e:
                print(f"  failed: {e.response.status_code} — body: {e.response.text[:200]}")

    print()
    print("done. check scraper/samples/ for raw JSON.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
