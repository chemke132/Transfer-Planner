"""DVC Cal-GETC scraper.

Parses the official DVC Cal-GETC 2025-26 PDF (hosted by CSU East Bay) and
extracts the approved course list per area.

Output JSON shape:
  {
    "source_url": "...",
    "areas": { "1A": ["ENGL 122", ...], "1B": [...], ..., "6": [...] },
    "uc_cap_courses": [ "ECON 200", ... ],   # flagged with '+'
    "lab_paired_courses": [...]              # 5A/5B underlined (optional)
  }

Usage:
    python scraper/dvc_calgetc.py --out scraper/samples/dvc_calgetc.json
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import pdfplumber

SAMPLES = Path(__file__).parent / "samples"
SAMPLES.mkdir(exist_ok=True)

PDF_URL = "https://www.csueastbay.edu/aps/cccge2526/diablo-valley-college-cal-getc-25-26.pdf"
DEFAULT_PDF = SAMPLES / "dvc_calgetc_2526.pdf"

# Area header patterns in the PDF. Order matters: check more-specific first.
# When we hit any of these lines, clear the current area (subsequent content
# is UC-specific add-ons that aren't part of Cal-GETC area lists).
TERMINATOR_RE = re.compile(
    r"UC GRADUATION REQUIREMENT|LANGUAGE OTHER THAN ENGLISH|"
    r"US HISTORY.*CONSTITUTION|CSU ADDITIONAL REQUIREMENT",
    re.I,
)

AREA_HEADERS = [
    (re.compile(r"^\s*1A\s*-\s*English Composition", re.I), "1A"),
    (re.compile(r"^\s*1B\s*-\s*Critical Thinking", re.I), "1B"),
    (re.compile(r"^\s*1C\s*-\s*Oral Communication", re.I), "1C"),
    (re.compile(r"^\s*AREA 2\b", re.I), "2"),
    (re.compile(r"^\s*3A\s*-\s*Arts\b", re.I), "3A"),
    (re.compile(r"^\s*3B\s*-\s*Humanities", re.I), "3B"),
    (re.compile(r"^\s*AREA 4\b", re.I), "4"),
    (re.compile(r"^\s*5A\s*-\s*Physical Science", re.I), "5A"),
    (re.compile(r"^\s*5B\s*-\s*Biological Science", re.I), "5B"),
    (re.compile(r"^\s*5C\s*-\s*Laboratory", re.I), "5C"),
    (re.compile(r"^\s*AREA 6\b", re.I), "6"),
]

# Course entry pattern: PREFIX-ID[+] TITLE UNITS.
# - Prefix = 2-6 uppercase letters
# - ID may start with letter (CCN C-codes like C1000E), digits, letter suffix
# - Trailing + marks UC transfer-credit caps
# - TITLE is non-greedy up to UNITS (1-2 digits) followed by next CODE- or EOL
COURSE_RE = re.compile(
    r"([A-Z]{2,6})-([A-Z]?\d+[A-Z]*)(\+?)\s+(.+?)\s+(\d+)"
    r"(?=\s+[A-Z]{2,6}-|\s*$)"
)

# Lines to skip (headers, footers, prose).
SKIP_PAT = re.compile(
    r"(information is for students|See a counselor|UC transfer credit limits|"
    r"AP (Art History|Biology|Chemistry|Calculus|Statistics)|Note|NOTE|"
    r"Effective Fall|NOT REQUIRED|UC GRADUATION|LANGUAGE OTHER|Proficiency|"
    r"Upon completion|TO TRANSFER|Complete at least|Courses used|Cal-GETC is not|"
    r"^\s*$|Option 2|Diablo Valley|California General|at least \d|"
    r"A course or exam|courses with a matching|Area \d|AREA \d .*PHYS)",
    re.I,
)


def detect_area(line: str) -> str | None:
    for pat, area in AREA_HEADERS:
        if pat.search(line):
            return area
    return None


CODE_SIMPLE_RE = re.compile(r"([A-Z]{2,6})-([A-Z]?\d+[A-Z]*)")


def detect_underlined_codes(page) -> set[str]:
    """Find course codes rendered with an underline on this page. The DVC
    Cal-GETC PDF underlines 5A/5B course codes that have a matching lab
    (satisfies 5C). Underlines are drawn as thin short horizontal rects."""
    underlines = [r for r in page.rects
                  if r.get("height", 99) < 1
                  and 5 < (r["x1"] - r["x0"]) < 20]
    found: set[str] = set()
    for u in underlines:
        # Chars whose bottom is 2-10pt above the underline top (they sit on it)
        above = [c for c in page.chars
                 if u["x0"] - 1 <= c["x0"] <= u["x1"] + 1
                 and 2 <= (u["top"] - c["bottom"]) <= 10]
        if not above:
            continue
        y = above[0]["bottom"]
        line = sorted(
            [c for c in page.chars if abs(c["bottom"] - y) < 1.5],
            key=lambda c: c["x0"],
        )
        text = "".join(c["text"] for c in line)
        under_cx = (min(c["x0"] for c in above) + max(c["x1"] for c in above)) / 2
        for m in CODE_SIMPLE_RE.finditer(text):
            s, e = m.start(), m.end()
            if e > len(line):
                continue
            cx0, cx1 = line[s]["x0"], line[e - 1]["x1"]
            if cx0 - 2 <= under_cx <= cx1 + 2:
                found.add(f"{m.group(1)} {m.group(2)}")
                break
    return found


def parse_pdf(pdf_path: Path) -> dict:
    # area -> list of course codes (order-preserving, unique)
    areas: dict[str, list[str]] = {}
    # code -> {name, units} gathered across all pages (first occurrence wins)
    catalog: dict[str, dict] = {}
    uc_cap: set[str] = set()
    lab_paired: set[str] = set()
    current: str | None = None

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            lab_paired |= detect_underlined_codes(page)
            text = page.extract_text(layout=True) or ""
            for line in text.splitlines():
                # Terminator first (UC-only add-ons after Area 6).
                if TERMINATOR_RE.search(line):
                    current = None
                    continue
                # Area header?
                new_area = detect_area(line)
                if new_area:
                    current = new_area
                    areas.setdefault(current, [])
                    continue
                if current is None:
                    continue
                # Extract all (code, title, units) tuples on this line.
                for m in COURSE_RE.finditer(line):
                    prefix, ident, plus = m.group(1), m.group(2), m.group(3)
                    title = m.group(4).strip()
                    try:
                        units = int(m.group(5))
                    except ValueError:
                        units = None
                    code = f"{prefix} {ident}"
                    areas[current].append(code)
                    if plus:
                        uc_cap.add(code)
                    if code not in catalog:
                        catalog[code] = {"name": title, "units": units}

    # Dedupe within each area preserving first-seen order.
    for a in list(areas):
        seen: set[str] = set()
        out: list[str] = []
        for c in areas[a]:
            if c not in seen:
                seen.add(c)
                out.append(c)
        areas[a] = out

    return {
        "source_url": PDF_URL,
        "areas": areas,
        "catalog": catalog,
        "uc_cap_courses": sorted(uc_cap),
        "lab_paired_courses": sorted(lab_paired),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", type=Path, default=DEFAULT_PDF)
    ap.add_argument("--out", type=Path, default=SAMPLES / "dvc_calgetc.json")
    args = ap.parse_args()

    if not args.pdf.exists():
        print(f"!! PDF not found: {args.pdf}. Download from {PDF_URL}")
        return 1

    data = parse_pdf(args.pdf)
    args.out.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    print(f"\n── summary ──")
    total = 0
    for area, codes in sorted(data["areas"].items()):
        print(f"  {area}: {len(codes)} courses")
        total += len(codes)
    print(f"  total: {total}")
    print(f"  uc_cap: {len(data['uc_cap_courses'])}")
    print(f"  lab_paired (5C): {len(data['lab_paired_courses'])}")
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
