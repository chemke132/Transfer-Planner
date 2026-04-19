"""Parse assist.org articulation JSON → upsert-ready rows.

Input:  path to an articulation_detail_*.json dump from probe.py
        (or an equivalent dict for library use).
Output: dict with keys:
    articulations       list of path_articulations rows
    options             list of path_articulation_options rows
    requirements        list of path_requirements rows  (derived from OR-branch 0)
    missing_courses     list of {code, name, assist_id} that weren't found in
                        the courses table — caller can seed these and re-run.
    unmapped_articulations  list of receiving-course codes we couldn't parse

Design notes:
- Top-level sendingArticulation.items are OR'd alternatives (taking any one
  satisfies the articulation). Each item is itself an AND group of CC courses.
- We pick option_index=0 as the default for path_requirements; the user can
  override via UI (path_articulation_options stores the alternatives).

Usage:
    python parse.py scraper/samples/*_articulation_detail_cs.json \\
        --path-id dvc_ucb_cs --cc-school-id dvc \\
        --out scraper/samples/parsed_dvc_ucb_cs.json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def _unwrap_articulations(raw: Any) -> list[dict[str, Any]]:
    """result.articulations is sometimes a JSON-encoded string."""
    if isinstance(raw, str):
        return json.loads(raw)
    return raw or []


def _receiving_code(course: dict[str, Any]) -> str:
    prefix = (course.get("prefix") or "").strip()
    number = (course.get("courseNumber") or "").strip()
    return f"{prefix} {number}".strip()


def _cc_code(item: dict[str, Any]) -> str:
    return f"{(item.get('prefix') or '').strip()} {(item.get('courseNumber') or '').strip()}".strip()


def _branch_courses(branch: dict[str, Any]) -> list[dict[str, Any]]:
    """A top-level OR branch is an AND of leaf courses (+ optional nested groups).
    Returns flat list of CC course leaf dicts required by this branch."""
    out: list[dict[str, Any]] = []

    def walk(node: dict[str, Any]) -> None:
        inner = node.get("items")
        if isinstance(inner, list):
            for x in inner:
                walk(x)
        elif node.get("prefix") and node.get("courseNumber"):
            out.append(node)

    if isinstance(branch.get("items"), list):
        for x in branch["items"]:
            walk(x)
    else:
        walk(branch)
    return out


def _branch_label(leaves: list[dict[str, Any]]) -> str:
    return " + ".join(_cc_code(l) for l in leaves) or "(empty)"


def _slugify(s: str) -> str:
    return "".join(ch.lower() if ch.isalnum() else "_" for ch in s).strip("_")


def parse_agreement(
    data: dict[str, Any],
    *,
    path_id: str,
    cc_school_id: str,
    course_lookup: dict[str, str] | None = None,
) -> dict[str, list[dict[str, Any]]]:
    """course_lookup: {cc_code ("COMSC 140") -> course id ("dvc_comsc140")}."""
    result = data.get("result") or {}
    arts = _unwrap_articulations(result.get("articulations"))

    articulations: list[dict[str, Any]] = []
    options: list[dict[str, Any]] = []
    requirements: set[tuple[str, str]] = set()
    missing: dict[str, dict[str, Any]] = {}
    unmapped: list[str] = []
    lookup = course_lookup or {}

    for entry in arts:
        art = entry.get("articulation") or {}
        if art.get("type") != "Course":
            continue
        course = art.get("course") or {}
        recv_code = _receiving_code(course)
        if not recv_code:
            unmapped.append(str(course)[:80])
            continue

        sa = art.get("sendingArticulation") or {}
        no_reason = sa.get("noArticulationReason")
        top_items = sa.get("items") or []

        art_id = f"{path_id}:{_slugify(recv_code)}"
        has_articulation = bool(top_items) and not no_reason

        articulations.append(
            {
                "id": art_id,
                "path_id": path_id,
                "receiving_code": recv_code,
                "receiving_name": course.get("courseTitle"),
                "receiving_units": course.get("maxUnits") or course.get("minUnits"),
                "sending_logic": sa,
                "has_articulation": has_articulation,
            }
        )

        if not has_articulation:
            continue

        # Each top-level item is one OR branch.
        parsed_branches: list[tuple[list[dict[str, Any]], list[str]]] = []
        for branch in top_items:
            leaves = _branch_courses(branch)
            ids: list[str] = []
            for leaf in leaves:
                code = _cc_code(leaf)
                cid = lookup.get(code)
                if cid:
                    ids.append(cid)
                else:
                    missing.setdefault(
                        code,
                        {
                            "code": code,
                            "name": leaf.get("courseTitle"),
                            "assist_id": leaf.get("courseIdentifierParentId"),
                            "school_id": cc_school_id,
                            "units": leaf.get("maxUnits") or leaf.get("minUnits"),
                        },
                    )
            parsed_branches.append((leaves, ids))

        # Emit an option row for every branch (including single-branch
        # articulations). This lets the frontend compute effective requirements
        # by unioning each articulation's chosen option, without needing to
        # walk sending_logic on the client.
        for idx, (leaves, ids) in enumerate(parsed_branches):
            options.append(
                {
                    "id": f"{art_id}:{idx}",
                    "articulation_id": art_id,
                    "option_index": idx,
                    "label": _branch_label(leaves),
                    "course_ids": ids,
                }
            )

        # Default branch = index 0 feeds path_requirements.
        default_ids = parsed_branches[0][1] if parsed_branches else []
        for cid in default_ids:
            requirements.add((path_id, cid))

    return {
        "articulations": articulations,
        "options": options,
        "requirements": [
            {"path_id": pid, "course_id": cid, "is_required": True}
            for (pid, cid) in sorted(requirements)
        ],
        "missing_courses": list(missing.values()),
        "unmapped_articulations": unmapped,
    }


def load_course_lookup(seed_sql_path: Path, cc_school_id: str) -> dict[str, str]:
    """Quick parser for seed.sql INSERT lines to build {code -> id} map.
    Good enough for the MVP; production will query Supabase instead."""
    import re

    lookup: dict[str, str] = {}
    text = seed_sql_path.read_text()
    # match:  ('dvc_comsc110', 'dvc', 'COMSC 110', ...
    pat = re.compile(
        r"\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'",
    )
    for m in pat.finditer(text):
        cid, school, code = m.group(1), m.group(2), m.group(3)
        if school == cc_school_id:
            lookup[code] = cid
    return lookup


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("input", type=Path, help="articulation_detail_*.json dump")
    ap.add_argument("--path-id", required=True, help="e.g. dvc_ucb_cs")
    ap.add_argument("--cc-school-id", required=True, help="e.g. dvc")
    ap.add_argument(
        "--seed-sql",
        type=Path,
        default=Path(__file__).parent.parent / "supabase" / "seed.sql",
        help="seed.sql to build {code -> id} lookup (MVP shortcut)",
    )
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()

    data = json.loads(args.input.read_text())
    lookup = load_course_lookup(args.seed_sql, args.cc_school_id) if args.seed_sql.exists() else {}
    print(f"loaded {len(lookup)} courses from seed.sql for lookup")

    parsed = parse_agreement(
        data,
        path_id=args.path_id,
        cc_school_id=args.cc_school_id,
        course_lookup=lookup,
    )

    print(f"  articulations:    {len(parsed['articulations'])}")
    print(f"  options (OR):     {len(parsed['options'])}")
    print(f"  requirements:     {len(parsed['requirements'])}")
    print(f"  missing courses:  {len(parsed['missing_courses'])}")
    for m in parsed["missing_courses"]:
        print(f"    - {m['code']} ({m.get('name')})  assist_id={m.get('assist_id')}")
    if parsed["unmapped_articulations"]:
        print(f"  unmapped: {parsed['unmapped_articulations']}")

    out = args.out or args.input.with_name(f"parsed_{args.path_id}.json")
    # sending_logic (nested dicts) is already JSON-serializable
    out.write_text(json.dumps(parsed, indent=2, ensure_ascii=False, default=str))
    print(f"\nwrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
