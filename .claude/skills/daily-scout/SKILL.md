---
name: daily-scout
description: The morning run for Morning AI Scout. Finds the best AI tools and AI news from the last 24 hours, picks one video idea for Abhi's Telugu AI-tools channel, writes 3 hooks and a 5-point outline, and saves it as a .md and a .docx in "Daily AI news/AI News YYYY-MM-DD/", plus a Google Doc in the same folders on Google Drive, then logs the run and pushes to GitHub. Use when asked to run the scout, do the morning run, or find today's video idea.
---

# Daily Scout: the morning run

Follow these 9 steps in order. Don't skip any. Write down the time you start (UTC) for the run log in Step 8.

## Step 1: Read memory.md and inbox.md
- Open `memory.md` in the project folder and read every rule in it.
- Follow those rules for the whole run. If a rule here and a rule in memory.md disagree, **memory.md wins**.
- Open `inbox.md`. Anything written under its heading (ignore the `<!-- -->` comment) is a **one-time note from Abhi for this run only**, for example "focus on AI video tools today". Follow it for this run. If it clashes with memory.md, follow the note this time. If the file is missing or has no note, carry on.

## Step 2: Search the web (last 24 hours only)
Look for new **AI tools** and **AI news** from these sources:
- **Product Hunt**: today's top AI launches
- **Hacker News**: AI posts on the front page
- **Reddit**: r/artificial, r/ChatGPT, r/OpenAI, r/LocalLLaMA, r/singularity
- **X (Twitter)**: what AI builders and companies are posting about
- **Official AI company blogs**: OpenAI, Anthropic, Google (Gemini / DeepMind), Meta AI, Microsoft, Mistral, and others

Rules for this step:
- Check the date on every item. **If it's older than 24 hours, drop it.**
- Write down the source link for every item you keep.
- Aim for 10–15 candidates before moving on.

## Step 3: Shortlist the top 5
From your candidates, pick the 5 best. Rank them by:
- **Free to try**: this matters most. Pick mostly tools that are free or have a real free plan. Check the pricing page; don't guess.
- **Useful for beginners and creators**: can a normal person try it today, without coding?
- **Fresh and exciting**: is it new, surprising, or a big deal?

At least 4 of the 5 should be tools the audience can try for free. Skip API-only, enterprise or paid-only tools unless the news is huge.

For each one, write:
- Its name and a link
- **Price**: Free, Free plan, or Paid
- **One line on why it matters** to Abhi's audience

## Step 4: Pick the ONE best video idea
- Choose one item from the top 5 (or one idea that combines two of them). It should be something viewers can try for free.
- Turn it into a video idea with a clear title.
- Explain **why it's the best pick** in 2–3 lines: why this audience will click, why now, and what they'll be able to do after watching.

## Step 5: Write 3 hooks and a 5-point outline
**3 hook options**
- Each hook is the first 15–30 seconds of the video.
- Write them in **Telugu-English mix**, the way Abhi talks: Telugu words in **Telugu script (తెలుగు)**, with English tech words kept in English. Don't write Telugu in English letters. Example style: *"ఈ AI tool తో మీ photos ని 10 seconds లో video గా మార్చచ్చు, completely free!"*
- Make each one a different style, for example a question, a bold claim, or a "you're doing this wrong" hook.

**5-point video outline**
- Exactly 5 points, in the order the video will flow.
- Each point gets a short title and 1–2 bullets on what to show or say.
- Include at least one live demo step where Abhi uses the tool on screen.

## Step 6: Save the output
- Get today's date (format `YYYY-MM-DD`).
- Create today's folder inside `Daily AI news/`, named `AI News YYYY-MM-DD` (example: `Daily AI news/AI News 2026-11-10/`).
- Save the file inside it as `AI News YYYY-MM-DD.md` (example: `Daily AI news/AI News 2026-11-10/AI News 2026-11-10.md`).
- If that file already exists, don't overwrite it. Save as `AI News YYYY-MM-DD (2).md` in the same folder instead.
- Use this template:

```markdown
# Morning AI Scout: YYYY-MM-DD

## Top 5 finds
1. **[Name](link)** (Free / Free plan / Paid): why it matters
2. ...

## Today's pick: <video title>
Why this one: ...

## Hook options
1. ...
2. ...
3. ...

## Video outline
1. **Point title**: what to show or say
2. ...
3. ...
4. ...
5. ...

## Sources
- link
- link
```

**Then make the Word file.** Run this from the project folder, using the path of the .md file you just saved:

```
python tools/md_to_docx.py "Daily AI news/AI News YYYY-MM-DD/AI News YYYY-MM-DD.md"
```

It saves `AI News YYYY-MM-DD.docx` next to the .md. Check that the folder now has **both files**.

## Step 7: Upload to Google Drive
Use the Google Drive tools. Keep the same folder names as on the computer.

1. **Find the main folder.** Search My Drive for a folder named exactly `Daily AI news` that isn't in the trash. If it's missing, create it in My Drive.
2. **Find or create today's folder.** Inside `Daily AI news`, look for `AI News YYYY-MM-DD`. If it's missing, create it there.
3. **Create the doc.** Inside today's folder, create a Google Doc named `AI News YYYY-MM-DD` from the same text as the .md file (upload it as Markdown, which Drive turns into a formatted Google Doc). If you saved a `(2)` file locally, name the doc `AI News YYYY-MM-DD (2)`.
4. **Check it.** Open the new doc's details and make sure it's in the right folder and the content is there.

If the Drive tools aren't connected, finish the local files anyway and tell Abhi the upload was skipped.

## Step 8: Write the run log
The dashboard reads `logs/run-history.json` to show the last run time and any errors. Add one entry for this run to the **start** of its `runs` list (create the file as `{"runs": []}` if it's missing). Keep the JSON valid.

```json
{
  "date": "YYYY-MM-DD",
  "run": 1,
  "started": "2026-11-11T02:37:30Z",
  "finished": "2026-11-11T02:40:12Z",
  "status": "ok",
  "pick": "today's video title",
  "report": "Daily AI news/AI News YYYY-MM-DD/AI News YYYY-MM-DD.md",
  "driveUrl": "link to the Google Doc, or empty",
  "noteUsed": "the inbox.md note you followed, or empty",
  "errors": []
}
```

- `run` is 1 for the plain file, 2 for "(2)", and so on.
- `started` and `finished` are UTC times. Get them with `date -u +%Y-%m-%dT%H:%M:%SZ`.
- `status` is `"ok"` if everything worked, `"partial"` if the report was saved but something went wrong, or `"failed"` if no report was saved.
- `errors` lists every problem in one plain sentence each, for example "Product Hunt couldn't be opened (network blocked)", "Drive upload skipped: Drive tools not connected" or "Only 3 of 5 finds are free".

**Then clear the note:** if `inbox.md` had a note, put the file back to just its heading and comment, so the note isn't used twice.

## Step 9: Save to GitHub
Commit everything you changed (the report folder, `logs/run-history.json` and `inbox.md`) with the message `Morning scout: YYYY-MM-DD`, and push to `main`. If pushing to `main` is refused, push to a branch named `scout/YYYY-MM-DD` and add that to the run log's errors.

When you're done, tell Abhi which video idea you picked, where the two local files are, the link to the Google Doc, and any errors.
