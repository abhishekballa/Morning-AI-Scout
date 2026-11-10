"use strict";

const $ = (s) => document.querySelector(s);
const state = { runs: [], current: null, copyTexts: [] };

// On the public website (GitHub Pages) there's no local server: data comes from data/site.json
// and rules are edited on GitHub instead.
const STATIC = document.querySelector('meta[name="scout-mode"]')?.content === "static";
let siteData = null;

async function loadSite(force = false) {
  if (!siteData || force) {
    const res = await fetch("data/site.json", { cache: "no-store" });
    if (!res.ok) throw new Error("Couldn't load the reports.");
    siteData = await res.json();
  }
  return siteData;
}

const encodePath = (p) => p.split("/").map(encodeURIComponent).join("/");
const docxHref = (p) => (STATIC ? encodePath(p) : "/api/docx?path=" + encodeURIComponent(p));

async function getRuns(force = false) {
  return STATIC ? (await loadSite(force)).runs : (await api("/api/runs")).runs;
}
async function getReport(path) {
  if (!STATIC) return (await api("/api/report?path=" + encodeURIComponent(path))).markdown;
  const res = await fetch(encodePath(path), { cache: "no-store" });
  if (!res.ok) throw new Error("Report not found.");
  return res.text();
}
async function getRules() {
  return STATIC ? (await loadSite()).rules : (await api("/api/memory")).rules;
}
async function getDashboard(force = false) {
  return STATIC ? loadSite(force) : api("/api/dashboard");
}

// ---------- Helpers ----------

async function api(path, body) {
  const opts = body === undefined ? {} : {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Scout-App": "1" },
    body: JSON.stringify(body),
  };
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function inline(s) {
  let h = esc(s);
  h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (m, t, u) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`);
  h = h.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  h = h.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\*)/g, "$1<em>$2</em>");
  return h;
}

function plain(s) {
  return String(s)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .trim();
}

function stripQuotes(s) {
  return s.trim().replace(/^["“]/, "").replace(/["”]$/, "").trim();
}

let toastTimer;
function toast(msg, isError = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast show" + (isError ? " error" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = "toast"), isError ? 6000 : 3500);
}

function niceDate(iso, opts) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-IN", { timeZone: "UTC", ...opts });
}

// ---------- Markdown → sections ----------

function parseReport(md) {
  const doc = { title: "", notes: [], sections: [] };
  let cur = null;
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line.trim().startsWith("```")) continue;
    if (line.startsWith("# ")) { doc.title = line.slice(2); continue; }
    if (line.startsWith("## ")) { cur = { heading: line.slice(3).trim(), lines: [] }; doc.sections.push(cur); continue; }
    if (!cur) { if (line.trim()) doc.notes.push(line.replace(/^>\s?/, "")); continue; }
    cur.lines.push(line);
  }
  return doc;
}

function blocks(lines) {
  const out = [];
  for (const l of lines) {
    if (!l.trim()) continue;
    let m;
    if ((m = l.match(/^\s*(\d+)\.\s+(.*)$/))) out.push({ t: "li", text: m[2] });
    else if ((m = l.match(/^\s*[-*]\s+(.*)$/))) out.push({ t: "li", text: m[1] });
    else if (l.startsWith(">")) out.push({ t: "quote", text: l.replace(/^>\s?/, "") });
    else out.push({ t: "p", text: l.trim() });
  }
  return out;
}

function splitLabel(text) {
  // "**Label:** rest"  or  "**Label**: rest"
  const m = text.match(/^\*\*(.+?)\*\*\s*:?\s*(.*)$/);
  return m ? { label: m[1].replace(/:\s*$/, "").trim(), body: m[2] } : { label: "", body: text };
}

// ---------- Section renderers ----------

function renderPick(sec) {
  const title = stripQuotes(sec.heading.split(":").slice(1).join(":"));
  let html = `<section class="card pick"><div class="eyebrow">Today's video idea</div><h2 class="pick-title">${inline(title)}</h2>`;
  for (const b of blocks(sec.lines)) {
    if (b.t === "quote") html += `<div class="callout">${inline(b.text)}</div>`;
    else {
      const m = b.text.match(/^Why this one:\s*(.*)$/i);
      html += m ? `<p><span class="why-label">Why this one:</span> ${inline(m[1])}</p>` : `<p>${inline(b.text)}</p>`;
    }
  }
  return html + "</section>";
}

function renderHooks(sec) {
  const items = blocks(sec.lines).filter((b) => b.t === "li");
  let html = `<h3 class="section-title">Hook options</h3><div class="hooks">`;
  items.forEach((b, i) => {
    const { label, body } = splitLabel(b.text);
    const text = stripQuotes(body);
    const idx = state.copyTexts.push(plain(text)) - 1;
    html += `<article class="card hook">
      <div class="hook-top"><span class="pill">${esc(label || "Hook " + (i + 1))}</span>
      <button class="btn small" type="button" data-copy="${idx}">Copy</button></div>
      <p class="hook-text">${inline(text)}</p></article>`;
  });
  return html + "</div>";
}

function renderOutline(sec) {
  const items = blocks(sec.lines).filter((b) => b.t === "li");
  let html = `<h3 class="section-title">Video outline</h3><section class="card"><ol class="steps">`;
  for (const b of items) {
    const { label, body } = splitLabel(b.text);
    html += `<li>${label ? `<span class="step-title">${inline(label)}</span>` : ""}${inline(body)}</li>`;
  }
  return html + "</ol></section>";
}

function priceClass(p) {
  const s = p.toLowerCase();
  if (/paid/.test(s) && !/free/.test(s)) return "paid";
  if (/plan/.test(s)) return "plan";
  if (/free/.test(s)) return "free";
  return "other";
}

function renderFinds(sec) {
  const items = blocks(sec.lines).filter((b) => b.t === "li");
  let html = `<h3 class="section-title">Top ${items.length} finds</h3><div class="finds">`;
  items.forEach((b, i) => {
    let t = b.text, name = "", url = "", price = "", m;
    m = t.match(/^\*\*\[(.+?)\]\((.+?)\)\*\*\s*/) || t.match(/^\[\*\*(.+?)\*\*\]\((.+?)\)\s*/) || t.match(/^\[(.+?)\]\((.+?)\)\s*/);
    if (m) { name = m[1]; url = m[2]; t = t.slice(m[0].length); }
    else if ((m = t.match(/^\*\*(.+?)\*\*\s*/))) { name = m[1]; t = t.slice(m[0].length); }
    if ((m = t.match(/^\(([^)]*)\)\s*:?\s*/))) { price = m[1]; t = t.slice(m[0].length); }
    else t = t.replace(/^:\s*/, "");
    const nameHtml = url && /^https?:\/\//.test(url)
      ? `<a href="${esc(url)}" target="_blank" rel="noopener">${inline(name)}</a>` : inline(name || "Find " + (i + 1));
    // "Free, no credit card; not re-verified" -> badge "Free" + small note "No credit card · Not re-verified"
    const [label, ...extra] = price.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    const note = extra.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" · ");
    html += `<article class="card find">
      <div class="find-head"><span class="find-rank">#${i + 1}</span>${label ? `<span class="badge ${priceClass(price)}">${esc(label)}</span>` : ""}</div>
      <div class="find-name">${nameHtml}</div>
      ${note ? `<div class="find-note">${esc(note)}</div>` : ""}
      <p>${inline(t)}</p></article>`;
  });
  return html + "</div>";
}

function renderSources(sec) {
  const items = blocks(sec.lines).filter((b) => b.t === "li");
  const lis = items.map((b) => {
    const m = b.text.match(/^(https?:\/\/\S+)(.*)$/);
    return m ? `<li><a href="${esc(m[1])}" target="_blank" rel="noopener">${esc(m[1])}</a>${esc(m[2])}</li>` : `<li>${inline(b.text)}</li>`;
  }).join("");
  return `<details class="card"><summary>Sources (${items.length})</summary><ul class="sources">${lis}</ul></details>`;
}

function renderGeneric(sec) {
  let html = `<h3 class="section-title">${inline(sec.heading)}</h3><section class="card generic">`;
  let inList = false;
  for (const b of blocks(sec.lines)) {
    if (b.t === "li" && !inList) { html += "<ul>"; inList = true; }
    if (b.t !== "li" && inList) { html += "</ul>"; inList = false; }
    if (b.t === "li") html += `<li>${inline(b.text)}</li>`;
    else if (b.t === "quote") html += `<div class="callout">${inline(b.text)}</div>`;
    else html += `<p>${inline(b.text)}</p>`;
  }
  return html + (inList ? "</ul>" : "") + "</section>";
}

function renderReport(run, md) {
  state.copyTexts = [];
  const doc = parseReport(md);
  const find = (re) => doc.sections.find((s) => re.test(s.heading));
  const pick = find(/^today'?s pick/i), hooks = find(/^hook/i), outline = find(/^video outline|^outline/i),
        finds = find(/^top \d+|^top finds/i), sources = find(/^sources/i);
  const known = new Set([pick, hooks, outline, finds, sources]);

  let html = `<div class="report-head"><div>
      <h2>${esc(niceDate(run.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" }))}</h2>
      <div class="meta">Run ${run.run} · ${esc(run.name)}</div></div>
      ${run.docx ? `<a class="btn" href="${esc(docxHref(run.docx))}" download>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Word file</a>` : ""}</div>`;

  if (doc.notes.length) html += `<div class="callout notice">${doc.notes.map(inline).join("<br>")}</div>`;
  if (pick) html += renderPick(pick);
  if (hooks) html += renderHooks(hooks);
  if (outline) html += renderOutline(outline);
  if (finds) html += renderFinds(finds);
  for (const s of doc.sections) if (!known.has(s)) html += renderGeneric(s);
  if (sources) html += renderSources(sources);
  if (!doc.sections.length) html += `<div class="empty">This report is empty.</div>`;

  const el = $("#report");
  el.innerHTML = html;
  el.scrollTop = 0;
}

// ---------- Report list ----------

function renderRunList() {
  const list = $("#runList");
  if (!state.runs.length) {
    list.innerHTML = `<p class="muted small" style="margin:0 8px">No reports yet. The first one arrives after the 8 AM run.</p>`;
    return;
  }
  const byDay = new Map();
  for (const r of state.runs) {
    if (!byDay.has(r.date)) byDay.set(r.date, []);
    byDay.get(r.date).push(r);
  }
  let html = "";
  for (const [date, runs] of byDay) {
    const label = niceDate(date, { weekday: "short", day: "numeric", month: "short" });
    html += `<div class="day"><div class="day-label">${esc(label)}</div>`;
    for (const r of runs) {
      const cur = state.current && state.current.path === r.path;
      html += `<button class="run" type="button" data-path="${esc(r.path)}" aria-current="${cur}">
        <span class="run-num"><span class="run-date">${esc(label)} · </span>Run ${r.run}</span>
        <span class="run-title">${inline(r.title || r.name)}</span></button>`;
    }
    html += "</div>";
  }
  list.innerHTML = html;
}

async function openRun(path, { focus = false } = {}) {
  const run = state.runs.find((r) => r.path === path) || state.runs[0];
  if (!run) {
    $("#report").innerHTML = `<div class="empty">No reports yet. Press <strong>Get latest</strong> after the 8 AM run.</div>`;
    return;
  }
  state.current = run;
  renderRunList();
  try {
    renderReport(run, await getReport(run.path));
    history.replaceState(null, "", "#" + encodeURIComponent(run.path));
    if (focus) $("#report").focus({ preventScroll: true });
    if (focus && window.matchMedia("(max-width: 760px)").matches) $("#report").scrollIntoView({ behavior: "smooth" });
  } catch (e) {
    $("#report").innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

async function loadRuns(preferPath, force = false) {
  const runs = await getRuns(force);
  state.runs = runs;
  const fromHash = decodeURIComponent(location.hash.slice(1));
  const path = [preferPath, fromHash].find((p) => p && runs.some((r) => r.path === p)) || (runs[0] && runs[0].path);
  await openRun(path);
}

// ---------- Memory ----------

function renderRules(rules) {
  state.rulesCount = rules.length;
  $("#ruleCount").textContent = rules.length;
  const ul = $("#rules");
  if (!rules.length) { ul.innerHTML = `<li class="none">No rules yet. Add your first one above.</li>`; return; }
  ul.innerHTML = rules.slice().reverse().map((r) => `
    <li><div class="rule-body"><span class="rule-date">${esc(niceDate(r.date, { day: "numeric", month: "short", year: "numeric" }))}</span>${esc(r.text)}</div>
    ${STATIC ? "" : `<button class="icon-btn" type="button" data-del-date="${esc(r.date)}" data-del-text="${esc(r.text)}" aria-label="Delete rule: ${esc(r.text)}" title="Delete rule">
      <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    </button>`}</li>`).join("");
}

function gitMessage(g, verb) {
  if (g.pushed) return `${verb} and pushed to GitHub. The next run will see it.`;
  if (g.saved) return `${verb} on this computer, but it couldn't be pushed to GitHub yet. ${g.detail || ""}`.trim();
  return `${verb} locally, but Git couldn't save it: ${g.detail || "unknown error"}`;
}

// ---------- Dashboard ----------

const IST = "Asia/Kolkata";
const todayIST = () => new Date().toLocaleDateString("en-CA", { timeZone: IST });
const fmtIST = (d) => d.toLocaleString("en-IN", { timeZone: IST, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) + " IST";

function nextRunDate() {
  const now = new Date(), next = new Date(now);
  next.setUTCHours(2, 30, 0, 0); // 8:00 AM IST
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

function ago(d) {
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) { const h = Math.floor(s / 3600); return `${h} hour${h > 1 ? "s" : ""} ago`; }
  const days = Math.floor(s / 86400);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

const STATUS_LABEL = { ok: "Success", partial: "Partly worked", failed: "Failed" };
const statusChip = (s) => `<span class="chip ${esc(s || "unknown")}">${esc(STATUS_LABEL[s] || "Unknown")}</span>`;

function findIssues(d, last) {
  const issues = [];
  const now = new Date();
  const istHour = +now.toLocaleString("en-GB", { timeZone: IST, hour: "2-digit", hour12: false });
  const istMin = +now.toLocaleString("en-GB", { timeZone: IST, minute: "2-digit" });
  const hasToday = state.runs.some((r) => r.date === todayIST());
  if (!hasToday && (istHour > 8 || (istHour === 8 && istMin >= 45))) {
    issues.push({ level: "error", text: "Today's 8 AM report hasn't arrived yet. Open the routine on claude.ai to see what happened." + (STATIC ? " (Or the website hasn't refreshed yet: tap Refresh.)" : " Tap Get latest first in case it's on GitHub.") });
  }
  if (last && last.status && last.status !== "ok") {
    for (const e of last.errors || []) issues.push({ level: last.status === "failed" ? "error" : "warn", text: e });
    if (!(last.errors || []).length) issues.push({ level: "warn", text: `The last run ended as "${STATUS_LABEL[last.status] || last.status}".` });
  }
  return issues;
}

let countdownTimer;
function startCountdown() {
  clearInterval(countdownTimer);
  const tick = () => {
    const el = $("#countdown");
    if (!el) return;
    const ms = nextRunDate() - Date.now();
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    el.textContent = `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
  };
  tick();
  countdownTimer = setInterval(tick, 1000);
}

function renderDashboard(d) {
  state.dash = d;
  $("#runBtn").href = d.routineUrl;
  const next = nextRunDate();
  const sameDay = next.toLocaleDateString("en-CA", { timeZone: IST }) === todayIST();
  $("#nextRun").textContent = `Runs daily at 8:00 AM IST · next run ${sameDay ? "today" : "tomorrow"}`;

  // The last run is whichever is newer: the latest run-log entry, or the latest report commit
  // (older runs, or runs that crashed before writing the log, only show up as commits).
  const logged = d.log[0];
  const logTime = logged && (logged.finished || logged.started) ? new Date(logged.finished || logged.started) : null;
  const commitTime = d.lastReportCommit ? new Date(d.lastReportCommit) : null;
  const commitIsNewer = commitTime && (!logTime || commitTime - logTime > 10 * 60 * 1000);
  const last = commitIsNewer ? null : logged;
  const lastTime = commitIsNewer ? commitTime : logTime;
  const issues = findIssues(d, last);
  const errors = issues.filter((i) => i.level === "error").length;

  let html = `<div class="stats">
    <div class="stat">
      <span class="stat-label">Last run</span>
      <span class="stat-value">${lastTime ? esc(ago(lastTime)) : "No runs yet"}</span>
      <span class="stat-sub">${lastTime ? esc(fmtIST(lastTime)) : "&nbsp;"} ${last ? statusChip(last.status) : lastTime ? `<span class="chip unknown" title="This run didn't write a run log, so its errors aren't known">No log</span>` : ""}</span>
    </div>
    <div class="stat">
      <span class="stat-label">Next run in</span>
      <span class="stat-value mono" id="countdown">--</span>
      <span class="stat-sub">${esc(fmtIST(next))} · may start a few min late</span>
    </div>
    <div class="stat ${issues.length ? (errors ? "bad" : "warnish") : "good"}">
      <span class="stat-label">Health</span>
      <span class="stat-value">${issues.length ? `${issues.length} issue${issues.length > 1 ? "s" : ""}` : "All good"}</span>
      <span class="stat-sub">${issues.length ? "See the list below" : last ? "No errors in the last run" : "No errors logged"}</span>
    </div>
    <div class="stat">
      <span class="stat-label">Library</span>
      <span class="stat-value">${state.runs.length} report${state.runs.length === 1 ? "" : "s"}</span>
      <span class="stat-sub">${(state.rulesCount ?? 0)} rules · ${d.inbox ? "1 note waiting" : "no note waiting"}</span>
    </div>
  </div>`;

  if (issues.length) {
    html += `<section class="card issues" aria-label="Issues">
      <h3>${errors ? "Problems to look at" : "Warnings from the last run"}${last ? ` <span class="muted small">· ${esc(niceDate(last.date, { day: "numeric", month: "short" }))}, Run ${esc(last.run)}</span>` : ""}</h3>
      <ul>${issues.map((i) => `<li class="${i.level}">${esc(i.text)}</li>`).join("")}</ul></section>`;
  }

  const links = [
    [d.routineUrl, "Routine on claude.ai"],
    [d.repoUrl, "GitHub repo"],
    [d.driveUrl, "Google Drive folder"],
    STATIC ? null : [d.siteUrl, "Public website"],
  ].filter(Boolean);
  html += `<div class="quick-links">${links.map(([u, t]) => `<a class="link-chip" href="${esc(u)}" target="_blank" rel="noopener">${esc(t)} ↗</a>`).join("")}</div>`;

  if (d.log.length) {
    html += `<details class="card history"><summary>Run history (${d.log.length})</summary><div class="table-wrap"><table>
      <thead><tr><th>When</th><th>Run</th><th>Status</th><th>Video pick</th><th>Links</th></tr></thead><tbody>
      ${d.log.map((r) => {
        const t = r.finished || r.started;
        const report = state.runs.find((x) => x.path === r.report);
        return `<tr><td>${t ? esc(fmtIST(new Date(t))) : esc(r.date)}</td><td>${esc(r.run)}</td><td>${statusChip(r.status)}</td>
          <td class="te">${esc(r.pick || "")}</td>
          <td class="nowrap">${report ? `<button class="linkish" type="button" data-open="${esc(report.path)}">Report</button>` : ""}${r.driveUrl ? ` · <a href="${esc(r.driveUrl)}" target="_blank" rel="noopener">Doc</a>` : ""}</td></tr>`;
      }).join("")}</tbody></table></div></details>`;
  }

  $("#dash").innerHTML = html;
  startCountdown();
  renderNote(d.inbox);
}

async function loadDashboard(force = false) {
  try { renderDashboard(await getDashboard(force)); }
  catch (e) { $("#dash").innerHTML = `<div class="callout">Couldn't load the dashboard: ${esc(e.message)}</div>`; }
}

// ---------- Note for the next run ----------

function renderNote(text) {
  const box = $("#pendingNote");
  if (!text) { box.hidden = true; box.innerHTML = ""; return; }
  box.hidden = false;
  box.innerHTML = `<div class="pending-head"><span class="pending-label">Waiting for the next run</span>
    ${STATIC ? `<a href="${esc((state.dash && state.dash.repoUrl) || "")}/edit/main/inbox.md" target="_blank" rel="noopener">Edit on GitHub</a>`
             : `<button class="linkish" type="button" id="clearNote">Clear</button>`}</div>
    <p>${esc(text).replace(/\n/g, "<br>")}</p>`;
}

function selectTab(which) {
  const note = which === "note";
  $("#tabNote").setAttribute("aria-selected", note);
  $("#tabRule").setAttribute("aria-selected", !note);
  $("#panelNote").hidden = !note;
  $("#panelRule").hidden = note;
}

// ---------- Events ----------

document.addEventListener("click", async (e) => {
  const run = e.target.closest(".run");
  if (run) return openRun(run.dataset.path, { focus: true });

  const open = e.target.closest("[data-open]");
  if (open) return openRun(open.dataset.open, { focus: true });

  const tab = e.target.closest(".tab");
  if (tab) return selectTab(tab.id === "tabNote" ? "note" : "rule");

  if (e.target.closest("#clearNote")) {
    if (!confirm("Clear the note? The next run won't see it.")) return;
    try {
      const res = await api("/api/inbox", { text: "" });
      renderNote(res.inbox);
      toast(gitMessage(res.git, "Note cleared"), !res.git.pushed);
      loadDashboard();
    } catch (err) { toast(err.message, true); }
    return;
  }

  const copy = e.target.closest("[data-copy]");
  if (copy) {
    try {
      await navigator.clipboard.writeText(state.copyTexts[+copy.dataset.copy]);
      copy.textContent = "Copied";
      setTimeout(() => (copy.textContent = "Copy"), 1500);
    } catch { toast("Couldn't copy. Select the text and copy it instead.", true); }
    return;
  }

  const del = e.target.closest("[data-del-text]");
  if (del) {
    if (!confirm(`Delete this rule?\n\n"${del.dataset.delText}"\n\nThe scout will stop following it from tomorrow.`)) return;
    del.disabled = true;
    try {
      const res = await api("/api/memory/delete", { date: del.dataset.delDate, text: del.dataset.delText });
      renderRules(res.rules);
      toast(gitMessage(res.git, "Rule deleted"), !res.git.pushed);
    } catch (err) { toast(err.message, true); del.disabled = false; }
  }
});

$("#feedback").addEventListener("input", (e) => { $("#charCount").textContent = `${e.target.value.length} / 400`; });
$("#feedback").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) $("#feedbackForm").requestSubmit();
});

$("#feedbackForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const box = $("#feedback"), btn = $("#saveBtn");
  const text = box.value.trim();
  if (!text) { toast("Type your feedback first.", true); box.focus(); return; }
  if (STATIC) {
    // The website can't change files, so copy the rule and open memory.md on GitHub to paste it.
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const line = `- ${today}: ${text.replace(/\s+/g, " ")}`;
    const repo = (siteData && siteData.repoUrl) || "https://github.com/abhishekballa/Morning-AI-Scout";
    // Start the copy and open GitHub straight away, while the tap still counts (pop-up blockers).
    if (navigator.clipboard) navigator.clipboard.writeText(line).catch(() => {});
    window.open(`${repo}/edit/main/memory.md`, "_blank", "noopener");
    toast("Rule copied. Paste it on a new line at the end of memory.md, then tap Commit changes.");
    return;
  }
  btn.disabled = true; btn.textContent = "Saving…";
  try {
    const res = await api("/api/memory", { text });
    renderRules(res.rules);
    box.value = ""; $("#charCount").textContent = "0 / 400";
    toast(gitMessage(res.git, "Rule saved"), !res.git.pushed);
  } catch (err) { toast(err.message, true); }
  finally { btn.disabled = false; btn.textContent = "Save rule"; }
});

$("#noteText").addEventListener("input", (e) => { $("#noteCount").textContent = `${e.target.value.length} / 1000`; });
$("#noteText").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) $("#noteForm").requestSubmit();
});

$("#noteForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const box = $("#noteText"), btn = $("#noteBtn");
  const text = box.value.trim();
  if (!text) { toast("Type your note first.", true); box.focus(); return; }
  if (STATIC) {
    const repo = (siteData && siteData.repoUrl) || "https://github.com/abhishekballa/Morning-AI-Scout";
    if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
    window.open(`${repo}/edit/main/inbox.md`, "_blank", "noopener");
    toast("Note copied. Paste it under the heading in inbox.md, then tap Commit changes.");
    return;
  }
  btn.disabled = true; btn.textContent = "Sending…";
  try {
    const res = await api("/api/inbox", { text });
    box.value = ""; $("#noteCount").textContent = "0 / 1000";
    toast(gitMessage(res.git, "Note sent"), !res.git.pushed);
    loadDashboard();
  } catch (err) { toast(err.message, true); }
  finally { btn.disabled = false; btn.textContent = "Send note"; }
});

$("#syncBtn").addEventListener("click", async () => {
  const btn = $("#syncBtn");
  btn.disabled = true;
  btn.classList.add("spinning");
  try {
    if (STATIC) {
      await loadRuns(state.current && state.current.path, true);
      renderRules(siteData.rules);
      toast("Showing the latest reports.");
    } else {
      const res = await api("/api/sync", {});
      await loadRuns(state.current && state.current.path);
      renderRules(await getRules());
      toast(res.detail);
    }
    await loadDashboard();
  } catch (err) { toast(err.message, true); }
  finally { btn.disabled = false; btn.classList.remove("spinning"); }
});

// Keep "x min ago" and the issue check fresh while the page stays open.
setInterval(() => { if (state.dash) renderDashboard(state.dash); }, 60000);

// ---------- Start ----------

(async function start() {
  if (STATIC) {
    $("#syncBtn .label-long").textContent = "Refresh";
    $("#syncBtn").title = "Check for new reports";
    $("#syncBtn").setAttribute("aria-label", "Refresh reports");
    $("#teachHint").innerHTML = "A permanent rule, kept in <code>memory.md</code> on GitHub. Tap <strong>Add on GitHub</strong>, paste the copied rule there and commit. Every run from then on follows it.";
    $("#saveBtn").textContent = "Add on GitHub";
    $("#noteHint").innerHTML = "A one-time instruction for the next run. Tap <strong>Send on GitHub</strong>, paste the copied note into <code>inbox.md</code> and commit. The scout clears it after using it.";
    $("#noteBtn").textContent = "Send on GitHub";
    loadSite().then((d) => {
      const a = $("#editRules");
      a.href = `${d.repoUrl}/edit/main/memory.md`;
      a.hidden = false;
    }).catch(() => {});
  }
  try { renderRules(await getRules()); } catch (e) { toast(e.message, true); }
  try { await loadRuns(); } catch (e) { $("#report").innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  await loadDashboard();
})();
