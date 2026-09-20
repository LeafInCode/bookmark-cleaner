import * as i18n from "./lib/i18n.js";
import * as storage from "./lib/storage.js";
import * as bm from "./lib/bookmarks.js";
import { buildPortrait } from "./lib/stats.js";
import { exportBackup, exportReportCsv, exportSharePage, stamp } from "./lib/export.js";
import { STATUS } from "./lib/linkcheck.js";

const state = {
  items: [],
  tree: null,
  scan: null,
  duplicates: [],
  emptyFolders: [],
  activeTab: "dead",
  selection: { dead: new Set(), duplicates: new Set(), empty: new Set(), moved: new Set(), blocked: new Set() },
  wayback: {},
  updated: new Set()
};

const $ = (sel) => document.querySelector(sel);

function resultOf(id) {
  return state.scan && state.scan.results ? state.scan.results[id] : null;
}

const UNVERIFIABLE = [STATUS.BLOCKED, STATUS.UNKNOWN, STATUS.SERVER_ERROR, STATUS.TIMEOUT];

function deadIds() {
  return state.items
    .filter((b) => {
      const r = resultOf(b.id);
      return r && r.status === STATUS.DEAD;
    })
    .map((b) => b.id);
}

function movedItems() {
  return state.items.filter((b) => {
    const r = resultOf(b.id);
    return r && r.status === STATUS.MOVED;
  });
}

function blockedItems() {
  return state.items.filter((b) => {
    const r = resultOf(b.id);
    return r && UNVERIFIABLE.includes(r.status);
  });
}

function dupItemIds() {
  return state.duplicates.flatMap((g) => g.items.map((x) => x.id));
}

function currentTabIds() {
  switch (state.activeTab) {
    case "dead": return deadIds();
    case "duplicates": return dupItemIds();
    case "empty": return state.emptyFolders.map((f) => f.id);
    case "moved": return movedItems().map((x) => x.id);
    case "blocked": return blockedItems().map((x) => x.id);
    default: return [];
  }
}

function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = i18n.t(el.getAttribute("data-i18n"));
  });
  document.documentElement.lang = i18n.getLang() === "zh" ? "zh-CN" : "en";
}

async function refreshData() {
  state.tree = await bm.getTree();
  state.items = bm.flattenTree(state.tree);
  state.scan = await storage.getScanState();
  const bookmarks = state.items.filter((x) => x.type === "bookmark");
  state.duplicates = bm.findDuplicates(bookmarks);
  state.emptyFolders = bm.findEmptyFolders(state.items);
}

function renderScanStatus() {
  const s = state.scan;
  const bar = $("#progress-bar");
  const label = $("#scan-status");
  const btn = $("#btn-scan");
  if (!s) {
    bar.style.width = "0";
    label.textContent = i18n.t("idle");
    btn.textContent = i18n.t("scan");
    $("#summary").textContent = "";
    return;
  }
  if (s.status === "scanning") {
    const pct = s.total ? Math.round((s.processed / s.total) * 100) : 0;
    bar.style.width = `${pct}%`;
    label.textContent = `${i18n.t("scanning")} ${s.processed}/${s.total}`;
    btn.textContent = i18n.t("stop");
    btn.disabled = false;
  } else {
    bar.style.width = "100%";
    const when = s.finishedAt ? new Date(s.finishedAt).toLocaleString() : "";
    label.textContent = `${i18n.t(s.status === "done" ? "done" : s.status)} ${when}`;
    btn.textContent = i18n.t("rescan");
    btn.disabled = false;
    if (s.status === "done") {
      const r = s.results || {};
      const dead = Object.values(r).filter((x) => x.status === STATUS.DEAD).length;
      const moved = Object.values(r).filter((x) => x.status === STATUS.MOVED).length;
      const blocked = Object.values(r).filter((x) => UNVERIFIABLE.includes(x.status)).length;
      $("#summary").textContent = i18n.t("scanSummary", {
        total: s.total || 0,
        dead,
        dup: dupItemIds().length,
        empty: state.emptyFolders.length,
        moved,
        blocked
      });
    }
  }
}

function renderTabs() {
  const tabs = [
    ["dead", "tabDead", deadIds().length],
    ["duplicates", "tabDuplicates", dupItemIds().length],
    ["empty", "tabEmpty", state.emptyFolders.length],
    ["moved", "tabMoved", movedItems().length],
    ["blocked", "tabBlocked", blockedItems().length],
    ["portrait", "portrait", null]
  ];
  $("#tabs").innerHTML = tabs
    .map(([key, labelKey, count]) => {
      const active = state.activeTab === key ? " active" : "";
      const c = count === null ? "" : `<span class="count">${count}</span>`;
      return `<button class="tab${active}" data-tab="${key}">${i18n.t(labelKey)}${c}</button>`;
    })
    .join("");
}

function tagFor(status) {
  const map = {
    [STATUS.DEAD]: ["dead", "statusDead"],
    [STATUS.TIMEOUT]: ["dead", "statusTimeout"],
    [STATUS.SERVER_ERROR]: ["blocked", "statusServerError"],
    [STATUS.MOVED]: ["moved", "statusMoved"],
    [STATUS.BLOCKED]: ["blocked", "statusBlocked"],
    [STATUS.OK]: ["ok", "statusOk"],
    [STATUS.UNKNOWN]: ["blocked", "statusUnknown"]
  };
  const [cls, labelKey] = map[status] || ["", "statusUnknown"];
  return `<span class="tag ${cls}">${i18n.t(labelKey)}</span>`;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderToolbar(extraButtons) {
  const ids = currentTabIds();
  const sel = state.selection[state.activeTab];
  const allSelected = ids.length > 0 && ids.every((id) => sel.has(id));
  const buttons = extraButtons || "";
  const moveBtn = state.activeTab === "empty"
    ? ""
    : `<button class="btn small" data-action="move-selected" ${sel.size ? "" : "disabled"}>${i18n.t("move")}</button>`;
  return `
    <div class="toolbar">
      <label class="small"><input type="checkbox" id="select-all" ${allSelected ? "checked" : ""}> ${i18n.t("selectAll")}</label>
      <span class="muted small" id="sel-count">${sel.size} ${i18n.t("selected")}</span>
      <span class="spacer"></span>
      ${buttons}
      ${moveBtn}
      <button class="btn small danger" data-action="delete-selected" ${sel.size ? "" : "disabled"}>${i18n.t("delete")}</button>
      <button class="btn small" data-action="open-selected" ${sel.size ? "" : "disabled"}>${i18n.t("open")}</button>
    </div>`;
}

function noteLabel(note) {
  const map = {
    login_required: "noteLogin",
    forbidden: "noteForbidden",
    rate_limited: "noteRateLimited",
    server_error: "noteServerError",
    timeout: "noteTimeout",
    network: "noteNetwork",
    not_found: "noteNotFound",
    auth: "noteAuth",
    method: "noteMethod",
    legal: "noteLegal",
    redirect: "noteRedirect",
    unknown: "noteUnknown"
  };
  return note && map[note] ? i18n.t(map[note]) : "";
}

function stripeClass(b, r) {
  if (state.updated.has(b.id)) return " stripe-ok";
  if (!r || !r.status) return "";
  if (r.status === STATUS.DEAD) return " stripe-dead";
  if (UNVERIFIABLE.includes(r.status)) return " stripe-blocked";
  if (r.status === STATUS.MOVED) return " stripe-moved";
  if (r.status === STATUS.OK) return " stripe-ok";
  return "";
}

function renderItemRow(b, opts) {
  const r = resultOf(b.id) || {};
  const sel = state.selection[state.activeTab];
  const checked = sel.has(b.id) ? "checked" : "";
  const tag = state.updated.has(b.id)
    ? `<span class="tag ok">${i18n.t("tagUpdated")}</span>`
    : (r.status ? tagFor(r.status) : "");
  const note = noteLabel(r.note);
  const noteHtml = note ? `<span class="muted small">${note}</span>` : "";
  const actions = opts && opts.actions ? opts.actions(b, r) : "";
  const path = b.path ? `<span class="muted small">${escapeHtml(b.path)}</span>` : "";
  return `
    <div class="item${stripeClass(b, r)}" data-id="${b.id}">
      <input type="checkbox" data-check="${b.id}" ${checked}>
      <div class="item-main">
        <div class="item-title" title="${escapeHtml(b.title)}">${escapeHtml(b.title || b.url)}</div>
        <div class="item-url">${escapeHtml(b.url || "")}</div>
        <div class="item-meta">${tag}${noteHtml}${path}${opts && opts.extra ? opts.extra(b, r) : ""}</div>
      </div>
      <div class="item-actions">${actions}</div>
    </div>`;
}

function hint(textKey) {
  return `<div class="hint">${i18n.t(textKey)}</div>`;
}

function renderDeadPanel() {
  const items = state.items.filter((b) => {
    const r = resultOf(b.id);
    return r && r.status === STATUS.DEAD;
  });
  if (!items.length) return hint("hintDead") + emptyState();
  const buttons = `<button class="btn small" data-action="archive-dead">${i18n.t("archive")}</button>`;
  return renderToolbar(buttons) + hint("hintDead") + `<div class="list">${items.map((b) => {
    const r = resultOf(b.id) || {};
    const wb = state.wayback[b.id];
    let extra = "";
    if (wb === undefined) {
      extra = `<button class="btn small ghost" data-action="wayback" data-id="${b.id}">${i18n.t("wayback")}</button>`;
    } else if (wb === null) {
      extra = `<span class="muted small">${i18n.t("waybackNone")}</span>`;
    } else {
      const date = (wb.timestamp || "").slice(0, 8);
      extra = `<span class="tag ok">${i18n.t("waybackFound")} ${date}</span>
        <button class="btn small" data-action="use-wayback" data-id="${b.id}">${i18n.t("replaceWithArchive")}</button>
        <a class="btn small ghost" href="${escapeHtml(wb.url)}" target="_blank" rel="noopener">↗</a>`;
    }
    return renderItemRow(b, {
      extra: () => extra,
      actions: (bb) => `<button class="btn small ghost" data-action="open-one" data-url="${escapeHtml(bb.url)}">↗</button>`
    });
  }).join("")}</div>`;
}

function renderMovedPanel() {
  const items = movedItems();
  if (!items.length) return hint("hintMoved") + emptyState();
  return renderToolbar("") + hint("hintMoved") + `<div class="list">${items.map((b) => {
    const r = resultOf(b.id) || {};
    const done = state.updated.has(b.id);
    return renderItemRow(b, {
      extra: () => `<span class="muted small">${i18n.t("movedTo")}: ${escapeHtml(r.movedTo || "")}</span>`,
      actions: (bb) => done
        ? `<button class="btn small ghost" data-action="open-one" data-url="${escapeHtml(r.movedTo || bb.url)}">↗</button>`
        : `<button class="btn small" data-action="update-url" data-id="${bb.id}" data-url="${escapeHtml(r.movedTo || "")}">${i18n.t("updateUrl")}</button>
           <button class="btn small ghost" data-action="open-one" data-url="${escapeHtml(r.movedTo || bb.url)}">↗</button>`
    });
  }).join("")}</div>`;
}

function renderBlockedPanel() {
  const items = blockedItems();
  if (!items.length) return hint("hintBlocked") + emptyState();
  return renderToolbar("") + hint("hintBlocked") + `<div class="list">${items.map((b) =>
    renderItemRow(b, {
      actions: (bb) => `<button class="btn small ghost" data-action="open-one" data-url="${escapeHtml(bb.url)}">↗</button>`
    })
  ).join("")}</div>`;
}

function renderDuplicatesPanel() {
  if (!state.duplicates.length) return emptyState();
  const groups = state.duplicates.map((g) => {
    const rows = g.items.map((b, idx) => {
      const sel = state.selection.duplicates;
      const checked = sel.has(b.id) ? "checked" : "";
      return `
        <div class="dup-item">
          <input type="checkbox" data-check="${b.id}" ${checked}>
          <span class="item-title">${escapeHtml(b.title || b.url)}</span>
          <span class="muted small">${idx === 0 ? "①" : ""}</span>
          <button class="btn small ghost" data-action="open-one" data-url="${escapeHtml(b.url)}">↗</button>
        </div>`;
    }).join("");
    return `
      <div class="dup-group">
        <div class="dup-head">${g.items.length} × <span class="item-url">${escapeHtml(g.key)}</span>
          <span class="spacer"></span>
          <button class="btn small" data-action="keep-first" data-ids="${g.items.map((x) => x.id).join(",")}">保留 ① 删其余</button>
        </div>
        <div class="dup-items">${rows}</div>
      </div>`;
  }).join("");
  return renderToolbar("") + `<div class="list">${groups}</div>`;
}

function renderEmptyPanel() {
  if (!state.emptyFolders.length) return emptyState();
  const sel = state.selection.empty;
  const rows = state.emptyFolders.map((f) => `
    <div class="item" data-id="${f.id}">
      <input type="checkbox" data-check="${f.id}" ${sel.has(f.id) ? "checked" : ""}>
      <div class="item-main">
        <div class="item-title">📁 ${escapeHtml(f.title || "(untitled)")}</div>
        <div class="item-url">${escapeHtml(f.path || "")}</div>
      </div>
    </div>`).join("");
  return renderToolbar("") + `<div class="list">${rows}</div>`;
}

function renderPortraitPanel() {
  const p = buildPortrait(state.items, state.scan ? state.scan.results : null, state.duplicates);
  const maxDomain = p.topDomains.length ? p.topDomains[0].count : 1;
  const fmtDate = (b) => (b && b.dateAdded ? new Date(b.dateAdded).toLocaleDateString() : "—");
  const domains = p.topDomains.map((d) => `
    <div class="bar-row">
      <span class="name" title="${escapeHtml(d.domain)}">${escapeHtml(d.domain)}</span>
      <span class="bar"><div style="width:${Math.round((d.count / maxDomain) * 100)}%"></div></span>
      <span class="val">${d.count}</span>
    </div>`).join("");
  const chart = svgAreaChart(p.monthly);
  const years = p.yearCounts.map(([y, c]) => `<span class="year-chip">${y}<b>${c}</b></span>`).join("");
  return `
    <div class="portrait-grid">
      <div class="stat-card grad-blue"><div class="num">${p.totalBookmarks}</div><div class="label">${i18n.t("totalBookmarks")}</div></div>
      <div class="stat-card grad-purple"><div class="num">${p.totalFolders}</div><div class="label">${i18n.t("folders")}</div></div>
      <div class="stat-card grad-red"><div class="num">${p.deadCount}<span class="unit">(${(p.deadRatio * 100).toFixed(1)}%)</span></div><div class="label">${i18n.t("deadLinks")}</div></div>
      <div class="stat-card grad-amber"><div class="num">${p.duplicateCount}</div><div class="label">${i18n.t("duplicates")}</div></div>
      <div class="stat-card grad-green"><div class="num">${p.spanDays}<span class="unit">${i18n.t("portraitDays")}</span></div><div class="label">${i18n.t("portraitSpan")}</div></div>
      <div class="stat-card grad-cyan"><div class="num">${p.avgPerMonth}</div><div class="label">${i18n.t("portraitAvgMonth")}</div></div>
    </div>
    <div class="card">
      <h3>${i18n.t("portraitMonthly")}</h3>
      ${chart || `<div class="muted small">${i18n.t("noItems")}</div>`}
      <div class="year-row">${years}</div>
      ${p.mostActive ? `<div class="muted small">${i18n.t("portraitMostActive")}: ${p.mostActive[0]} (${p.mostActive[1]}) · ${i18n.t("portraitOldest")}: ${fmtDate(p.oldest)} · ${i18n.t("portraitNewest")}: ${fmtDate(p.newest)}</div>` : ""}
    </div>
    <div class="card"><h3>${i18n.t("portraitTopDomains")}</h3>${domains || `<div class="muted small">${i18n.t("noItems")}</div>`}</div>`;
}

function svgAreaChart(points) {
  if (!points || points.length < 2) return "";
  const w = 660;
  const h = 180;
  const padL = 36;
  const padR = 14;
  const padT = 16;
  const padB = 30;
  const max = Math.max(...points.map((x) => x[1]), 1);
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const step = innerW / (points.length - 1);
  const coords = points.map(([, v], i) => [padL + i * step, padT + innerH - (v / max) * innerH]);
  const line = coords.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${coords[coords.length - 1][0].toFixed(1)},${(padT + innerH).toFixed(1)} L${coords[0][0].toFixed(1)},${(padT + innerH).toFixed(1)} Z`;
  const grid = [0, 0.5, 1].map((t) => {
    const y = padT + innerH - t * innerH;
    return `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" class="chart-grid"/>
      <text x="${padL - 6}" y="${y + 4}" class="chart-axis" text-anchor="end">${Math.round(max * t)}</text>`;
  }).join("");
  const every = Math.max(1, Math.ceil(points.length / 8));
  const labels = points.map(([label], i) => {
    if (i % every !== 0 && i !== points.length - 1) return "";
    const x = padL + i * step;
    return `<text x="${x.toFixed(1)}" y="${h - 8}" class="chart-axis" text-anchor="middle">${escapeHtml(label.slice(2))}</text>`;
  }).join("");
  const dots = coords.map(([x, y], i) =>
    `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" class="chart-dot"><title>${escapeHtml(points[i][0])}: ${points[i][1]}</title></circle>`
  ).join("");
  return `<svg viewBox="0 0 ${w} ${h}" class="chart" preserveAspectRatio="xMidYMid meet" role="img">
    <defs>
      <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2563eb" stop-opacity="0.38"/>
        <stop offset="100%" stop-color="#2563eb" stop-opacity="0.02"/>
      </linearGradient>
    </defs>
    ${grid}
    <path d="${area}" fill="url(#areaFill)"/>
    <path d="${line}" fill="none" class="chart-line"/>
    ${dots}
    ${labels}
  </svg>`;
}

function emptyState() {
  return `<div class="empty-state">${i18n.t("allGood")}</div>`;
}

function renderPanel() {
  const panel = $("#panel");
  switch (state.activeTab) {
    case "dead": panel.innerHTML = renderDeadPanel(); break;
    case "duplicates": panel.innerHTML = renderDuplicatesPanel(); break;
    case "empty": panel.innerHTML = renderEmptyPanel(); break;
    case "moved": panel.innerHTML = renderMovedPanel(); break;
    case "blocked": panel.innerHTML = renderBlockedPanel(); break;
    case "portrait": panel.innerHTML = renderPortraitPanel(); break;
    default: panel.innerHTML = "";
  }
}

function renderAll() {
  renderTabs();
  renderScanStatus();
  renderPanel();
}

function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  $("#toast-root").appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function openModal(html, onMount) {
  const root = $("#modal-root");
  root.innerHTML = `<div class="modal-mask"><div class="modal">${html}</div></div>`;
  const close = () => { root.innerHTML = ""; };
  root.querySelector(".modal-mask").addEventListener("click", (e) => {
    if (e.target === root.querySelector(".modal-mask")) close();
  });
  if (onMount) onMount(root, close);
  return close;
}

async function deleteSelected() {
  const tab = state.activeTab;
  const ids = [...state.selection[tab]];
  if (!ids.length) return;
  const ok = await confirmModal(i18n.t("confirmDelete"));
  if (!ok) return;
  const { trashEntries, errors } = await bm.removeWithSnapshot(ids);
  if (trashEntries.length) await storage.addToTrash(trashEntries);
  state.selection[tab].clear();
  await refreshData();
  renderAll();
  if (errors.length && !trashEntries.length) {
    const rootErr = errors.some((e) => e.message === "root-folder");
    toast(rootErr ? i18n.t("rootFolderErr") : `${errors.length} ✗`);
  } else {
    toast(i18n.t("deleteDone", { n: trashEntries.length }) + (errors.length ? ` (${errors.length} ✗)` : ""));
  }
}

function confirmModal(message) {
  return new Promise((resolve) => {
    openModal(
      `<h3>${i18n.t("confirm")}</h3><p>${escapeHtml(message)}</p>
       <div class="modal-actions">
         <button class="btn" data-modal="cancel">${i18n.t("cancel")}</button>
         <button class="btn primary" data-modal="ok">${i18n.t("confirm")}</button>
       </div>`,
      (root, close) => {
        root.querySelector('[data-modal="cancel"]').addEventListener("click", () => { close(); resolve(false); });
        root.querySelector('[data-modal="ok"]').addEventListener("click", () => { close(); resolve(true); });
      }
    );
  });
}

async function openSelected() {
  const tab = state.activeTab;
  const ids = [...state.selection[tab]];
  const items = state.items.filter((b) => ids.includes(b.id) && b.url);
  if (!items.length) return;
  const settings = await storage.getSettings();
  const ok = await confirmModal(`${i18n.t("confirmOpen")} ${i18n.t("confirmOpenLimit", { n: settings.openLimit })}`);
  if (!ok) return;
  const n = await bm.openUrls(items.map((x) => x.url), settings.openLimit);
  toast(`${i18n.t("open")}: ${n}`);
}

async function archiveDead() {
  const ids = deadIds();
  if (!ids.length) return;
  const settings = await storage.getSettings();
  const name = settings.autoArchiveName || i18n.t("defaultArchiveFolder");
  const ok = await confirmModal(`${i18n.t("archive")}: ${ids.length} → "${name}"`);
  if (!ok) return;
  const folder = await bm.createFolder("1", name);
  const moved = await bm.moveBookmarks(ids, folder.id);
  await refreshData();
  renderAll();
  toast(i18n.t("moveDone", { n: moved }));
}

async function moveSelected() {
  const tab = state.activeTab;
  const ids = [...state.selection[tab]];
  if (!ids.length) return;
  const folders = state.items.filter((x) => x.type === "folder" && x.id !== "0");
  const options = folders
    .map((f) => {
      const depth = (f.path || "").split(" / ").length;
      return `<option value="${f.id}">${"— ".repeat(Math.max(0, depth - 1))}${escapeHtml(f.title || "(untitled)")}</option>`;
    })
    .join("");
  openModal(
    `<h3>${i18n.t("pickFolder")}</h3>
     <select id="move-target" class="select" style="width:100%">${options}</select>
     <div class="modal-actions">
       <button class="btn" data-modal="cancel">${i18n.t("cancel")}</button>
       <button class="btn primary" data-modal="ok">${i18n.t("confirm")}</button>
     </div>`,
    (root, close) => {
      root.querySelector('[data-modal="cancel"]').addEventListener("click", close);
      root.querySelector('[data-modal="ok"]').addEventListener("click", async () => {
        const parentId = root.querySelector("#move-target").value;
        const moved = await bm.moveBookmarks(ids, parentId);
        state.selection[tab].clear();
        await refreshData();
        renderAll();
        close();
        toast(i18n.t("moveDone", { n: moved }));
      });
    }
  );
}

async function showTrash() {
  const trash = await storage.getTrash();
  const rows = trash.length
    ? trash.map((t, i) => `
        <div class="trash-item">
          <div class="item-main">
            <div class="item-title">${t.isFolder ? "📁 " : ""}${escapeHtml(t.title || t.url || "")}</div>
            <div class="item-url">${escapeHtml(t.url || "")}</div>
          </div>
          <button class="btn small" data-restore="${i}">${i18n.t("restore")}</button>
        </div>`).join("")
    : `<div class="muted small">${i18n.t("emptyTrash")}</div>`;
  openModal(
    `<h3>${i18n.t("trash")}</h3><p class="muted small">${i18n.t("trashHint")}</p>${rows}
     <div class="modal-actions">
       <button class="btn danger" data-modal="clear">${i18n.t("clearTrash")}</button>
       <button class="btn" data-modal="close">${i18n.t("close")}</button>
     </div>`,
    (root, close) => {
      root.querySelector('[data-modal="close"]').addEventListener("click", close);
      root.querySelector('[data-modal="clear"]').addEventListener("click", async () => {
        await storage.clearTrash();
        close();
      });
      root.querySelectorAll("[data-restore]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const idx = Number(btn.getAttribute("data-restore"));
          const entry = (await storage.getTrash())[idx];
          if (!entry) return;
          const n = await bm.restoreEntries([entry]);
          const remaining = (await storage.getTrash()).filter((_, i) => i !== idx);
          await storage.setTrash(remaining);
          await refreshData();
          renderAll();
          close();
          toast(i18n.t("restoreOk", { n }));
        });
      });
    }
  );
}

async function exportShare() {
  const tab = state.activeTab;
  const sel = [...state.selection[tab]];
  const items = state.items.filter((b) => sel.includes(b.id) && b.url);
  if (!items.length) {
    toast(i18n.t("selectAll") + " → " + i18n.t("exportShare"));
    return;
  }
  exportSharePage(items, i18n.t("exportShare"), stamp());
  toast(i18n.t("exportDone"));
}

function bindEvents() {
  $("#tabs").addEventListener("click", (e) => {
    const tab = e.target.closest(".tab");
    if (!tab) return;
    state.activeTab = tab.getAttribute("data-tab");
    renderAll();
  });

  $("#panel").addEventListener("change", (e) => {
    const cb = e.target.closest("[data-check]");
    if (cb) {
      const id = cb.getAttribute("data-check");
      const sel = state.selection[state.activeTab];
      if (cb.checked) sel.add(id); else sel.delete(id);
      renderPanel();
      return;
    }
    const all = e.target.closest("#select-all");
    if (all) {
      const sel = state.selection[state.activeTab];
      sel.clear();
      if (all.checked) currentTabIds().forEach((id) => sel.add(id));
      renderPanel();
    }
  });

  $("#panel").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    const id = btn.getAttribute("data-id");
    if (action === "delete-selected") return deleteSelected();
    if (action === "open-selected") return openSelected();
    if (action === "move-selected") return moveSelected();
    if (action === "archive-dead") return archiveDead();
    if (action === "open-one") {
      const url = btn.getAttribute("data-url");
      if (url) chrome.tabs.create({ url });
      return;
    }
    if (action === "update-url") {
      const url = btn.getAttribute("data-url");
      if (url) {
        await bm.updateBookmarkUrl(id, url);
        state.updated.add(id);
        await refreshData();
        renderAll();
        toast(i18n.t("updated"));
      }
      return;
    }
    if (action === "wayback") {
      btn.disabled = true;
      btn.textContent = "...";
      const b = state.items.find((x) => x.id === id);
      const resp = await chrome.runtime.sendMessage({ type: "wayback:check", url: b ? b.url : "" });
      state.wayback[id] = resp && resp.ok ? resp.snapshot : null;
      renderPanel();
      return;
    }
    if (action === "use-wayback") {
      const wb = state.wayback[id];
      if (!wb) return;
      await bm.updateBookmarkUrl(id, wb.url);
      state.updated.add(id);
      await refreshData();
      renderAll();
      toast(i18n.t("updated"));
      return;
    }
    if (action === "keep-first") {
      const ids = (btn.getAttribute("data-ids") || "").split(",").filter(Boolean);
      const keep = ids[0];
      const removeIds = ids.slice(1);
      const ok = await confirmModal(i18n.t("confirmDelete"));
      if (!ok) return;
      const { trashEntries } = await bm.removeWithSnapshot(removeIds);
      if (trashEntries.length) await storage.addToTrash(trashEntries);
      await refreshData();
      renderAll();
      toast(i18n.t("deleteDone", { n: trashEntries.length }));
      return;
    }
  });

  $("#btn-scan").addEventListener("click", async () => {
    const s = state.scan;
    if (s && s.status === "scanning") {
      await chrome.runtime.sendMessage({ type: "scan:stop" });
      return;
    }
    await chrome.runtime.sendMessage({ type: "scan:start" });
    setTimeout(async () => {
      state.scan = await storage.getScanState();
      renderScanStatus();
    }, 300);
  });

  $("#btn-backup").addEventListener("click", () => {
    exportBackup(state.tree, stamp());
    toast(i18n.t("exportDone"));
  });
  $("#btn-report").addEventListener("click", () => {
    exportReportCsv(state.items, state.scan ? state.scan.results : {}, stamp());
    toast(i18n.t("exportDone"));
  });
  $("#btn-share").addEventListener("click", exportShare);
  $("#btn-trash").addEventListener("click", showTrash);

  $("#lang-select").addEventListener("change", async (e) => {
    await i18n.setLang(e.target.value);
    applyI18n();
    renderAll();
  });

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area === "local" && changes.scanState) {
      state.scan = changes.scanState.newValue || null;
      if (state.scan && state.scan.status !== "scanning") {
        await refreshData();
        renderAll();
      } else {
        renderScanStatus();
        renderTabs();
      }
    }
  });
}

async function init() {
  await i18n.initLang();
  $("#lang-select").value = i18n.getLang();
  applyI18n();
  await refreshData();
  renderAll();
  bindEvents();
}

init();
