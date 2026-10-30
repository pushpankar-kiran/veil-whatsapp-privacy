"""Run Veil's behaviour + security checks headlessly.

Serves the repo on a local port, opens test/mock.html (fictional WhatsApp-like DOM)
in Chromium via Playwright, runs `veilChecks()` and the structure-only DOM probe,
and exits 1 on any failure.

Setup:  pip install playwright && python -m playwright install chromium
Run:    python tools/run_checks.py
Set VEIL_CHROME_CHANNEL=chrome to use an installed Google Chrome instead.
"""
from __future__ import annotations

import functools
import http.server
import os
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
FICTIONAL = ["Priya", "Asha", "Meadow", "order", "package", "PRIVATE", "Waah", "Draft"]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def serve() -> http.server.ThreadingHTTPServer:
    handler = functools.partial(QuietHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def main() -> int:
    server = serve()
    base = f"http://127.0.0.1:{server.server_address[1]}"
    failed = 0
    with sync_playwright() as p:
        browser = p.chromium.launch(channel=os.environ.get("VEIL_CHROME_CHANNEL") or None)
        page = browser.new_page()
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"{base}/test/mock.html")
        page.wait_for_function("typeof window.veilChecks === 'function'")
        page.wait_for_timeout(300)
        result = page.evaluate("veilChecks()")
        for r in result["results"]:
            mark = "PASS" if r["pass"] else "FAIL"
            print(f"  {mark}  {r['name']}" + (f"  ({r['detail']})" if not r["pass"] and r["detail"] else ""))
        failed += result["total"] - result["passed"]

        probe_src = (ROOT / "tools" / "dom-probe.js").read_text(encoding="utf-8")
        report = page.evaluate(f"JSON.stringify((0, eval)({probe_src!r}))")
        leaks = [w for w in FICTIONAL if w in report]
        print(f"  {'PASS' if not leaks else 'FAIL'}  dom-probe reports structure only" + (f"  (leaked {leaks})" if leaks else ""))
        failed += bool(leaks)

        if errors:
            print("  FAIL  page errors: " + "; ".join(errors))
            failed += 1
        browser.close()
    server.shutdown()
    total = result["total"] + 1 + bool(errors)
    print(f"\n{total - failed}/{total} checks passed" + (" - FAILED" if failed else ""))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
