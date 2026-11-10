"""Morning AI Scout app: a small local website to read the daily reports and teach the agent.

Start it:   python app/server.py
Then open:  http://127.0.0.1:8765   (it opens by itself unless you pass --no-browser)

Only uses Python's standard library. It only listens on this computer (127.0.0.1).
"""
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import webbrowser
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent.parent
NEWS = ROOT / "Daily AI news"
MEMORY = ROOT / "memory.md"
STATIC = Path(__file__).resolve().parent / "static"
HOST, PORT = "127.0.0.1", 8765
IST = timezone(timedelta(hours=5, minutes=30))
ROUTINE_URL = "https://claude.ai/code/routines/trig_01Eiws89eAndkFzgG8GaZQuJ"
REPO_URL = "https://github.com/abhishekballa/Morning-AI-Scout"

RULE_RE = re.compile(r"^- (\d{4}-\d{2}-\d{2}): (.+)$")
DAY_RE = re.compile(r"AI News (\d{4}-\d{2}-\d{2})")
STATIC_FILES = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/app.css": ("app.css", "text/css; charset=utf-8"),
    "/app.js": ("app.js", "text/javascript; charset=utf-8"),
}
ALLOWED_HOSTS = {f"127.0.0.1:{PORT}", f"localhost:{PORT}"}
git_lock = threading.Lock()


# ---------- Git ----------

def find_git():
    found = shutil.which("git")
    if found:
        return found
    fallback = Path(r"C:\Program Files\Git\cmd\git.exe")
    return str(fallback) if fallback.exists() else None


GIT = find_git()


def git(*args, timeout=90):
    """Run a git command in the project folder. Returns (ok, output)."""
    if not GIT:
        return False, "Git isn't installed on this computer."
    env = dict(os.environ, GIT_TERMINAL_PROMPT="0")
    try:
        r = subprocess.run([GIT, *args], cwd=ROOT, capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=timeout, env=env)
    except subprocess.TimeoutExpired:
        return False, "Git took too long to answer."
    return r.returncode == 0, (r.stdout + r.stderr).strip()


def has_remote():
    ok, out = git("remote")
    return ok and "origin" in out.split()


def save_memory_to_git(message):
    """Commit memory.md and push it, so the cloud run uses the new rules tomorrow."""
    ok, out = git("add", "memory.md")
    if not ok:
        return {"saved": False, "pushed": False, "detail": out}
    ok, out = git("commit", "-m", message, "--", "memory.md")
    if not ok:
        return {"saved": False, "pushed": False, "detail": out}
    if not has_remote():
        return {"saved": True, "pushed": False, "detail": "No GitHub remote set up."}
    ok, out = git("push", "origin", "HEAD")
    return {"saved": True, "pushed": ok, "detail": "" if ok else out}


# ---------- Reports ----------

def report_title(md_path: Path):
    try:
        for line in md_path.read_text(encoding="utf-8").splitlines():
            if line.lower().startswith("## today's pick"):
                return line.split(":", 1)[-1].strip().strip('"').strip()
    except OSError:
        pass
    return ""


def list_runs():
    runs = []
    if NEWS.is_dir():
        for day in NEWS.iterdir():
            m = DAY_RE.fullmatch(day.name)
            if not (day.is_dir() and m):
                continue
            for md in day.glob("*.md"):
                n = re.search(r"\((\d+)\)$", md.stem)
                docx = md.with_suffix(".docx")
                runs.append({
                    "date": m.group(1),
                    "run": int(n.group(1)) if n else 1,
                    "name": md.stem,
                    "path": md.relative_to(ROOT).as_posix(),
                    "docx": docx.relative_to(ROOT).as_posix() if docx.exists() else None,
                    "title": report_title(md),
                })
    runs.sort(key=lambda r: (r["date"], r["run"]), reverse=True)
    return runs


def safe_report_path(rel, suffixes=(".md",)):
    """Only allow files inside 'Daily AI news' with the expected extension."""
    if not rel:
        return None
    p = (ROOT / rel).resolve()
    try:
        p.relative_to(NEWS.resolve())
    except ValueError:
        return None
    return p if p.suffix.lower() in suffixes and p.is_file() else None


# ---------- Memory ----------

def read_memory():
    if not MEMORY.exists():
        return []
    rules = []
    for line in MEMORY.read_text(encoding="utf-8").splitlines():
        m = RULE_RE.match(line.strip())
        if m:
            rules.append({"date": m.group(1), "text": m.group(2)})
    return rules


def add_rule(text):
    text = " ".join(str(text).split())
    if not text:
        return 400, {"error": "Type your feedback first."}
    if len(text) > 400:
        return 400, {"error": "Please keep it under 400 characters."}
    with git_lock:
        if has_remote():
            git("pull", "--ff-only")  # pick up any rules saved from elsewhere first
        today = datetime.now(IST).strftime("%Y-%m-%d")
        content = MEMORY.read_text(encoding="utf-8") if MEMORY.exists() else "# Memory\n"
        if not content.endswith("\n"):
            content += "\n"
        if "\n- " not in content and not content.endswith("\n\n"):
            content += "\n"
        content += f"- {today}: {text}\n"
        MEMORY.write_text(content, encoding="utf-8")
        result = save_memory_to_git(f"Feedback: {text[:60]}")
    return 200, {"rules": read_memory(), "git": result}


def delete_rule(date, text):
    with git_lock:
        if not MEMORY.exists():
            return 404, {"error": "memory.md is missing."}
        lines = MEMORY.read_text(encoding="utf-8").splitlines(keepends=True)
        target = f"- {date}: {text}"
        for i, line in enumerate(lines):
            if line.strip() == target:
                del lines[i]
                break
        else:
            return 404, {"error": "That rule wasn't found. Refresh and try again."}
        MEMORY.write_text("".join(lines), encoding="utf-8")
        result = save_memory_to_git(f"Remove rule: {text[:60]}")
    return 200, {"rules": read_memory(), "git": result}


# ---------- Status ----------

def next_run_ist():
    now = datetime.now(IST)
    run = now.replace(hour=8, minute=0, second=0, microsecond=0)
    if run <= now:
        run += timedelta(days=1)
    return run.isoformat()


def status():
    ok, last = git("log", "-1", "--format=%s|%cI")
    subject, when = (last.split("|", 1) + [""])[:2] if ok and last else ("", "")
    return {
        "git": bool(GIT),
        "remote": has_remote(),
        "lastCommit": {"subject": subject, "when": when},
        "nextRun": next_run_ist(),
        "routineUrl": ROUTINE_URL,
        "repoUrl": REPO_URL,
    }


def sync():
    with git_lock:
        if not has_remote():
            return 400, {"error": "No GitHub remote set up."}
        ok, out = git("pull", "--ff-only")
    if not ok:
        return 500, {"error": "Couldn't get the latest files from GitHub.", "detail": out}
    return 200, {"detail": "Already up to date." if "Already up to date" in out else "Got the latest reports.",
                 "runs": list_runs()}


# ---------- Web server ----------

class Handler(BaseHTTPRequestHandler):
    server_version = "MorningAIScout/1.0"

    def log_message(self, fmt, *args):
        sys.stdout.write("  %s\n" % (fmt % args))

    def _host_ok(self):
        return self.headers.get("Host", "") in ALLOWED_HOSTS

    def _send(self, code, body, ctype="application/json; charset=utf-8", extra=None):
        data = body if isinstance(body, bytes) else json.dumps(body).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy",
                         "default-src 'self'; style-src 'self' https://fonts.googleapis.com; "
                         "font-src https://fonts.gstatic.com; img-src 'self' data:; frame-ancestors 'none'")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if not self._host_ok():
            return self._send(403, {"error": "Forbidden"})
        url = urlparse(self.path)
        q = parse_qs(url.query)
        if url.path in STATIC_FILES:
            name, ctype = STATIC_FILES[url.path]
            return self._send(200, (STATIC / name).read_bytes(), ctype)
        if url.path == "/api/runs":
            return self._send(200, {"runs": list_runs()})
        if url.path == "/api/report":
            p = safe_report_path(q.get("path", [""])[0])
            if not p:
                return self._send(404, {"error": "Report not found."})
            return self._send(200, {"markdown": p.read_text(encoding="utf-8")})
        if url.path == "/api/docx":
            p = safe_report_path(q.get("path", [""])[0], (".docx",))
            if not p:
                return self._send(404, {"error": "Word file not found."})
            return self._send(200, p.read_bytes(),
                              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                              {"Content-Disposition": f'attachment; filename="{p.name}"'})
        if url.path == "/api/memory":
            return self._send(200, {"rules": read_memory()})
        if url.path == "/api/status":
            return self._send(200, status())
        return self._send(404, {"error": "Not found"})

    def do_POST(self):
        # Only this page can call these: other websites can't send the custom header.
        if (not self._host_ok() or self.headers.get("X-Scout-App") != "1"
                or "application/json" not in self.headers.get("Content-Type", "")):
            return self._send(403, {"error": "Forbidden"})
        try:
            length = min(int(self.headers.get("Content-Length", 0)), 10_000)
            body = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError):
            return self._send(400, {"error": "Bad request"})
        path = urlparse(self.path).path
        if path == "/api/memory":
            return self._send(*add_rule(body.get("text", "")))
        if path == "/api/memory/delete":
            return self._send(*delete_rule(str(body.get("date", "")), str(body.get("text", ""))))
        if path == "/api/sync":
            return self._send(*sync())
        return self._send(404, {"error": "Not found"})


def main():
    url = f"http://{HOST}:{PORT}"
    try:
        server = ThreadingHTTPServer((HOST, PORT), Handler)
    except OSError:
        print(f"Port {PORT} is busy. The app may already be running: open {url}")
        if "--no-browser" not in sys.argv:
            webbrowser.open(url)
        return
    print(f"Morning AI Scout is running at {url}\nPress Ctrl+C to stop.")
    if "--no-browser" not in sys.argv:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
