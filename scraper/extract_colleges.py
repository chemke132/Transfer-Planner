"""Extract receiving-college affiliation from cached assist.org agreements,
classify whether the major uses Cal-GETC for breadth/GE, and upsert the
flag into target_majors.requires_cal_getc.

Per-college policy (UC Berkeley & similar UCs):
  Cal-GETC accepted    : L&S, CDSS, CNR/Rausser, Environmental Design,
                         (UCLA L&S, UCSD revelle/muir/etc. — handled in
                         individual UC overrides if needed)
  NOT Cal-GETC         : College of Engineering (CoE/HSSEAS/Jacobs),
                         College of Chemistry (CoC), Haas Business

Source of truth: each agreement's templateAssets first 'GeneralText'
block contains a sentence like "THIS MAJOR IS OFFERED BY THE COLLEGE OF
LETTERS AND SCIENCE (L&S)" or "College of Engineering". We pattern-match
on the college keyword.

Usage:
    python scraper/extract_colleges.py --uc-id ucb [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import os
import re
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

CACHE = Path(__file__).parent / "samples" / "cache"

# (regex, college_label, requires_cal_getc)
# Order matters — first match wins.
COLLEGE_RULES = [
    (re.compile(r"college of engineering|haas school|jacobs school|samueli|college of chemistry|chemical sciences", re.I), "Engineering/Chemistry/Business", False),
    (re.compile(r"letters and science|l&s|college of computing|cdss|natural resources|rausser|environmental design", re.I), "L&S/CDSS/CNR/EnvDesign", True),
]


def major_id_to_assist_name(major_id: str) -> str:
    """Best-effort reverse: id like 'ucb_mechanical_engineering' -> 'Mechanical Engineering'.
    Used only for logging — actual matching is by major name from cache."""
    return major_id.split("_", 1)[1].replace("_", " ").title() if "_" in major_id else major_id


def extract_college(template_assets_raw: str) -> str | None:
    try:
        ta = json.loads(template_assets_raw)
    except Exception:
        return None
    if not isinstance(ta, list):
        return None
    text_blocks = []
    for a in ta:
        if not isinstance(a, dict):
            continue
        if a.get("type") in ("GeneralText", "GeneralTitle"):
            text_blocks.append(a.get("content") or "")
    blob = " ".join(text_blocks[:3])  # first few blocks usually carry the college line
    return blob


# Fallback: classify directly from the major name when templateAssets doesn't
# carry the college affiliation (UCLA / UCSD agreements often don't).
NAME_NO_CALGETC = re.compile(
    # Any major with "Engineering" in its name lives in CoE / HSSEAS / Jacobs.
    r"\bengineer(ing)?\b|"
    # UCLA / UCSD CS variants are in the engineering school (unlike UCB CS / L&S).
    r"\bcomputer (science(\s+and\s+engineering)?|engineering)\b",
    re.I,
)
# A handful of programs LOOK like engineering by name but aren't in the
# engineering school (UCLA Engineering Geology is in L&S Earth Sciences;
# Linguistics and Computer Science is in L&S linguistics, not HSSEAS).
NAME_CS_LS = re.compile(
    r"\b(linguistics and computer science|engineering geology)\b",
    re.I,
)


def classify(blob: str, name: str = "") -> tuple[str, bool]:
    for pat, label, req in COLLEGE_RULES:
        if pat.search(blob):
            return label, req
    # Name-based fallback for agreements without college info in templateAssets.
    if name and NAME_NO_CALGETC.search(name) and not NAME_CS_LS.search(name):
        return "Engineering (by name)", False
    return "unknown", True  # default: assume Cal-GETC OK


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--uc-id", required=True, help="e.g. ucb")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    cache_dir = CACHE / args.uc_id
    if not cache_dir.exists():
        print(f"!! no cache dir: {cache_dir}", file=sys.stderr)
        return 1

    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required", file=sys.stderr)
        return 1
    client = create_client(url, key)

    def normalize_name(n: str) -> str:
        # Strip degree suffix in any of these formats:
        #   "Sociology B.A."         (UCSD: just a space)
        #   "Spanish/B.A."           (UCLA: slash)
        #   "Computer Science, B.A." (UCB: comma)
        #   "Music/B.M."             (UCLA Music)
        # Also handle UCLA quirk where DB stored "Asian Studies/" (trailing
        # slash, no degree word).
        n = re.sub(
            r"[\s,/\-]+(B\.?[AS]\.?|M\.?[AS]\.?|B\.?M\.?|Ph\.?D\.?)"
            r"(\s+and\s+B\.?[AS]\.?)?\.?\s*$",
            "",
            n,
            flags=re.I,
        )
        n = n.rstrip("/ ").strip()
        return n.lower()

    # Build name -> classification map from cached agreements.
    name_to_class: dict[str, tuple[str, bool]] = {}
    for f in sorted(cache_dir.glob("*.json")):
        try:
            d = json.loads(f.read_text())
        except Exception:
            continue
        if not isinstance(d, dict):
            continue
        res = d.get("result")
        if not isinstance(res, dict):
            continue
        name = (res.get("name") or "").strip()
        if not name:
            continue
        ta_raw = res.get("templateAssets") or "[]"
        blob = extract_college(ta_raw) or ""
        label, req = classify(blob, name)
        name_to_class[normalize_name(name)] = (label, req)

    print(f"  parsed {len(name_to_class)} agreements")

    # Pull current target_majors for this school.
    r = client.table("target_majors").select("id,name").eq("school_id", args.uc_id).execute()
    rows = r.data or []
    print(f"  db has {len(rows)} {args.uc_id} majors")

    by_label: dict[str, int] = {}
    updates_true: list[str] = []
    updates_false: list[str] = []
    unknown: list[str] = []

    for m in rows:
        cls = name_to_class.get(normalize_name(m["name"]))
        if cls is None:
            unknown.append(m["name"])
            continue
        label, req = cls
        by_label[label] = by_label.get(label, 0) + 1
        if req:
            updates_true.append(m["id"])
        else:
            updates_false.append(m["id"])

    print()
    print("── classification counts ──")
    for k, v in sorted(by_label.items(), key=lambda x: -x[1]):
        print(f"  {k}: {v}")
    if unknown:
        print(f"  (no match) {len(unknown)}: e.g. {unknown[:3]}")
    # Also print the majors that classified as 'unknown' (matched cache but no college regex hit).
    unk_classified = [m["name"] for m in rows if name_to_class.get(normalize_name(m["name"]), (None,))[0] == "unknown"]
    if unk_classified:
        print(f"  (classified 'unknown'): {unk_classified}")

    print()
    print(f"  cal_getc TRUE  → {len(updates_true)} majors")
    print(f"  cal_getc FALSE → {len(updates_false)} majors")
    if updates_false:
        print("    sample FALSE majors (no Cal-GETC):")
        for mid in updates_false[:10]:
            print(f"      - {mid}")

    if args.dry_run:
        print("\n(dry run — skipping writes)")
        return 0

    # Apply updates in chunks.
    if updates_false:
        for i in range(0, len(updates_false), 100):
            chunk = updates_false[i : i + 100]
            client.table("target_majors").update(
                {"requires_cal_getc": False}
            ).in_("id", chunk).execute()
        print(f"  ✓ flagged {len(updates_false)} as requires_cal_getc=false")

    if updates_true:
        for i in range(0, len(updates_true), 100):
            chunk = updates_true[i : i + 100]
            client.table("target_majors").update(
                {"requires_cal_getc": True}
            ).in_("id", chunk).execute()
        print(f"  ✓ flagged {len(updates_true)} as requires_cal_getc=true")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
