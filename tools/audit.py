"""Zero-network audit for the Veil extension.

Fails (exit 1) if the extension could send data anywhere:
  * manifest asks for anything beyond `storage`, has host permissions, remote
    update URL, externally_connectable, web-accessible resources, or a CSP that
    allows connections;
  * any JS/HTML file contains a network API, dynamic code execution,
    storage.sync, or an http(s) URL.

Run:  python tools/audit.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

EXT = Path(__file__).resolve().parent.parent / "extension"

FORBIDDEN_CODE = {
    r"\bfetch\s*\(": "fetch()",
    r"XMLHttpRequest": "XMLHttpRequest",
    r"\bWebSocket\b": "WebSocket",
    r"\bEventSource\b": "EventSource",
    r"sendBeacon": "navigator.sendBeacon",
    r"RTCPeerConnection": "WebRTC",
    r"\beval\s*\(": "eval()",
    r"new\s+Function\s*\(": "new Function()",
    r"storage\.sync": "chrome.storage.sync (uploads to Google)",
    r"window\.open\s*\(": "window.open()",
    r"location\.(href|assign|replace)\s*[=(]": "navigation",
    r"https?://": "absolute http(s) URL",
    r"\.src\s*=": "assigning a resource URL",
    r"<(script|link|iframe|img)[^>]+(src|href)\s*=\s*[\"']?(https?:)?//": "external resource tag",
}
ALLOWED_IMPORTS = {"settings.js"}
ALLOWED_PERMISSIONS = {"storage"}
ALLOWED_MATCH = "https://web.whatsapp.com/*"


def audit_manifest(problems: list[str]) -> None:
    m = json.loads((EXT / "manifest.json").read_text(encoding="utf-8"))
    extra = set(m.get("permissions", [])) - ALLOWED_PERMISSIONS
    if extra:
        problems.append(f"manifest: extra permissions {sorted(extra)}")
    for key in ("host_permissions", "optional_permissions", "optional_host_permissions",
                "externally_connectable", "web_accessible_resources", "update_url"):
        if m.get(key):
            problems.append(f"manifest: '{key}' must not be present")
    for cs in m.get("content_scripts", []):
        bad = [x for x in cs.get("matches", []) if x != ALLOWED_MATCH]
        if bad:
            problems.append(f"manifest: content script matches {bad}")
    csp = (m.get("content_security_policy") or {}).get("extension_pages", "")
    if "connect-src 'none'" not in csp:
        problems.append("manifest: CSP must contain connect-src 'none'")
    if "unsafe-eval" in csp or "unsafe-inline" in csp:
        problems.append("manifest: CSP must not allow unsafe-eval/unsafe-inline")


def audit_code(problems: list[str]) -> int:
    files = [p for p in EXT.rglob("*") if p.suffix in {".js", ".html", ".css"}]
    for path in files:
        text = path.read_text(encoding="utf-8")
        rel = path.relative_to(EXT)
        for pattern, label in FORBIDDEN_CODE.items():
            for match in re.finditer(pattern, text):
                line = text.count("\n", 0, match.start()) + 1
                problems.append(f"{rel}:{line}: forbidden {label}")
        for match in re.finditer(r"importScripts\(([^)]*)\)", text):
            names = set(re.findall(r"[\"']([^\"']+)[\"']", match.group(1)))
            if not names <= ALLOWED_IMPORTS:
                problems.append(f"{rel}: importScripts of {sorted(names - ALLOWED_IMPORTS)}")
        for match in re.finditer(r"@import|url\(\s*[\"']?(https?:)?//", text):
            problems.append(f"{rel}: external CSS reference '{match.group(0)}'")
    return len(files)


def main() -> int:
    problems: list[str] = []
    audit_manifest(problems)
    n = audit_code(problems)
    if problems:
        print("AUDIT FAILED")
        for p in problems:
            print("  -", p)
        return 1
    print(f"AUDIT PASSED: manifest + {n} files. No network APIs, no remote code, no external URLs, storage.local only.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
