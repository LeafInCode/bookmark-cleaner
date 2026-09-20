import { STATUS } from "./linkcheck.js";
import { normalizeUrl } from "./url.js";

export function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export function exportBackup(tree, stampStr) {
  download(`bookmarks-backup-${stampStr}.json`, JSON.stringify(tree, null, 2), "application/json");
}

export function exportTree(tree, filename) {
  download(filename, JSON.stringify(tree, null, 2), "application/json");
}

export function exportReportCsv(bookmarks, scanResults, stampStr) {
  const lines = ["title,url,status,http_code,final_url,path"];
  const map = new Map(bookmarks.filter((b) => b.url).map((b) => [b.id, b]));
  for (const [id, r] of Object.entries(scanResults || {})) {
    const b = map.get(id);
    if (!b) continue;
    const cells = [
      b.title || "",
      b.url || "",
      r.status || "",
      r.code || "",
      r.finalUrl || r.movedTo || "",
      b.path || ""
    ].map(csvCell);
    lines.push(cells.join(","));
  }
  download(`bookmark-scan-${stampStr}.csv`, "\ufeff" + lines.join("\n"), "text/csv;charset=utf-8");
}

function csvCell(v) {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

export function exportSharePage(items, title, stampStr) {
  const palette = ["#2563eb", "#7c3aed", "#0891b2", "#059669", "#d97706", "#dc2626", "#4f46e5", "#0d9488", "#b45309", "#be185d"];
  const colorFor = (s) => {
    let h = 0;
    for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 997;
    return palette[h % palette.length];
  };
  const groups = new Map();
  for (const b of items) {
    let host = "other";
    try {
      host = new URL(b.url).hostname.replace(/^www\./, "");
    } catch {
      /* keep other */
    }
    if (!groups.has(host)) groups.set(host, []);
    groups.get(host).push(b);
  }
  const groupHtml = [...groups.entries()].map(([host, list]) => {
    const color = colorFor(host);
    const cards = list.map((b) => `
        <a class="card" href="${escapeHtml(b.url)}" target="_blank" rel="noopener">
          <span class="avatar" style="background:${color}">${escapeHtml((host[0] || "?").toUpperCase())}</span>
          <span class="text">
            <span class="title">${escapeHtml(b.title || b.url)}</span>
            <span class="url">${escapeHtml(shortUrl(b.url))}</span>
          </span>
          <span class="arrow">↗</span>
        </a>`).join("");
    return `
      <section class="group">
        <div class="group-head">
          <span class="dot" style="background:${color}"></span>
          <span class="host">${escapeHtml(host)}</span>
          <span class="count">${list.length}</span>
        </div>
        ${cards}
      </section>`;
  }).join("");
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root {
    --bg1: #eef6ff; --bg2: #f8fafc; --card: #ffffff; --border: #e2e8f0;
    --text: #0f172a; --muted: #64748b; --primary: #2563eb;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    color: var(--text); line-height: 1.55;
    background:
      radial-gradient(900px 320px at 15% -8%, rgba(37, 99, 235, .12), transparent 60%),
      radial-gradient(700px 260px at 85% -6%, rgba(124, 58, 237, .09), transparent 55%),
      linear-gradient(180deg, var(--bg1) 0%, var(--bg2) 320px);
    background-attachment: fixed;
  }
  .hero { max-width: 780px; margin: 0 auto; padding: 56px 20px 26px; text-align: center; }
  .badge {
    display: inline-block; font-size: 12px; font-weight: 600; letter-spacing: .04em;
    color: var(--primary); background: rgba(37, 99, 235, .1);
    border: 1px solid rgba(37, 99, 235, .2); border-radius: 999px; padding: 3px 12px; margin-bottom: 14px;
  }
  .hero h1 { font-size: 30px; margin: 0 0 10px; letter-spacing: -0.5px; }
  .hero .meta { color: var(--muted); font-size: 13px; }
  .list { max-width: 780px; margin: 0 auto; padding: 8px 20px 70px; }
  .group { margin-bottom: 26px; }
  .group-head { display: flex; align-items: center; gap: 8px; margin: 0 4px 10px; font-size: 13px; color: var(--muted); }
  .group-head .dot { width: 8px; height: 8px; border-radius: 50%; }
  .group-head .host { font-weight: 600; color: var(--text); }
  .group-head .count { background: #f1f5f9; border-radius: 999px; padding: 1px 9px; font-size: 12px; }
  .card {
    display: flex; align-items: center; gap: 12px;
    background: var(--card); border: 1px solid var(--border); border-radius: 12px;
    padding: 12px 14px; margin-bottom: 8px; text-decoration: none; color: inherit;
    box-shadow: 0 1px 2px rgba(17, 24, 39, .04);
    transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease;
  }
  .card:hover {
    transform: translateY(-1px);
    border-color: #bfdbfe;
    box-shadow: 0 10px 24px -14px rgba(29, 78, 216, .5);
  }
  .avatar {
    width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-weight: 700; font-size: 14px;
  }
  .text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .title { font-weight: 600; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .url { color: var(--muted); font-size: 12px; word-break: break-all; }
  .arrow { color: #94a3b8; font-size: 14px; }
  .card:hover .arrow { color: var(--primary); }
  footer { max-width: 780px; margin: 0 auto; padding: 0 20px 50px; color: #94a3b8; font-size: 12px; text-align: center; }
  @media (prefers-color-scheme: dark) {
    :root { --bg1: #0b1220; --bg2: #0f172a; --card: #111c31; --border: #1e293b; --text: #e2e8f0; --muted: #94a3b8; }
    .group-head .count { background: #1e293b; }
    .card:hover { border-color: #1d4ed8; }
  }
  @media print {
    body { background: #fff; }
    .card { box-shadow: none; break-inside: avoid; }
  }
</style>
</head>
<body>
  <header class="hero">
    <div class="badge">书签清理助手 · 精选书签</div>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">${items.length} 个书签 · ${groups.size} 个网站 · 导出于 ${escapeHtml(stampStr)}</div>
  </header>
  <main class="list">
    ${groupHtml}
  </main>
  <footer>本页面为离线导出文件，不含追踪代码 · 由「书签清理助手」生成</footer>
</body>
</html>`;
  download(`bookmarks-share-${stampStr}.html`, html, "text/html;charset=utf-8");
}

function shortUrl(u) {
  try {
    const url = new URL(u);
    return url.hostname.replace(/^www\./, "") + (url.pathname === "/" ? "" : url.pathname);
  } catch {
    return u || "";
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function scanSummary(scanResults) {
  const counts = { dead: 0, moved: 0, blocked: 0, server_error: 0, ok: 0, timeout: 0 };
  for (const r of Object.values(scanResults || {})) {
    if (counts[r.status] !== undefined) counts[r.status] += 1;
  }
  return counts;
}
