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
async function getStatus() {
  if (!STATIC) return api("/api/status");
  const d = await loadSite();
  const now = new Date(), next = new Date(now);
  next.setUTCHours(2, 30, 0, 0); // 8:00 AM IST
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return { routineUrl: d.routineUrl, repoUrl: d.repoUrl, nextRun: next.toISOString() };
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
    html += `<article class="card find">
      <div class="find-head"><span class="find-rank">#${i + 1}</span>${price ? `<span class="badge ${priceClass(price)}">${esc(price)}</span>` : ""}</div>
      <div class="find-name">${nameHtml}</div>
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
  if (g.pushed) return `${verb} and pushed to GitHub. Tomorrow's run will use it.`;
  if (g.saved) return `${verb} on this computer, but it couldn't be pushed to GitHub yet. ${g.detail || ""}`.trim();
  return `${verb} in memory.md, but Git couldn't save it: ${g.detail || "unknown error"}`;
}

// ---------- Status ----------

async function loadStatus() {
  try {
    const s = await getStatus();
    $("#runBtn").href = s.routineUrl;
    const next = new Date(s.nextRun);
    const now = new Date();
    const fmtDay = (d) => d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
    const dayWord = fmtDay(next) === fmtDay(now) ? "today" : "tomorrow";
    $("#nextRun").textContent = `Runs daily at 8:00 AM IST · next run ${dayWord}`;
  } catch {
    $("#nextRun").textContent = "Runs daily at 8:00 AM IST";
  }
}

// ---------- Events ----------

document.addEventListener("click", async (e) => {
  const run = e.target.closest(".run");
  if (run) return openRun(run.dataset.path, { focus: true });

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

$("#syncBtn").addEventListener("click", async () => {
  const btn = $("#syncBtn");
  btn.disabled = true;
  if (STATIC) {
    try {
      await loadRuns(undefined, true);
      renderRules(siteData.rules);
      toast("Showing the latest reports.");
    } catch (err) { toast(err.message, true); }
    finally { btn.disabled = false; }
    return;
  }
  try {
    const res = await api("/api/sync", {});
    state.runs = res.runs;
    await loadRuns(state.runs[0] && state.runs[0].path);
    toast(res.detail);
  } catch (err) { toast(err.message, true); }
  finally { btn.disabled = false; }
});

// ---------- Start ----------

(async function start() {
  if (STATIC) {
    $("#syncBtn .label-long").textContent = "Refresh";
    $("#syncBtn").title = "Check for new reports";
    $("#syncBtn").setAttribute("aria-label", "Refresh reports");
    $("#teachHint").innerHTML = "Rules live in <code>memory.md</code> on GitHub. Type your feedback, tap <strong>Add on GitHub</strong>, and paste the copied rule there. Tomorrow's 8 AM run will follow it.";
    $("#saveBtn").textContent = "Add on GitHub";
    loadSite().then((d) => {
      const a = $("#editRules");
      a.href = `${d.repoUrl}/edit/main/memory.md`;
      a.hidden = false;
    }).catch(() => {});
  }
  loadStatus();
  try { renderRules(await getRules()); } catch (e) { toast(e.message, true); }
  try { await loadRuns(); } catch (e) { $("#report").innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
})();
