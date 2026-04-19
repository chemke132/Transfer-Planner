"""DVC catalog probe — use Playwright to load the COMSC catalog page and
capture every network response that looks like course data. Dumps JSON to
scraper/samples/ so we can figure out the API shape.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

SAMPLES = Path(__file__).parent / "samples"
SAMPLES.mkdir(exist_ok=True)

URL = "https://dvc.elumenapp.com/catalog/DVC2025-2026Catalog/dvc-computer-science-course"


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context()
        page = ctx.new_page()

        captured: list[dict] = []

        def on_response(resp):
            url = resp.url
            ct = (resp.headers or {}).get("content-type", "")
            if "json" not in ct:
                return
            # Skip noise (auth, i18n, config, tiny responses)
            if any(s in url for s in ("/auth/", "/i18n", "/configuration", "/tenant")):
                return
            try:
                body = resp.text()
            except Exception:
                return
            if len(body) < 200:
                return
            captured.append({"url": url, "status": resp.status, "body": body})
            print(f"  captured {resp.status} {url[-80:]}  ({len(body)} bytes)")

        page.on("response", on_response)

        print(f"loading {URL}")
        page.goto(URL, wait_until="networkidle", timeout=60000)
        # Give Angular a moment to settle
        page.wait_for_timeout(2000)

        print(f"\ncaptured {len(captured)} json responses")
        ts = time.strftime("%Y%m%d-%H%M%S")
        out = SAMPLES / f"{ts}_dvc_network.json"
        out.write_text(json.dumps(captured, indent=2))
        print(f"wrote {out}")

        # Also dump the rendered page HTML for offline parsing fallback
        html_out = SAMPLES / f"{ts}_dvc_comsc.html"
        html_out.write_text(page.content())
        print(f"wrote {html_out} ({len(page.content())} bytes)")

        browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
