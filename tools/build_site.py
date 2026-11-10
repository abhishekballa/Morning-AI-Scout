"""Build the public, read-only website version of the Scout app into _site/.

GitHub Actions runs this on every push (see .github/workflows/pages.yml).
To try it on your computer:
    python tools/build_site.py
    python -m http.server 8000 --directory _site
"""
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "app"))
import server  # noqa: E402  (reuses the same report and memory readers as the local app)

OUT = ROOT / "_site"
STATIC = ROOT / "app" / "static"


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / "data").mkdir(parents=True)

    html = (STATIC / "index.html").read_text(encoding="utf-8")
    html = html.replace("<head>", '<head>\n  <meta name="scout-mode" content="static">', 1)
    (OUT / "index.html").write_text(html, encoding="utf-8")
    for name in ("app.css", "app.js"):
        shutil.copy2(STATIC / name, OUT / name)

    runs = server.list_runs()
    for r in runs:
        for key in ("path", "docx"):
            if r.get(key):
                dest = OUT / r[key]
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(ROOT / r[key], dest)

    site = {
        "runs": runs,
        "rules": server.read_memory(),
        **server.dashboard(),
        "builtAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    (OUT / "data" / "site.json").write_text(json.dumps(site, ensure_ascii=False, indent=1), encoding="utf-8")
    (OUT / ".nojekyll").write_text("", encoding="utf-8")
    print(f"Built {OUT} with {len(runs)} reports and {len(site['rules'])} rules.")


if __name__ == "__main__":
    main()
