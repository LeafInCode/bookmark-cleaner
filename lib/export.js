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
  const rows = items
    .map((b) => {
      const url = escapeHtml(b.url || "");
      const label = escapeHtml(b.title || b.url || "");
      return `<li><a href="${url}" target="_blank" rel="noopener">${label}</a><span>${escapeHtml(shortUrl(b.url))}</span></li>`;
    })
    .join("\n");
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; max-width: 760px; margin: 40px auto; padding: 0 16px; line-height: 1.6; }
  h1 { font-size: 22px; }
  .meta { color: #888; font-size: 13px; margin-bottom: 24px; }
  ul { list-style: none; padding: 0; }
  li { padding: 12px 14px; border: 1px solid #e5e7eb; border-radius: 10px; margin-bottom: 8px; }
  li a { font-weight: 600; text-decoration: none; }
  li span { display: block; color: #888; font-size: 12px; margin-top: 2px; word-break: break-all; }
  footer { color: #aaa; font-size: 12px; margin-top: 28px; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<div class="meta">${items.length} 个书签 · 导出于 ${escapeHtml(stampStr)} · by 书签清理助手</div>
<ul>
${rows}
</ul>
<footer>本页面为离线导出文件，不包含任何追踪代码。</footer>
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
