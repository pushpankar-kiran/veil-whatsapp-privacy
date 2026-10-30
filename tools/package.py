"""Package extension/ into dist/veil-extension.zip (unzips to a folder named "veil").

Run:  python tools/package.py
"""
from __future__ import annotations

import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXT = ROOT / "extension"
OUT = ROOT / "dist" / "veil-extension.zip"


def main() -> None:
    version = json.loads((EXT / "manifest.json").read_text(encoding="utf-8"))["version"]
    OUT.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        for path in sorted(EXT.rglob("*")):
            if path.is_file():
                z.write(path, Path("veil") / path.relative_to(EXT))
    print(f"Packaged Veil {version} -> {OUT.relative_to(ROOT)} ({OUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
