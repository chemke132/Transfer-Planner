"""DVC catalog scraper.

For each listed department, fetches the department index page to discover
course slugs, then fetches each course detail page to extract:
  - code (e.g. "COMSC 210")
  - name
  - units
  - description
  - strict prerequisites (ignores "Advisory" and "Corequisite" for now)

The eLumen catalog exposes publicly-cacheable per-course HTML at:
  /catalog/sites/publish/content/DVC<year>Catalog,course,<slug>?tenant=dvc.elumenapp.com

Output: a parsed dict shaped like parse.py output so upsert.py can consume:
  {
    "courses": [ {id, school_id, code, name, units, description, assist_id?}, ...],
    "prerequisites": [ {course_id, prerequisite_id}, ... ],
    "unresolved_prereqs": [ {course, prereq_slug, reason}, ...]
  }

Usage:
    python scraper/dvc_catalog.py --departments comsc,math,phys \\
        --out scraper/samples/dvc_catalog.json
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path
from typing import Any

import httpx

BASE = "https://api-prod.elumenapp.com/catalog/sites/publish/content"
TENANT = "dvc.elumenapp.com"
CATALOG = "DVC2025-2026Catalog"

DEPT_SLUGS = {
    "comsc": "dvc-computer-science-course",
    "math": "dvc-mathematics-course",
    "phys": "dvc-physics-course",
    "engin": "dvc-engineering-course",
    "chem": "dvc-chemistry-course",
    "engl": "dvc-english-course",
    "psyc": "dvc-psychology-course",
    # Biological & physical sciences
    "biosc": "dvc-biological-science-course",
    "astro": "dvc-astronomy-course",
    "geol": "dvc-geology-course",
    "nutri": "dvc-nutrition-course",
    # Social sciences
    "econ": "dvc-economics-course",
    "pols": "dvc-political-science-course",
    "socio": "dvc-sociology-course",
    "anthr": "dvc-anthropology-course",
    "geog": "dvc-geography-course",
    "hist": "dvc-history-course",
    "ethn": "dvc-ethnic-studies-course",
    # Humanities & arts
    "philo": "dvc-philosophy-course",
    "drama": "dvc-drama-course",
    "archi": "dvc-architecture-course",
    # Languages
    "span": "dvc-spanish-course",
    "ital": "dvc-italian-course",
    "grman": "dvc-german-course",
    "russ": "dvc-russian-course",
    # Business
    "bus": "dvc-business-course",
}

SAMPLES = Path(__file__).parent / "samples"
SAMPLES.mkdir(exist_ok=True)


def fetch(client: httpx.Client, path: str) -> str:
    url = f"{BASE}/{CATALOG},{path}?tenant={TENANT}"
    r = client.get(url)
    r.raise_for_status()
    # Responses are JSON wrappers with .html, or raw HTML depending on route.
    txt = r.text
    if txt.lstrip().startswith("{"):
        try:
            return json.loads(txt).get("html", txt)
        except Exception:
            pass
    return txt


def department_slugs(client: httpx.Client, dept_prefix: str, dept_slug: str) -> list[str]:
    html = fetch(client, dept_slug)
    pat = re.compile(rf"course/({dept_prefix.lower()}\w+)")
    slugs = sorted(set(pat.findall(html.lower())))
    # Filter out obvious noncredit / lab / special suffixes that aren't in our scope.
    # Keep everything for now; caller can whitelist.
    return slugs


# Parser ─────────────────────────────────────────────────────────────────────

HEAD_RE = re.compile(r"<h2[^>]*>\s*([A-Z]+)\s*(\S+)\s*-\s*(.*?)\s*</h2>", re.DOTALL)
UNITS_RE = re.compile(r"Units:\s*([\d.]+)")
DESC_RE = re.compile(
    r"<p>Description:</p>\s*</h4>(.*?)<!--\s*End Description", re.DOTALL
)
REQ_BLOCK_RE = re.compile(
    r"<p>Requisites:</p>\s*</h4>(.*?)<!--\s*End", re.DOTALL
)


def strip_tags(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s)).strip()


def parse_course(html: str, slug: str) -> dict[str, Any] | None:
    mh = HEAD_RE.search(html)
    if not mh:
        return None
    prefix, number, title = mh.group(1), mh.group(2), strip_tags(mh.group(3))
    code = f"{prefix} {number}"

    units = None
    mu = UNITS_RE.search(html)
    if mu:
        try:
            units = float(mu.group(1))
        except ValueError:
            pass

    description = None
    md = DESC_RE.search(html)
    if md:
        description = strip_tags(md.group(1))

    # Parse prereqs: only "Prerequisite" blocks (skip Advisory / Corequisite).
    # DVC catalog structures multi-path requisites with <p class="my-2">
    # <strong>OR</strong></p> dividers between alternative branches. Within a
    # branch, <strong>AND</strong> combines multiple requirements. Since our
    # schema doesn't model prereq OR groups yet, we pick a single branch with
    # this priority:
    #   1. A branch whose prereqs share this course's department prefix
    #      (e.g. COMSC 165 picks "COMSC 110" over "ENGIN 135") — students
    #      naturally stay within their department's ladder.
    #   2. Otherwise, the LAST OR branch — for cross-discipline STEM courses
    #      this is usually the calculus-based / university track (e.g. PHYS 130
    #      lands on PHYS 129 rather than the high-school-level fallback).
    prereq_slugs: list[str] = []
    req_block = REQ_BLOCK_RE.search(html)
    if req_block:
        block = req_block.group(1)
        # Split into top-level OR branches.
        or_branches = re.split(
            r'<p class="my-2"><strong>OR</strong></p>', block
        )

        def extract_prereq_courses(branch: str) -> list[str]:
            """Extract course slugs from Prerequisite chunks (skip Advisory,
            Co-Requisite). Within a branch, multiple <strong>Prerequisite
            </strong> chunks are AND'd together."""
            slugs: list[str] = []
            chunks = re.split(r"<strong>", branch)
            for chunk in chunks:
                label_match = re.match(r"\s*([A-Za-z-]+)", chunk)
                if not label_match:
                    continue
                label = label_match.group(1).lower()
                # Accept "prerequisite" only (not "advisory", "co-requisite",
                # "corequisite", "recommended").
                if label != "prerequisite":
                    continue
                for m in re.finditer(r"course/([a-z0-9]+)", chunk):
                    slugs.append(m.group(1))
            return slugs

        own_prefix = prefix.lower()
        candidates = [extract_prereq_courses(b) for b in or_branches]
        # Score branches so we can both:
        #   - pick a default (option_index=0): cheapest same-dept path
        #   - keep the rest as alternative options the user can pick later
        same_dept = [s for s in candidates if s and any(x.startswith(own_prefix) for x in s)]
        def _branch_score(slugs: list[str]) -> tuple[int, int]:
            num_sum = 0
            for s in slugs:
                m = re.search(r"(\d+)", s)
                if m:
                    num_sum += int(m.group(1))
            return (len(slugs), -num_sum)
        prereq_options: list[list[str]] = []
        if same_dept:
            # Order: cheapest same-dept first, then the rest of same-dept.
            same_dept_sorted = sorted(same_dept, key=_branch_score)
            for s in same_dept_sorted:
                if s not in prereq_options:
                    prereq_options.append(s)
        # Fallback / extra: cross-dept branches still go in (after same-dept)
        # so the user can pick e.g. ENGIN 135 if they prefer.
        for s in candidates:
            if s and s not in prereq_options:
                prereq_options.append(s)
        prereq_slugs = prereq_options[0] if prereq_options else []

    return {
        "slug": slug,
        "code": code,
        "name": title,
        "units": units,
        "description": description,
        "prereq_slugs": sorted(set(prereq_slugs)),
        # All same-dept-first OR-branches as alternative options the user
        # can pick between. Index 0 is the default (matches prereq_slugs).
        "prereq_options": [list(b) for b in prereq_options],
    }


def _course_id(school_id: str, code: str) -> str:
    return f"{school_id}_" + re.sub(r"[^a-z0-9]+", "", code.lower())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--departments",
        default="comsc,math,phys",
        help="Comma-separated prefixes. Known: " + ",".join(DEPT_SLUGS),
    )
    ap.add_argument("--school-id", default="dvc")
    ap.add_argument(
        "--out",
        type=Path,
        default=SAMPLES / f"dvc_catalog_{time.strftime('%Y%m%d')}.json",
    )
    args = ap.parse_args()

    depts = [d.strip().lower() for d in args.departments.split(",") if d.strip()]
    for d in depts:
        if d not in DEPT_SLUGS:
            print(f"!! unknown department '{d}'. Known: {list(DEPT_SLUGS)}", file=sys.stderr)
            return 1

    courses: list[dict[str, Any]] = []
    prereqs: list[dict[str, Any]] = []
    prereq_options_rows: list[dict[str, Any]] = []
    unresolved: list[dict[str, Any]] = []
    slug_to_id: dict[str, str] = {}

    with httpx.Client(
        timeout=30,
        headers={
            "Accept": "application/json, text/plain, */*",
            "Origin": "https://dvc.elumenapp.com",
            "User-Agent": "Mozilla/5.0 TransferPlannerScraper",
        },
    ) as client:
        # Pass 1: enumerate all slugs, fetch details, build slug_to_id map.
        all_slugs: list[tuple[str, str]] = []  # (prefix, slug)
        for dept in depts:
            print(f"\n── dept {dept.upper()} ──")
            slugs = department_slugs(client, dept, DEPT_SLUGS[dept])
            print(f"  found {len(slugs)} slugs")
            for s in slugs:
                all_slugs.append((dept, s))

        parsed_by_slug: dict[str, dict[str, Any]] = {}
        for i, (dept, slug) in enumerate(all_slugs, 1):
            html = fetch(client, f"course,{slug}")
            parsed = parse_course(html, slug)
            if not parsed:
                print(f"  [{i:3d}/{len(all_slugs)}] !! could not parse {slug}")
                continue
            parsed_by_slug[slug] = parsed
            cid = _course_id(args.school_id, parsed["code"])
            slug_to_id[slug] = cid
            # DVC catalog sometimes versions slugs (e.g. "phys111v2" in the
            # department index, but prereqs reference "phys111"). Register an
            # unversioned alias so prereq lookups still resolve.
            stripped = re.sub(r"v\d+$", "", slug)
            if stripped != slug and stripped not in slug_to_id:
                slug_to_id[stripped] = cid
            if i % 10 == 0:
                print(f"  [{i:3d}/{len(all_slugs)}] {parsed['code']}")

        # Pass 2: resolve prereq slugs -> course ids
        for slug, parsed in parsed_by_slug.items():
            cid = slug_to_id[slug]
            courses.append(
                {
                    "id": cid,
                    "school_id": args.school_id,
                    "code": parsed["code"],
                    "name": parsed["name"],
                    "units": int(parsed["units"]) if parsed["units"] else None,
                    "description": parsed["description"],
                }
            )
            for pslug in parsed["prereq_slugs"]:
                pid = slug_to_id.get(pslug)
                if pid:
                    prereqs.append({"course_id": cid, "prerequisite_id": pid})
                else:
                    unresolved.append(
                        {
                            "course": parsed["code"],
                            "prereq_slug": pslug,
                            "reason": "slug not in scraped set — department not included?",
                        }
                    )
            # Emit course_prereq_options for branches that fully resolve.
            # Build a reverse map (course_id → code) from already-accumulated
            # courses so labels work even when prereq_slugs use aliases like
            # "phys111" while parsed_by_slug only has "phys111v2".
            id_to_code = {c["id"]: c["code"] for c in courses}
            for opt_idx, opt_slugs in enumerate(parsed.get("prereq_options") or []):
                opt_ids: list[str] = []
                opt_codes: list[str] = []
                ok = True
                for ps in opt_slugs:
                    pid2 = slug_to_id.get(ps)
                    if not pid2:
                        ok = False
                        break
                    opt_ids.append(pid2)
                    code_str = id_to_code.get(pid2)
                    if code_str:
                        opt_codes.append(code_str)
                if not ok or not opt_ids:
                    continue
                deduped_ids = sorted(set(opt_ids))
                prereq_options_rows.append(
                    {
                        "id": f"{cid}:{opt_idx}",
                        "course_id": cid,
                        "option_index": opt_idx,
                        "prerequisite_ids": deduped_ids,
                        "label": " + ".join(sorted(set(opt_codes)))
                        if opt_codes
                        else "(prereq)",
                    }
                )

    out = {
        "courses": courses,
        "prerequisites": prereqs,
        "prereq_options": prereq_options_rows,
        "unresolved_prereqs": unresolved,
    }
    args.out.write_text(json.dumps(out, indent=2, ensure_ascii=False))
    print(f"\n── summary ──")
    print(f"  courses: {len(courses)}")
    print(f"  prerequisites: {len(prereqs)}")
    print(f"  unresolved: {len(unresolved)}")
    if unresolved[:5]:
        print(f"  e.g. {unresolved[:3]}")
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
