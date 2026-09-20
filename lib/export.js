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

const SHARE_THEMES = {
  gradient: {
    bg1: "#eef6ff", bg2: "#f8fafc", card: "#ffffff", border: "#e2e8f0",
    text: "#0f172a", muted: "#64748b", accent: "#2563eb", glow: true
  },
  minimal: {
    bg1: "#ffffff", bg2: "#ffffff", card: "#ffffff", border: "#e5e5e5",
    text: "#111111", muted: "#777777", accent: "#111111", glow: false
  },
  paper: {
    bg1: "#faf6ef", bg2: "#f4eee2", card: "#fffdf8", border: "#e7ddc9",
    text: "#3d3325", muted: "#8a7c66", accent: "#b45309", glow: false, serif: true
  },
  dark: {
    bg1: "#0b1220", bg2: "#0f172a", card: "#111c31", border: "#1e293b",
    text: "#e2e8f0", muted: "#94a3b8", accent: "#60a5fa", glow: false
  }
};

export function exportSharePage(items, title, stampStr, themeName) {
  const t = SHARE_THEMES[themeName] || SHARE_THEMES.gradient;
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
  const fontStack = t.serif
    ? `Georgia, "Songti SC", "SimSun", serif`
    : `system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`;
  const heroBg = t.glow
    ? `radial-gradient(900px 320px at 15% -8%, rgba(37, 99, 235, .12), transparent 60%),
       radial-gradient(700px 260px at 85% -6%, rgba(124, 58, 237, .09), transparent 55%),
       linear-gradient(180deg, ${t.bg1} 0%, ${t.bg2} 320px)`
    : `linear-gradient(180deg, ${t.bg1} 0%, ${t.bg2} 320px)`;
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root {
    --bg1: ${t.bg1}; --bg2: ${t.bg2}; --card: ${t.card}; --border: ${t.border};
    --text: ${t.text}; --muted: ${t.muted}; --primary: ${t.accent};
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: ${fontStack};
    color: var(--text); line-height: 1.55;
    background: ${heroBg};
    background-attachment: fixed;
  }
  .hero { max-width: 780px; margin: 0 auto; padding: 56px 20px 26px; text-align: center; }
  .badge {
    display: inline-block; font-size: 12px; font-weight: 600; letter-spacing: .04em;
    color: var(--primary); background: color-mix(in srgb, var(--primary) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--primary) 22%, transparent);
    border-radius: 999px; padding: 3px 12px; margin-bottom: 14px;
  }
  .hero h1 { font-size: 30px; margin: 0 0 10px; letter-spacing: -0.5px; }
  .hero .meta { color: var(--muted); font-size: 13px; }
  .list { max-width: 780px; margin: 0 auto; padding: 8px 20px 70px; }
  .group { margin-bottom: 26px; }
  .group-head { display: flex; align-items: center; gap: 8px; margin: 0 4px 10px; font-size: 13px; color: var(--muted); }
  .group-head .dot { width: 8px; height: 8px; border-radius: 50%; }
  .group-head .host { font-weight: 600; color: var(--text); }
  .group-head .count { background: color-mix(in srgb, var(--muted) 12%, transparent); border-radius: 999px; padding: 1px 9px; font-size: 12px; }
  .card {
    display: flex; align-items: center; gap: 12px;
    background: var(--card); border: 1px solid var(--border); border-radius: 12px;
    padding: 12px 14px; margin-bottom: 8px; text-decoration: none; color: inherit;
    box-shadow: 0 1px 2px rgba(17, 24, 39, .04);
    transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease;
  }
  .card:hover { transform: translateY(-1px); border-color: var(--primary); box-shadow: 0 10px 24px -14px color-mix(in srgb, var(--primary) 55%, transparent); }
  .avatar {
    width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-weight: 700; font-size: 14px;
  }
  .text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .title { font-weight: 600; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .url { color: var(--muted); font-size: 12px; word-break: break-all; }
  .arrow { color: var(--muted); font-size: 14px; }
  .card:hover .arrow { color: var(--primary); }
  footer { max-width: 780px; margin: 0 auto; padding: 0 20px 50px; color: var(--muted); font-size: 12px; text-align: center; }
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

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function exportShareImage(items, title, stampStr) {
  const palette = ["#2563eb", "#7c3aed", "#0891b2", "#059669", "#d97706", "#dc2626", "#4f46e5", "#0d9488", "#b45309", "#be185d"];
  const colorFor = (s) => {
    let h = 0;
    for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 997;
    return palette[h % palette.length];
  };
  const maxItems = 30;
  const list = items.slice(0, maxItems);
  const W = 900;
  const PAD = 56;
  const HEADER = 250;
  const ROW = 74;
  const FOOTER = 90;
  const H = HEADER + list.length * ROW + FOOTER;
  const dpr = 2;
  const canvas = document.createElement("canvas");
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const font = `system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#eef6ff");
  bg.addColorStop(0.5, "#f8fafc");
  bg.addColorStop(1, "#f1f5fb");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.fillStyle = "#2563eb";
  ctx.font = `600 15px ${font}`;
  ctx.fillText("书签清理助手 · 精选书签", W / 2, 70);
  ctx.fillStyle = "#0f172a";
  ctx.font = `700 38px ${font}`;
  ctx.fillText(title, W / 2, 130, W - PAD * 2);
  ctx.fillStyle = "#64748b";
  ctx.font = `400 15px ${font}`;
  ctx.fillText(`${items.length} 个书签 · ${stampStr}`, W / 2, 170);

  let y = HEADER;
  for (const b of list) {
    const host = (() => {
      try {
        return new URL(b.url).hostname.replace(/^www\./, "");
      } catch {
        return "other";
      }
    })();
    const color = colorFor(host);
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(17,24,39,0.06)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
    roundRect(ctx, PAD, y - 52, W - PAD * 2, 62, 12);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    ctx.fillStyle = color;
    roundRect(ctx, PAD + 14, y - 40, 34, 34, 9);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 16px ${font}`;
    ctx.textAlign = "center";
    ctx.fillText((host[0] || "?").toUpperCase(), PAD + 31, y - 17);

    ctx.textAlign = "left";
    ctx.fillStyle = "#0f172a";
    ctx.font = `600 16px ${font}`;
    let t = b.title || b.url || "";
    while (ctx.measureText(t).width > W - PAD * 2 - 130 && t.length > 4) {
      t = t.slice(0, -2);
    }
    if (t !== (b.title || b.url)) t += "…";
    ctx.fillText(t, PAD + 62, y - 24);
    ctx.fillStyle = "#94a3b8";
    ctx.font = `400 12px ${font}`;
    let u = shortUrl(b.url);
    while (ctx.measureText(u).width > W - PAD * 2 - 130 && u.length > 6) {
      u = u.slice(0, -2);
    }
    ctx.fillText(u, PAD + 62, y - 4);
    y += ROW;
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "#94a3b8";
  ctx.font = `400 13px ${font}`;
  const note = items.length > maxItems ? `仅展示前 ${maxItems} 个 · 完整列表请用 HTML 导出` : "由「书签清理助手」生成 · 不含追踪代码";
  ctx.fillText(note, W / 2, H - 40);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bookmarks-poster-${stampStr}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }, "image/png");
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
