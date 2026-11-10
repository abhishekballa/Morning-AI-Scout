# Morning AI Scout

A Claude Code agent that runs every morning at 8:00 AM IST. It finds the best free AI tools and AI news from the last 24 hours, picks one video idea for a Telugu AI-tools YouTube channel, and writes 3 hooks and a 5-point outline.

## Where things are

| File | What it is |
|---|---|
| `CLAUDE.md` | The agent's job description |
| `memory.md` | Rules learned from feedback. The agent reads this first on every run |
| `.claude/skills/daily-scout/SKILL.md` | The step-by-step manual for the morning run |
| `Daily AI news/AI News YYYY-MM-DD/` | Each day's report, as `.md` and `.docx` |
| `tools/md_to_docx.py` | Turns a report into a Word file |
| `app/` | The Scout app (see below) |

## The Scout app

A clean local page to read the reports and teach the agent.

**Start it:** double-click `Open Scout App.bat`, or run:

```
python app/server.py
```

It opens http://127.0.0.1:8765 in your browser. In the app you can:

- **Read any day's report**: the video pick, hooks with copy buttons, the outline, the top 5 finds with price badges, and sources.
- **Download the Word file** for a report.
- **Teach the scout**: type feedback and it's saved to `memory.md` as a dated rule and pushed to GitHub, so the next 8 AM run follows it. You can delete rules too.
- **Get latest**: download the newest reports from GitHub.
- **Run now**: opens the cloud routine on claude.ai, where you can start a run.

The app only runs on your computer and needs no extra packages.
