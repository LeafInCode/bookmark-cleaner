import * as i18n from "./lib/i18n.js";
import * as storage from "./lib/storage.js";
import * as bm from "./lib/bookmarks.js";
import * as permissions from "./lib/permissions.js";
import { buildPortrait, buildTimeSeries } from "./lib/stats.js";
import { exportBackup, exportReportCsv, exportShareImage, exportSharePage, exportTree, stamp } from "./lib/export.js";
import { STATUS } from "./lib/linkcheck.js";
import { normalizeUrl } from "./lib/url.js";

const state = {
  items: [],
  tree: null,
  scan: null,
  duplicates: [],
  emptyFolders: [],
  activeTab: "dead",
  selection: { dead: new Set(), duplicates: new Set(), empty: new Set(), moved: new Set(), blocked: new Set(), unvisited: new Set() },
  wayback: {},
  updated: new Set(),
  archivedIds: new Set(),
  unvisited: new Set(),
  unvisitedChecked: false,
  portraitYear: "all",
  portraitMonth: "all",
  portraitLimit: 50,
  search: "",
  dateRange: "all",
  sort: "default",
  limit: 100,
  trashCount: 0,
  settings: null,
  windowId: undefined
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
      return r && r.status === STATUS.DEAD && !state.archivedIds.has(b.id);
    })
    .map((b) => b.id);
}

function movedItems() {
  return state.items.filter((b) => {
    const r = resultOf(b.id);
    return r && r.status === STATUS.MOVED && !state.archivedIds.has(b.id);
  });
}

function blockedItems() {
  return state.items.filter((b) => {
    const r = resultOf(b.id);
    return r && UNVERIFIABLE.includes(r.status) && !state.archivedIds.has(b.id);
  });
}

function dupItemIds() {
  return state.duplicates.flatMap((g) => g.items.map((x) => x.id));
}

function currentTabItems() {
  switch (state.activeTab) {
    case "dead":
      return state.items.filter((b) => {
        const r = resultOf(b.id);
        return r && r.status === STATUS.DEAD;
      });
    case "duplicates":
      return state.duplicates.flatMap((g) => g.items);
    case "empty":
      return state.emptyFolders;
    case "moved":
      return movedItems();
    case "blocked":
      return blockedItems();
    case "unvisited":
      return state.items.filter((b) => state.unvisited.has(b.id));
    default:
      return [];
  }
}

function currentTabIds() {
  switch (state.activeTab) {
    case "dead": return deadIds();
    case "duplicates": return dupItemIds();
    case "empty": return state.emptyFolders.map((f) => f.id);
    case "moved": return movedItems().map((x) => x.id);
    case "blocked": return blockedItems().map((x) => x.id);
    case "unvisited": return [...state.unvisited];
    default: return [];
  }
}

function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = i18n.t(el.getAttribute("data-i18n"));
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = i18n.t(el.getAttribute("data-i18n-title"));
  });
  document.documentElement.lang = i18n.getLang() === "zh" ? "zh-CN" : "en";
}

function renderTopbar() {
  const badge = $("#trash-badge");
  if (!badge) return;
  const n = state.trashCount || 0;
  badge.hidden = n === 0;
  badge.textContent = n > 999 ? "999+" : String(n);
}

async function refreshData() {
  state.tree = await bm.getTree();
  state.items = bm.flattenTree(state.tree);
  state.scan = await storage.getScanState();
  state.archivedIds = await storage.getArchivedIds();
  const trash = await storage.getTrash();
  state.trashCount = trash.length;
  state.settings = await storage.getSettings();
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
    $("#btn-rescan-full").hidden = true;
    return;
  }
  $("#btn-rescan-full").hidden = s.status === "scanning";
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
      })
        + (s.reused ? ` · ${i18n.t("scanReused", { n: s.reused })}` : "")
        + (s.skipped ? ` · ${i18n.t("scanSkipped", { n: s.skipped })}` : "");
    }
  }
}

function renderExcludedHint() {
  const el = $("#excluded-hint");
  if (!el) return;
  const excluded = (state.settings && state.settings.excludedFolders) || [];
  if (!excluded.length) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = `${i18n.t("excludedLabel")}: <strong>${escapeHtml(excluded.join("、"))}</strong> · <a href="#" id="open-settings">${i18n.t("settings")}</a>`;
}

function showSettings() {
  const s = state.settings || {};
  const excluded = s.excludedFolders || [];
  const fmtTime = (ts) => (ts ? new Date(ts).toLocaleString() : i18n.t("never"));
  openModal(
    `<h3>${i18n.t("settingsTitle")}</h3>
     <div class="form-row" style="align-items:flex-start">
       <label>${i18n.t("excludedFoldersLabel")}</label>
       <input id="excluded-input" class="select" value="${escapeHtml(excluded.join(", "))}">
     </div>
     <div class="muted small" style="margin:-4px 0 12px 100px">
       ${i18n.t("excludedFoldersHint")}<br>${i18n.t("excludedNoRegex")}
     </div>
     <label class="small" style="display:block;margin:10px 0 4px">
       <input type="checkbox" id="set-weekly-scan" ${s.weeklyScan ? "checked" : ""}> ${i18n.t("weeklyScanLabel")}
     </label>
     <div class="muted small" style="margin-left:22px">${i18n.t("weeklyScanHint")}</div>
     <label class="small" style="display:block;margin:12px 0 4px">
       <input type="checkbox" id="set-auto-backup" ${s.autoBackup ? "checked" : ""}> ${i18n.t("autoBackupLabel")}
     </label>
     <div class="muted small" style="margin-left:22px">${i18n.t("autoBackupHint")}</div>
     <div class="muted small" style="margin-top:12px">
       ${i18n.t("lastScanLabel")}: ${fmtTime(s.lastScanAt)} · ${i18n.t("lastBackupLabel")}: ${fmtTime(s.lastAutoBackup)}
     </div>
     <div class="modal-actions">
       <button class="btn" id="open-about">${i18n.t("about")}</button>
       <button class="btn" data-modal="cancel">${i18n.t("cancel")}</button>
       <button class="btn primary" data-modal="ok">${i18n.t("save")}</button>
     </div>`,
    (root, close) => {
      root.querySelector("#open-about").addEventListener("click", () => {
        close();
        showAbout();
      });
      root.querySelector('[data-modal="cancel"]').addEventListener("click", close);
      root.querySelector('[data-modal="ok"]').addEventListener("click", async () => {
        const raw = root.querySelector("#excluded-input").value || "";
        const seen = new Set();
        const list = raw
          .split(/[,，、;；]/)
          .map((x) => x.trim())
          .filter((x) => x && x.length <= 50)
          .filter((x) => {
            const key = x.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .slice(0, 20);
        const weeklyScan = root.querySelector("#set-weekly-scan").checked;
        let autoBackup = root.querySelector("#set-auto-backup").checked;
        if (autoBackup) {
          try {
            const granted = await chrome.permissions.request({ permissions: ["downloads"] });
            if (!granted) {
              autoBackup = false;
              toast(i18n.t("permissionDenied"));
            }
          } catch {
            autoBackup = false;
          }
        }
        state.settings = await storage.setSettings({ excludedFolders: list, weeklyScan, autoBackup });
        close();
        renderExcludedHint();
        toast(i18n.t("saved"));
      });
    }
  );
}

function renderTabs() {
  const tabs = [
    ["dead", "tabDead", deadIds().length],
    ["duplicates", "tabDuplicates", dupItemIds().length],
    ["empty", "tabEmpty", state.emptyFolders.length],
    ["moved", "tabMoved", movedItems().length],
    ["blocked", "tabBlocked", blockedItems().length]
  ];
  if (state.unvisitedChecked) {
    tabs.push(["unvisited", "unvisited", state.unvisited.size]);
  }
  tabs.push(["portrait", "portrait", null]);
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

function inDateRange(b) {
  const range = state.dateRange || "all";
  if (range === "all") return true;
  if (!b.dateAdded) return false;
  const days = (Date.now() - b.dateAdded) / 86400000;
  if (range === "1y") return days <= 365;
  if (range === "3y") return days <= 365 * 3;
  if (range === "older") return days > 365 * 3;
  return true;
}

function visibleItems(items) {
  const q = (state.search || "").trim().toLowerCase();
  let out = items;
  if (q) {
    out = out.filter((b) => [b.title, b.url, b.path].some((x) => (x || "").toLowerCase().includes(q)));
  }
  if (state.dateRange && state.dateRange !== "all") {
    out = out.filter((b) => (b.type === "folder" ? true : inDateRange(b)));
  }
  const s = state.sort || "default";
  if (s === "title") out = [...out].sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
  else if (s === "newest") out = [...out].sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
  else if (s === "oldest") out = [...out].sort((a, b) => (a.dateAdded || 0) - (b.dateAdded || 0));
  else if (s === "path") out = [...out].sort((a, b) => String(a.path || "").localeCompare(String(b.path || "")));
  return out;
}

function paginate(items) {
  const shown = items.slice(0, state.limit);
  const rest = items.length - shown.length;
  const more = rest > 0
    ? `<div class="show-more"><button class="btn" data-action="show-more">${i18n.t("showMore")} (${i18n.t("remaining", { n: rest })})</button></div>`
    : "";
  return { shown, more };
}

function renderListControls() {
  const show = state.activeTab !== "portrait";
  const el = $("#list-controls");
  el.style.display = show ? "flex" : "none";
  if (!show) return;
  const input = $("#search-input");
  if (document.activeElement !== input) input.value = state.search || "";
  input.placeholder = i18n.t("searchPlaceholder");
  $("#sort-select").innerHTML = [
    ["default", "sortDefault"],
    ["title", "sortTitle"],
    ["newest", "sortNewest"],
    ["oldest", "sortOldest"],
    ["path", "sortPath"]
  ].map(([v, k]) => `<option value="${v}" ${state.sort === v ? "selected" : ""}>${i18n.t(k)}</option>`).join("");
  const dateSel = $("#date-select");
  if (dateSel) {
    dateSel.innerHTML = [
      ["all", "dateRangeAll"],
      ["1y", "dateRange1y"],
      ["3y", "dateRange3y"],
      ["older", "dateRangeOlder"]
    ].map(([v, k]) => `<option value="${v}" ${state.dateRange === v ? "selected" : ""}>${i18n.t(k)}</option>`).join("");
  }
}

function renderToolbar(extraButtons) {
  const ids = visibleItems(currentTabItems()).map((x) => x.id);
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
    gateway_error: "noteGateway",
    auth: "noteAuth",
    method: "noteMethod",
    legal: "noteLegal",
    redirect: "noteRedirect",
    unknown: "noteUnknown",
    browser_verified: "noteBrowserVerified",
    browser_not_found: "noteBrowserNotFound",
    browser_server_error: "noteBrowserServerError",
    browser_blocked: "noteBrowserBlocked",
    browser_error: "noteBrowserError",
    browser_unverified: "noteBrowserUnverified",
    manual_confirmed: "noteManualConfirmed"
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
  const panelActions = opts && opts.actions ? opts.actions(b, r) : "";
  const canReview = state.activeTab === "dead" || state.activeTab === "blocked";
  const okBtn = canReview
    ? `<button class="btn small ghost" data-action="mark-ok" data-id="${b.id}">${i18n.t("markOk")}</button>`
    : "";
  const archiveBtn = canReview
    ? `<button class="btn small ghost" data-action="archive-one" data-id="${b.id}">${i18n.t("archiveOne")}</button>`
    : "";
  const actions = `${panelActions}${okBtn}${archiveBtn}
    <button class="btn small danger" data-action="delete-one" data-id="${b.id}">${i18n.t("deleteOne")}</button>`;
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

function renderSelectionBar() {
  const bar = $("#selection-bar");
  const sel = state.selection[state.activeTab];
  if (!sel || !sel.size) {
    bar.hidden = true;
    bar.innerHTML = "";
    return;
  }
  bar.hidden = false;
  const moveBtn = state.activeTab === "empty"
    ? ""
    : `<button class="btn small" data-action="move-selected">${i18n.t("move")}</button>`;
  const archiveBtn = (state.activeTab === "dead" || state.activeTab === "blocked")
    ? `<button class="btn small ghost" data-action="archive-selected">${i18n.t("archive")}</button>`
    : "";
  const titleBtn = state.activeTab === "empty"
    ? ""
    : `<button class="btn small" data-action="clean-titles" title="${i18n.t("tipCleanTitles")}">${i18n.t("cleanTitles")}</button>`;
  bar.innerHTML = `
    <span class="sel-count">${i18n.t("selectedBar", { n: sel.size })}</span>
    ${archiveBtn}
    ${moveBtn}
    ${titleBtn}
    <button class="btn small ghost" data-action="open-selected">${i18n.t("open")}</button>
    <button class="btn small danger" data-action="delete-selected">${i18n.t("delete")}</button>
    <button class="btn small ghost" data-action="clear-selection">${i18n.t("clearSelection")}</button>`;
}

function hint(textKey) {
  return `<div class="hint">${i18n.t(textKey)}</div>`;
}

function renderDeadPanel() {
  const items = visibleItems(state.items.filter((b) => {
    const r = resultOf(b.id);
    return r && r.status === STATUS.DEAD;
  }));
  if (!items.length) return hint("hintDead") + emptyState();
  const buttons = `<button class="btn small" data-action="archive-dead">${i18n.t("archive")}</button>`;
  const { shown, more } = paginate(items);
  return renderToolbar(buttons) + hint("hintDead") + `<div class="list">${shown.map((b) => {
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
  }).join("")}</div>` + more;
}

function renderMovedPanel() {
  const items = visibleItems(movedItems());
  if (!items.length) return hint("hintMoved") + emptyState();
  const { shown, more } = paginate(items);
  return renderToolbar("") + hint("hintMoved") + `<div class="list">${shown.map((b) => {
    const r = resultOf(b.id) || {};
    const done = state.updated.has(b.id);
    return renderItemRow(b, {
      extra: () => `<span class="muted small">${i18n.t("movedTo")}: ${escapeHtml(r.movedTo || "")}</span>`,
      actions: (bb) => done
        ? `<button class="btn small ghost" data-action="open-one" data-url="${escapeHtml(r.movedTo || bb.url)}">↗</button>`
        : `<button class="btn small" data-action="update-url" data-id="${bb.id}" data-url="${escapeHtml(r.movedTo || "")}">${i18n.t("updateUrl")}</button>
           <button class="btn small ghost" data-action="open-one" data-url="${escapeHtml(r.movedTo || bb.url)}">↗</button>`
    });
  }).join("")}</div>` + more;
}

function renderBlockedPanel() {
  const items = visibleItems(blockedItems());
  if (!items.length) return hint("hintBlocked") + emptyState();
  const { shown, more } = paginate(items);
  return renderToolbar("") + hint("hintBlocked") + `<div class="list">${shown.map((b) =>
    renderItemRow(b, {
      actions: (bb) => `
        <button class="btn small" data-action="browser-verify" data-id="${bb.id}">${i18n.t("browserVerify")}</button>
        <button class="btn small ghost" data-action="open-one" data-url="${escapeHtml(bb.url)}">↗</button>`
    })
  ).join("")}</div>` + more;
}

function renderDuplicatesPanel() {
  const q = (state.search || "").trim().toLowerCase();
  let groups = state.duplicates;
  if (q) {
    groups = groups.filter((g) =>
      g.items.some((b) => [b.title, b.url, b.path].some((x) => (x || "").toLowerCase().includes(q)))
    );
  }
  if (!groups.length) return emptyState();
  const shownGroups = groups.slice(0, state.limit);
  const rest = groups.length - shownGroups.length;
  const more = rest > 0
    ? `<div class="show-more"><button class="btn" data-action="show-more">${i18n.t("showMore")} (${i18n.t("remaining", { n: rest })})</button></div>`
    : "";
  const groupsHtml = shownGroups.map((g) => {
    const rows = g.items.map((b, idx) => {
      const sel = state.selection.duplicates;
      const checked = sel.has(b.id) ? "checked" : "";
      return `
        <div class="dup-item">
          <input type="checkbox" data-check="${b.id}" ${checked}>
          <span class="item-title">${escapeHtml(b.title || b.url)}</span>
          <span class="muted small">${idx === 0 ? "①" : ""}</span>
          <button class="btn small ghost" data-action="open-one" data-url="${escapeHtml(b.url)}">↗</button>
          <button class="btn small danger" data-action="delete-one" data-id="${b.id}">${i18n.t("deleteOne")}</button>
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
  return renderToolbar("") + `<div class="list">${groupsHtml}</div>` + more;
}

function renderEmptyPanel() {
  const items = visibleItems(state.emptyFolders);
  if (!items.length) return emptyState();
  const sel = state.selection.empty;
  const { shown, more } = paginate(items);
  const rows = shown.map((f) => `
    <div class="item" data-id="${f.id}">
      <input type="checkbox" data-check="${f.id}" ${sel.has(f.id) ? "checked" : ""}>
      <div class="item-main">
        <div class="item-title">📁 ${escapeHtml(f.title || "(untitled)")}</div>
        <div class="item-url">${escapeHtml(f.path || "")}</div>
      </div>
      <div class="item-actions">
        <button class="btn small danger" data-action="delete-one" data-id="${f.id}">${i18n.t("deleteOne")}</button>
      </div>
    </div>`).join("");
  return renderToolbar("") + `<div class="list">${rows}</div>` + more;
}

function renderPortraitPanel() {
  const yearFilter = state.portraitYear || "all";
  const all = state.items;
  const yearSet = new Set();
  for (const b of all) {
    if (b.type === "bookmark" && b.dateAdded) {
      yearSet.add(String(new Date(b.dateAdded).getFullYear()));
    }
  }
  const yearsDesc = [...yearSet].sort((a, b) => b.localeCompare(a));
  const filtered = yearFilter === "all"
    ? all
    : all.filter((x) => x.type === "folder" || (x.dateAdded && String(new Date(x.dateAdded).getFullYear()) === yearFilter));
  const ids = new Set(filtered.filter((x) => x.type === "bookmark" && x.url).map((x) => x.id));
  const results = state.scan && state.scan.results
    ? Object.fromEntries(Object.entries(state.scan.results).filter(([id]) => ids.has(id)))
    : null;
  const dups = yearFilter === "all"
    ? state.duplicates
    : state.duplicates
        .map((g) => ({ ...g, items: g.items.filter((i) => ids.has(i.id)) }))
        .filter((g) => g.items.length > 1);
  const p = buildPortrait(filtered, results, dups);
  const maxDomain = p.topDomains.length ? p.topDomains[0].count : 1;
  const fmtDate = (b) => (b && b.dateAdded ? new Date(b.dateAdded).toLocaleDateString() : "—");
  const palette = ["#2563eb", "#7c3aed", "#0891b2", "#059669", "#d97706", "#dc2626", "#4f46e5", "#0d9488", "#b45309", "#be185d"];
  const yearColor = {};
  yearsDesc.slice().reverse().forEach((y, i) => { yearColor[y] = palette[i % palette.length]; });

  const yearCountsAll = new Map();
  for (const b of all) {
    if (b.type === "bookmark" && b.dateAdded) {
      const y = String(new Date(b.dateAdded).getFullYear());
      yearCountsAll.set(y, (yearCountsAll.get(y) || 0) + 1);
    }
  }
  const filterChips = [
    `<button class="year-chip ${yearFilter === "all" ? "active" : ""}" data-year="all">${i18n.t("allYears")} (${all.filter((x) => x.type === "bookmark" && x.url).length})</button>`
  ].concat(
    yearsDesc.map((y) => `<button class="year-chip ${yearFilter === y ? "active" : ""}" data-year="${y}">${y} (${yearCountsAll.get(y) || 0})</button>`)
  ).join("");

  const domains = p.topDomains.map((d) => {
    const segs = d.years.map(([y, c]) =>
      `<span class="seg" style="width:${((c / d.count) * 100).toFixed(1)}%;background:${yearColor[y] || "#94a3b8"}" title="${y}: ${c}"></span>`
    ).join("");
    return `
    <div class="bar-row">
      <span class="name" title="${escapeHtml(d.domain)}">${escapeHtml(d.domain)}</span>
      <span class="bar stacked">${segs}</span>
      <span class="val">${d.count}</span>
    </div>`;
  }).join("");

  const series = buildTimeSeries(state.items, yearFilter, state.portraitMonth);
  const chart = svgAreaChart(series.points);
  const chartTitle = yearFilter === "all"
    ? i18n.t("chartTitleAll")
    : (state.portraitMonth === "all"
        ? i18n.t("chartTitleYear", { year: yearFilter })
        : i18n.t("chartTitleMonth", { year: yearFilter, month: state.portraitMonth }));
  const locale = i18n.getLang() === "zh" ? "zh-CN" : "en-US";
  const monthOptions = [["all", i18n.t("portraitMonthAll")]].concat(
    Array.from({ length: 12 }, (_, i) => {
      const v = String(i + 1).padStart(2, "0");
      const label = new Date(2026, i, 1).toLocaleString(locale, { month: "long" });
      return [v, label];
    })
  ).map(([v, label]) => `<option value="${v}" ${state.portraitMonth === v ? "selected" : ""}>${label}</option>`).join("");
  const monthSelect = yearFilter !== "all"
    ? `<select id="portrait-month" class="select">${monthOptions}</select>`
    : "";

  const periodBookmarks = filtered.filter((x) => x.type === "bookmark" && x.url);
  let listItems = periodBookmarks;
  if (yearFilter !== "all" && state.portraitMonth !== "all") {
    listItems = periodBookmarks.filter((b) => {
      if (!b.dateAdded) return false;
      return String(new Date(b.dateAdded).getMonth() + 1).padStart(2, "0") === state.portraitMonth;
    });
  }
  listItems = [...listItems].sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
  const shownList = listItems.slice(0, state.portraitLimit);
  const listMore = listItems.length > shownList.length
    ? `<div class="show-more"><button class="btn" data-action="portrait-more">${i18n.t("showMore")} (${i18n.t("remaining", { n: listItems.length - shownList.length })})</button></div>`
    : "";
  const listHtml = shownList.map((b) => `
    <div class="portrait-item">
      <div class="item-main">
        <div class="item-title">${escapeHtml(b.title || b.url)}</div>
        <div class="item-url">${escapeHtml(b.url)}</div>
        <div class="item-meta muted small">🕒 ${b.dateAdded ? new Date(b.dateAdded).toLocaleString() : "—"} · ${escapeHtml(b.path || "")}</div>
      </div>
      <button class="btn small ghost" data-action="open-one" data-url="${escapeHtml(b.url)}">↗</button>
    </div>`).join("");

  const folderCard = yearFilter === "all"
    ? `<div class="stat-card grad-purple"><div class="num">${p.totalFolders}</div><div class="label">${i18n.t("folders")}</div></div>`
    : `<div class="stat-card grad-purple" title="${i18n.t("folderNoTime")}"><div class="num">—</div><div class="label">${i18n.t("folders")}</div></div>`;

  return `
    <div class="year-row">${filterChips}${monthSelect}</div>
    <div class="portrait-cols">
      <div class="portrait-col">
        <h4>${i18n.t("portraitTimeGroup")}</h4>
        <div class="portrait-grid">
          <div class="stat-card grad-blue"><div class="num">${p.totalBookmarks}</div><div class="label">${i18n.t("totalBookmarks")}</div></div>
          <div class="stat-card grad-green"><div class="num">${p.spanDays}<span class="unit">${i18n.t("portraitDays")}</span></div><div class="label">${i18n.t("portraitSpan")}</div></div>
          <div class="stat-card grad-cyan"><div class="num">${p.avgPerMonth}</div><div class="label">${i18n.t("portraitAvgMonth")}</div></div>
          <div class="stat-card grad-purple"><div class="num">${p.mostActive ? p.mostActive[0] : "—"}<span class="unit">${p.mostActive ? p.mostActive[1] : ""}</span></div><div class="label">${i18n.t("portraitMostActive")}</div></div>
        </div>
      </div>
      <div class="portrait-col">
        <h4>${i18n.t("portraitStructGroup")}</h4>
        <div class="portrait-grid">
          ${folderCard}
          <div class="stat-card grad-red"><div class="num">${p.deadCount}<span class="unit">(${(p.deadRatio * 100).toFixed(1)}%)</span></div><div class="label">${i18n.t("deadLinks")}</div></div>
          <div class="stat-card grad-amber"><div class="num">${p.duplicateCount}</div><div class="label">${i18n.t("duplicates")}</div></div>
        </div>
      </div>
    </div>
    <div class="card">
      <h3>${chartTitle}</h3>
      <div class="chart-wrap" id="chart-wrap">
        ${chart || `<div class="muted small">${i18n.t("noItems")}</div>`}
        <div class="chart-tip" hidden></div>
      </div>
      ${p.mostActive ? `<div class="muted small">${i18n.t("portraitMostActive")}: ${p.mostActive[0]} (${p.mostActive[1]}) · ${i18n.t("portraitOldest")}: ${fmtDate(p.oldest)} · ${i18n.t("portraitNewest")}: ${fmtDate(p.newest)}</div>` : ""}
    </div>
    <div class="card"><h3>${i18n.t("portraitTopDomains")}</h3>${domains || `<div class="muted small">${i18n.t("noItems")}</div>`}</div>
    <div class="card">
      <h3>${i18n.t("portraitList")} (${listItems.length})</h3>
      ${listHtml ? `<div class="portrait-list">${listHtml}</div>${listMore}` : `<div class="muted small">${i18n.t("portraitListEmpty")}</div>`}
    </div>`;
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
  const isDay = points[0][0].length === 10;
  const sameYear = points.every((p) => p[0].slice(0, 4) === points[0][0].slice(0, 4));
  const fmtLabel = (label) => (isDay ? label.slice(8) : (sameYear ? label.slice(5) : label.slice(2)));
  const labels = points.map(([label], i) => {
    if (i % every !== 0 && i !== points.length - 1) return "";
    const x = padL + i * step;
    return `<text x="${x.toFixed(1)}" y="${h - 8}" class="chart-axis" text-anchor="middle">${escapeHtml(fmtLabel(label))}</text>`;
  }).join("");
  const dots = coords.map(([x, y], i) =>
    `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" class="chart-dot"><title>${escapeHtml(points[i][0])}: ${points[i][1]}</title></circle>`
  ).join("");
  const hits = coords.map(([x], i) => {
    const w = Math.max(step, 8);
    return `<rect class="chart-hit" x="${(x - w / 2).toFixed(1)}" y="${padT}" width="${w.toFixed(1)}" height="${innerH}" fill="transparent"
      data-label="${escapeHtml(points[i][0])}" data-value="${points[i][1]}"/>`;
  }).join("");
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
    ${hits}
    ${labels}
  </svg>`;
}

function emptyState() {
  return `<div class="empty-state">${i18n.t("allGood")}</div>`;
}

function renderUnvisitedPanel() {
  const items = visibleItems(currentTabItems());
  if (!items.length) return hint("unvisitedHint") + emptyState();
  const { shown, more } = paginate(items);
  return renderToolbar("") + hint("unvisitedHint") + `<div class="list">${shown.map((b) =>
    renderItemRow(b, {
      actions: (bb) => `<button class="btn small ghost" data-action="open-one" data-url="${escapeHtml(bb.url)}">↗</button>`
    })
  ).join("")}</div>` + more;
}

function renderPanel() {
  const panel = $("#panel");
  switch (state.activeTab) {
    case "dead": panel.innerHTML = renderDeadPanel(); break;
    case "duplicates": panel.innerHTML = renderDuplicatesPanel(); break;
    case "empty": panel.innerHTML = renderEmptyPanel(); break;
    case "moved": panel.innerHTML = renderMovedPanel(); break;
    case "blocked": panel.innerHTML = renderBlockedPanel(); break;
    case "unvisited": panel.innerHTML = renderUnvisitedPanel(); break;
    case "portrait": panel.innerHTML = renderPortraitPanel(); break;
    default: panel.innerHTML = "";
  }
  if (state.activeTab === "portrait") bindChartHover();
}

function bindChartHover() {
  const wrap = $("#chart-wrap");
  if (!wrap) return;
  const tip = wrap.querySelector(".chart-tip");
  if (!tip) return;
  wrap.addEventListener("mousemove", (e) => {
    const hit = e.target.closest(".chart-hit");
    if (!hit) {
      tip.hidden = true;
      return;
    }
    tip.hidden = false;
    tip.textContent = `${hit.getAttribute("data-label")}: ${hit.getAttribute("data-value")}`;
    const rect = wrap.getBoundingClientRect();
    tip.style.left = `${e.clientX - rect.left}px`;
    tip.style.top = `${e.clientY - rect.top - 30}px`;
  });
  wrap.addEventListener("mouseleave", () => {
    tip.hidden = true;
  });
}

function renderAll() {
  renderTabs();
  renderScanStatus();
  renderTopbar();
  renderExcludedHint();
  renderListControls();
  renderPanel();
  renderSelectionBar();
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
  await logOp({ type: "delete", titles: trashEntries.map((t) => t.title || t.url || "") });
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
  const snapshot = ids.map((bid) => {
    const b = state.items.find((x) => x.id === bid) || {};
    return { id: bid, title: b.title || b.url || bid, parentId: b.parentId || null };
  });
  const moved = await bm.moveBookmarks(ids, folder.id);
  await storage.addArchivedIds(ids);
  await logOp({ type: "archive", titles: snapshot.map((x) => x.title), items: snapshot });
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
        const snapshot = ids.map((bid) => {
          const b = state.items.find((x) => x.id === bid) || {};
          return { id: bid, title: b.title || b.url || bid, parentId: b.parentId || null };
        });
        const moved = await bm.moveBookmarks(ids, parentId);
        await logOp({ type: "move", titles: snapshot.map((x) => x.title), items: snapshot });
        state.selection[tab].clear();
        await refreshData();
        renderAll();
        close();
        toast(i18n.t("moveDone", { n: moved }));
      });
    }
  );
}

function folderOptionsHtml() {
  const folders = state.items.filter((x) => x.type === "folder" && x.id !== "0");
  return folders
    .map((f) => {
      const depth = (f.path || "").split(" / ").length;
      return `<option value="${f.id}">${"— ".repeat(Math.max(0, depth - 1))}${escapeHtml(f.title || "(untitled)")}</option>`;
    })
    .join("");
}

function showExportModal() {
  openModal(
    `<h3>${i18n.t("exportTitle")}</h3>
     <div class="form-row">
       <label>${i18n.t("exportSource")}</label>
       <select id="export-source" class="select">
         <option value="all">${i18n.t("sourceAll")}</option>
         <option value="folder">${i18n.t("sourceFolder")}</option>
         <option value="range">${i18n.t("sourceRange")}</option>
       </select>
     </div>
     <div class="form-row" id="export-folder-row" hidden>
       <label>${i18n.t("sourceFolder")}</label>
       <select id="export-folder" class="select">${folderOptionsHtml()}</select>
     </div>
     <div class="form-row" id="export-range-row" hidden>
       <label>${i18n.t("sourceRange")}</label>
       <span class="range-inputs">
         <input type="date" id="export-from" class="select">
         <span class="muted">~</span>
         <input type="date" id="export-to" class="select">
       </span>
     </div>
     <div class="form-row">
       <label>${i18n.t("exportFormat")}</label>
       <select id="export-format" class="select">
         <option value="json">${i18n.t("fmtJson")}</option>
         <option value="html">${i18n.t("fmtHtml")}</option>
         <option value="csv">${i18n.t("fmtCsv")}</option>
       </select>
     </div>
     <div class="modal-actions">
       <button class="btn" data-modal="cancel">${i18n.t("cancel")}</button>
       <button class="btn primary" data-modal="ok">${i18n.t("confirm")}</button>
     </div>`,
    (root, close) => {
      const sourceSel = root.querySelector("#export-source");
      sourceSel.addEventListener("change", () => {
        root.querySelector("#export-folder-row").hidden = sourceSel.value !== "folder";
        root.querySelector("#export-range-row").hidden = sourceSel.value !== "range";
      });
      root.querySelector('[data-modal="cancel"]').addEventListener("click", close);
      root.querySelector('[data-modal="ok"]').addEventListener("click", async () => {
        const source = sourceSel.value;
        const format = root.querySelector("#export-format").value;
        const opts = {
          folderId: root.querySelector("#export-folder").value,
          from: root.querySelector("#export-from").value,
          to: root.querySelector("#export-to").value
        };
        close();
        await doExport(source, format, opts);
      });
    }
  );
}

async function doExport(source, format, opts) {
  const s = stamp();
  let items = [];
  let tree = null;
  if (source === "all") {
    tree = state.tree;
    items = state.items.filter((x) => x.type === "bookmark" && x.url);
  } else if (source === "folder") {
    if (!opts.folderId) return;
    const sub = await bm.getSubTree(opts.folderId);
    tree = sub ? [sub] : null;
    items = bm.flattenTree(sub ? [sub] : []).filter((x) => x.type === "bookmark" && x.url);
  } else if (source === "range") {
    const from = opts.from ? new Date(`${opts.from}T00:00:00`).getTime() : 0;
    const to = opts.to ? new Date(`${opts.to}T23:59:59`).getTime() : Number.MAX_SAFE_INTEGER;
    items = state.items.filter((x) => x.type === "bookmark" && x.url && x.dateAdded >= from && x.dateAdded <= to);
    tree = [{
      title: `${i18n.t("exportTitle")} ${opts.from || ""} ~ ${opts.to || ""}`.trim(),
      children: items.map((b) => ({ title: b.title, url: b.url }))
    }];
  }
  if (!items.length) {
    toast(i18n.t("exportEmpty"));
    return;
  }
  if (format === "json") {
    exportTree(tree, `bookmarks-export-${s}.json`);
    toast(i18n.t("exportDone"));
  } else if (format === "html") {
    showShareTitleModal(items);
  } else {
    exportReportCsv(items, state.scan ? state.scan.results : {}, s);
    toast(i18n.t("exportDone"));
  }
}

function showImportModal(file) {
  openModal(
    `<h3>${i18n.t("importTitle")}</h3>
     <div class="form-row">
       <label>${i18n.t("importTarget")}</label>
       <select id="import-target" class="select">
         <option value="__new__">${i18n.t("importNewFolder")}</option>
         ${folderOptionsHtml()}
       </select>
     </div>
     <label class="small"><input type="checkbox" id="import-dedupe" checked> ${i18n.t("importDedupe")}</label>
     <div class="modal-actions">
       <button class="btn" data-modal="cancel">${i18n.t("cancel")}</button>
       <button class="btn primary" data-modal="ok">${i18n.t("confirm")}</button>
     </div>`,
    (root, close) => {
      root.querySelector('[data-modal="cancel"]').addEventListener("click", close);
      root.querySelector('[data-modal="ok"]').addEventListener("click", async () => {
        const target = root.querySelector("#import-target").value;
        const dedupe = root.querySelector("#import-dedupe").checked;
        close();
        await doImport(file, target, dedupe);
      });
    }
  );
}

async function doImport(file, target, dedupe) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const roots = Array.isArray(data) ? data : [data];
    const children = roots.flatMap((r) => r.children || []);
    let parentId = target;
    if (target === "__new__") {
      const folder = await bm.createFolder("1", `${i18n.t("importFolder")} ${new Date().toLocaleString()}`);
      parentId = folder.id;
    }
    const existing = dedupe ? await bm.collectExistingUrlKeys() : new Set();
    const res = await bm.importTree(children, parentId, existing);
    await refreshData();
    renderAll();
    toast(i18n.t("importDone", res));
  } catch (err) {
    toast(String(err && err.message ? err.message : err));
  }
}

async function logOp(entry) {
  try {
    await storage.addOpLog(entry);
  } catch {
    /* non-critical */
  }
}

function dayKey(ts) {
  const d = new Date(ts);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (ts >= startOfToday) return i18n.t("today");
  if (ts >= startOfToday - 86400000) return i18n.t("yesterday");
  return d.toLocaleDateString();
}

function groupByDay(entries, getTs) {
  const map = new Map();
  for (const e of entries) {
    const key = dayKey(getTs(e));
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(e);
  }
  return map;
}

function showHistory() {
  storage.getOpLog().then((log) => {
    const typeLabel = {
      archive: "opArchive",
      move: "opMove",
      url: "opUrl",
      "mark-ok": "opMarkOk",
      delete: "opDelete",
      title: "opTitle"
    };
    let body = `<div class="muted small">${i18n.t("historyEmpty")}</div>`;
    if (log.length) {
      const indexed = log.map((e, i) => ({ ...e, _i: i }));
      const byDay = groupByDay(indexed, (e) => e.at);
      body = [...byDay.entries()].map(([day, entries]) => `
        <div class="day-group">
          <div class="day-head">${escapeHtml(day)} <span class="count">${entries.length}</span></div>
          ${entries.map((e) => {
            const titles = (e.titles || []).slice(0, 3).join("、");
            const more = (e.titles || []).length > 3 ? ` 等 ${e.titles.length} 项` : "";
            const undoable = e.type !== "delete";
            return `
              <div class="trash-item">
                <div class="item-main">
                  <div class="item-title"><span class="op-tag op-${e.type}">${i18n.t(typeLabel[e.type] || e.type)}</span>${escapeHtml(titles)}${more}</div>
                  <div class="item-url">${new Date(e.at).toLocaleTimeString()}${e.type === "delete" ? ` · ${i18n.t("deletedHint")}` : ""}</div>
                </div>
                ${undoable ? `<button class="btn small" data-undo="${e._i}">${i18n.t("undo")}</button>` : ""}
              </div>`;
          }).join("")}
        </div>`).join("");
    }
    openModal(
      `<h3>${i18n.t("history")}</h3>${body}
       <div class="modal-actions">
         <button class="btn" data-modal="close">${i18n.t("close")}</button>
       </div>`,
      (root, close) => {
        root.querySelector('[data-modal="close"]').addEventListener("click", close);
        root.querySelectorAll("[data-undo]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const idx = Number(btn.getAttribute("data-undo"));
            const log = await storage.getOpLog();
            const entry = log[idx];
            if (!entry) return;
            const ok = await undoEntry(entry);
            if (ok) {
              log.splice(idx, 1);
              await storage.setOpLog(log);
            }
            await refreshData();
            renderAll();
            close();
            showHistory();
            if (ok) toast(i18n.t("undoDone"));
          });
        });
      }
    );
  });
}

async function undoEntry(entry) {
  try {
    if (entry.type === "archive" || entry.type === "move") {
      const ids = (entry.items || []).map((x) => x.id);
      for (const item of entry.items || []) {
        if (item.parentId) {
          try {
            await chrome.bookmarks.move(item.id, { parentId: item.parentId });
          } catch {
            /* parent gone */
          }
        }
      }
      await storage.removeArchivedIds(ids);
      return true;
    }
    if (entry.type === "url" && entry.id && entry.prevUrl) {
      await bm.updateBookmarkUrl(entry.id, entry.prevUrl);
      return true;
    }
    if (entry.type === "title") {
      for (const item of entry.items || []) {
        if (item.id && item.prevTitle !== undefined) {
          try {
            await chrome.bookmarks.update(item.id, { title: item.prevTitle });
          } catch {
            /* skip */
          }
        }
      }
      return true;
    }
    if (entry.type === "mark-ok" && entry.id) {
      const st = await storage.getScanState();
      if (st && st.results && st.results[entry.id]) {
        st.results[entry.id] = {
          ...st.results[entry.id],
          status: entry.prevStatus || "blocked",
          note: entry.prevNote || null,
          checkedAt: Date.now()
        };
        await storage.setScanState(st);
        state.scan = st;
      }
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function showAbout() {
  const version = chrome.runtime.getManifest().version;
  openModal(
    `<h3>${i18n.t("appName")} <span class="muted small">v${escapeHtml(version)}</span></h3>
     <p class="muted small">${i18n.t("aboutDesc")}</p>
     <div class="about-links">
       <a class="btn small tone-blue" href="https://github.com/LeafInCode/bookmark-cleaner" target="_blank" rel="noopener">${i18n.t("githubLink")}</a>
       <a class="btn small tone-gray" href="${chrome.runtime.getURL("privacy.html")}" target="_blank" rel="noopener">${i18n.t("privacyLink")}</a>
     </div>
     <h3 style="margin-top:18px">🍋 ${i18n.t("supportTitle")}</h3>
     <p class="muted small">${i18n.t("supportText")}</p>
     <div class="support-box">
       <img id="support-qr" class="support-qr" src="assets/support.png" alt="support">
       <div id="support-placeholder" class="support-placeholder" hidden>${i18n.t("supportMissing")}</div>
     </div>
     <p class="muted small" style="text-align:center">${i18n.t("thanksText")}</p>
     <div class="modal-actions">
       <button class="btn" data-modal="close">${i18n.t("close")}</button>
     </div>`,
    (root, close) => {
      root.querySelector('[data-modal="close"]').addEventListener("click", close);
      const img = root.querySelector("#support-qr");
      const ph = root.querySelector("#support-placeholder");
      if (img && ph) {
        img.addEventListener("error", () => {
          img.hidden = true;
          ph.hidden = false;
        });
        img.addEventListener("load", () => {
          ph.hidden = true;
        });
      }
    }
  );
}

function showTimeMachine() {
  const now = new Date();
  const md = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const bookmarks = state.items.filter((x) => x.type === "bookmark" && x.url && x.dateAdded);
  const onThisDay = bookmarks
    .filter((b) => {
      const d = new Date(b.dateAdded);
      const key = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return key === md && d.getFullYear() < now.getFullYear();
    })
    .sort((a, b) => b.dateAdded - a.dateAdded);
  const shuffle = () => [...bookmarks].sort(() => Math.random() - 0.5).slice(0, 8);
  let randomPicks = shuffle();
  let activeTm = "day";

  const card = (b, kind) => {
    const d = new Date(b.dateAdded);
    const badge = kind === "day" ? i18n.t("yearsAgo", { n: now.getFullYear() - d.getFullYear() }) : d.getFullYear();
    return `
      <div class="tm-card tm-${kind}">
        <span class="tm-year">${badge}</span>
        <div class="item-main">
          <div class="item-title">${escapeHtml(b.title || b.url)}</div>
          <div class="item-url">${escapeHtml(b.url)}</div>
        </div>
        <button class="btn small ghost" data-action="open-one" data-url="${escapeHtml(b.url)}">↗</button>
      </div>`;
  };

  const bodyHtml = () => {
    if (activeTm === "day") {
      return onThisDay.length
        ? onThisDay.slice(0, 12).map((b) => card(b, "day")).join("")
        : `<div class="muted small">${i18n.t("noOnThisDay")}</div>`;
    }
    return `<div class="tm-shuffle-row"><button class="btn small" id="tm-shuffle">🎲 ${i18n.t("refresh")}</button></div>`
      + randomPicks.map((b) => card(b, "random")).join("");
  };

  openModal(
    `<h3>${i18n.t("timeMachine")}</h3>
     <div class="tm-tabs">
       <button class="tm-tab ${activeTm === "day" ? "active" : ""}" data-tm="day">🕰 ${i18n.t("onThisDay")} (${onThisDay.length})</button>
       <button class="tm-tab ${activeTm === "random" ? "active" : ""}" data-tm="random">🎲 ${i18n.t("randomPicks")}</button>
     </div>
     <div id="tm-body">${bodyHtml()}</div>
     <div class="modal-actions">
       <button class="btn" id="tm-side">${i18n.t("openSidePanel")}</button>
       <button class="btn" id="tm-window">${i18n.t("openWindow")}</button>
       <button class="btn" data-modal="close">${i18n.t("close")}</button>
     </div>`,
    (root, close) => {
      root.querySelector('[data-modal="close"]').addEventListener("click", close);
      root.querySelector("#tm-window").addEventListener("click", () => {
        chrome.windows.create({
          url: chrome.runtime.getURL("timemachine.html"),
          type: "popup",
          width: 440,
          height: 680
        });
        close();
      });
      root.querySelector("#tm-side").addEventListener("click", () => {
        const winId = state.windowId;
        const call = winId !== undefined
          ? chrome.sidePanel.open({ windowId: winId })
          : chrome.windows.getCurrent().then((w) => chrome.sidePanel.open({ windowId: w.id }));
        Promise.resolve(call)
          .then(() => close())
          .catch((err) => toast(String((err && err.message) || err)));
      });
      root.addEventListener("click", (e) => {
        const tab = e.target.closest("[data-tm]");
        if (tab) {
          activeTm = tab.getAttribute("data-tm");
          root.querySelectorAll(".tm-tab").forEach((t) => t.classList.toggle("active", t.getAttribute("data-tm") === activeTm));
          root.querySelector("#tm-body").innerHTML = bodyHtml();
          return;
        }
        if (e.target.closest("#tm-shuffle")) {
          randomPicks = shuffle();
          root.querySelector("#tm-body").innerHTML = bodyHtml();
          return;
        }
        const open = e.target.closest("[data-action='open-one']");
        if (open) {
          const url = open.getAttribute("data-url");
          if (url) chrome.tabs.create({ url });
        }
      });
    }
  );
}

async function checkUnvisited() {
  try {
    const granted = await chrome.permissions.request({ permissions: ["history"] });
    if (!granted) {
      toast(i18n.t("permissionDenied"));
      return;
    }
    const historyItems = await chrome.history.search({ text: "", startTime: 0, maxResults: 200000 });
    const visited = new Set();
    for (const h of historyItems) {
      if (h.url) visited.add(normalizeUrl(h.url));
    }
    const ids = new Set();
    for (const b of state.items) {
      if (b.type !== "bookmark" || !b.url) continue;
      if (!visited.has(normalizeUrl(b.url))) ids.add(b.id);
    }
    state.unvisited = ids;
    state.unvisitedChecked = true;
    state.activeTab = "unvisited";
    state.limit = 100;
    renderAll();
    toast(`${i18n.t("unvisited")}: ${ids.size}`);
  } catch (e) {
    toast(String((e && e.message) || e));
  }
}

function showCleanTitlesModal() {
  const ids = [...state.selection[state.activeTab]];
  const items = state.items.filter((b) => ids.includes(b.id) && b.url);
  if (!items.length) return;
  const defaultRule = "\\s*[-|_—–]\\s*[^-|_—–/:：]{1,20}$";
  openModal(
    `<h3>${i18n.t("cleanTitles")}</h3>
     <div class="form-row"><label>${i18n.t("titleRule")}</label>
       <input id="title-rule" class="select" value="${escapeHtml(defaultRule)}">
     </div>
     <div id="title-preview" class="title-preview"></div>
     <div class="modal-actions">
       <button class="btn" data-modal="cancel">${i18n.t("cancel")}</button>
       <button class="btn primary" data-modal="ok">${i18n.t("apply")}</button>
     </div>`,
    (root, close) => {
      const ruleInput = root.querySelector("#title-rule");
      const preview = root.querySelector("#title-preview");
      const compute = () => {
        let re = null;
        try {
          re = new RegExp(ruleInput.value);
        } catch {
          re = null;
        }
        return items.map((b) => {
          const oldTitle = b.title || "";
          const next = re ? oldTitle.replace(re, "").trim() : oldTitle;
          const newTitle = next || oldTitle;
          return { id: b.id, oldTitle, newTitle, changed: !!(re && next && next !== oldTitle) };
        });
      };
      const renderPreview = () => {
        const results = compute();
        const changed = results.filter((r) => r.changed);
        const rows = results.slice(0, 20).map((r) => `
          <div class="trash-item">
            <div class="item-main">
              <div class="item-title">${escapeHtml(r.oldTitle)}</div>
              <div class="item-url">→ ${escapeHtml(r.changed ? r.newTitle : i18n.t("titleNoChange"))}</div>
            </div>
          </div>`).join("");
        preview.innerHTML = `<div class="muted small" style="margin:8px 0">${i18n.t("titlePreview")}: ${changed.length}/${results.length}</div>${rows}`;
      };
      ruleInput.addEventListener("input", renderPreview);
      renderPreview();
      root.querySelector('[data-modal="cancel"]').addEventListener("click", close);
      root.querySelector('[data-modal="ok"]').addEventListener("click", async () => {
        const results = compute().filter((r) => r.changed);
        close();
        if (!results.length) return;
        for (const r of results) {
          try {
            await chrome.bookmarks.update(r.id, { title: r.newTitle });
          } catch {
            /* skip */
          }
        }
        await logOp({
          type: "title",
          titles: results.map((r) => r.oldTitle),
          items: results.map((r) => ({ id: r.id, prevTitle: r.oldTitle, newTitle: r.newTitle }))
        });
        state.selection[state.activeTab].clear();
        await refreshData();
        renderAll();
        toast(i18n.t("updated"));
      });
    }
  );
}

async function showTrash() {
  const trash = await storage.getTrash();
  let body = `<div class="muted small">${i18n.t("emptyTrash")}</div>`;
  if (trash.length) {
    const indexed = trash.map((t, i) => ({ ...t, _i: i }));
    const byDay = groupByDay(indexed, (t) => t.deletedAt || Date.now());
    body = [...byDay.entries()].map(([day, entries]) => `
      <div class="day-group">
        <div class="day-head">${escapeHtml(day)} <span class="count">${entries.length}</span></div>
        ${entries.map((t) => `
          <div class="trash-item">
            <div class="item-main">
              <div class="item-title">
                <span class="op-tag ${t.isFolder ? "op-folder" : "op-bookmark"}">${i18n.t(t.isFolder ? "opTagFolder" : "opTagBookmark")}</span>
                ${escapeHtml(t.title || t.url || "")}
              </div>
              <div class="item-url">${new Date(t.deletedAt || Date.now()).toLocaleTimeString()} · ${escapeHtml(t.url || t.parentId || "")}</div>
            </div>
            <button class="btn small" data-restore="${t._i}">${i18n.t("restore")}</button>
          </div>`).join("")}
      </div>`).join("");
  }
  openModal(
    `<h3>${i18n.t("trash")}</h3><p class="muted small">${i18n.t("trashHint")}</p>${body}
     <div class="modal-actions">
       <button class="btn danger" data-modal="clear">${i18n.t("clearTrash")}</button>
       <button class="btn" data-modal="close">${i18n.t("close")}</button>
     </div>`,
    (root, close) => {
      root.querySelector('[data-modal="close"]').addEventListener("click", close);
      root.querySelector('[data-modal="clear"]').addEventListener("click", async () => {
        await storage.clearTrash();
        await refreshData();
        renderAll();
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

function showSharePicker() {
  const bookmarks = state.items.filter((x) => x.type === "bookmark" && x.url);
  const picked = new Set(state.selection[state.activeTab] || []);
  const fields = { title: true, url: true, path: true };
  let query = "";
  let limit = 60;

  const match = (b) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    if (fields.title && (b.title || "").toLowerCase().includes(q)) return true;
    if (fields.url && (b.url || "").toLowerCase().includes(q)) return true;
    if (fields.path && (b.path || "").toLowerCase().includes(q)) return true;
    return false;
  };

  const renderList = (root) => {
    const list = bookmarks.filter(match);
    const shown = list.slice(0, limit);
    const more = list.length > shown.length
      ? `<div class="show-more"><button class="btn" id="pick-more">${i18n.t("showMore")} (${i18n.t("remaining", { n: list.length - shown.length })})</button></div>`
      : "";
    const rows = shown.map((b) => {
      const hl = (text, on) => on && query.trim() ? text : "";
      const titleMatch = fields.title && (b.title || "").toLowerCase().includes(query.trim().toLowerCase());
      const urlMatch = fields.url && (b.url || "").toLowerCase().includes(query.trim().toLowerCase());
      const pathMatch = fields.path && (b.path || "").toLowerCase().includes(query.trim().toLowerCase());
      return `
      <div class="dup-item">
        <input type="checkbox" data-pick="${b.id}" ${picked.has(b.id) ? "checked" : ""}>
        <span class="pick-title ${titleMatch ? "hit" : ""}">${escapeHtml(b.title || b.url)}</span>
        <span class="pick-url muted small ${urlMatch ? "hit" : ""}">${escapeHtml(b.url || "")}</span>
        <span class="pick-path muted small ${pathMatch ? "hit" : ""}">${escapeHtml((b.path || "").split(" / ").slice(-1)[0] || "")}</span>
        <button class="btn small ghost" data-action="open-one" data-url="${escapeHtml(b.url)}">↗</button>
      </div>`;
    }).join("");
    const body = rows ? `<div class="dup-items">${rows}</div>${more}` : `<div class="muted small">${i18n.t("pickNone")}</div>`;
    root.querySelector("#pick-body").innerHTML = body;
    root.querySelector("#pick-count").textContent = i18n.t("pickSelected", { n: picked.size });
  };

  openModal(
    `<h3>${i18n.t("pickTitle")}</h3>
     <div class="form-row">
       <input id="pick-search" class="select" type="search" placeholder="${i18n.t("searchPlaceholder")}">
     </div>
     <div class="pick-filters">
       <label class="pick-filter pick-f-title ${fields.title ? "on" : ""}" data-field="title">📝 ${i18n.t("pickFieldTitle")}</label>
       <label class="pick-filter pick-f-url ${fields.url ? "on" : ""}" data-field="url">🔗 ${i18n.t("pickFieldUrl")}</label>
       <label class="pick-filter pick-f-path ${fields.path ? "on" : ""}" data-field="path">📁 ${i18n.t("pickFieldPath")}</label>
       <span class="spacer"></span>
       <button class="btn small" id="pick-all">${i18n.t("pickAllVisible")}</button>
       <button class="btn small ghost" id="pick-clear">${i18n.t("pickClearAll")}</button>
     </div>
     <div id="pick-body" class="pick-list"></div>
     <div class="modal-actions">
       <span class="muted small" id="pick-count" style="margin-right:auto"></span>
       <button class="btn" data-modal="cancel">${i18n.t("cancel")}</button>
       <button class="btn primary" id="pick-next">${i18n.t("confirm")}</button>
     </div>`,
    (root, close) => {
      renderList(root);
      const search = root.querySelector("#pick-search");
      search.focus();
      search.addEventListener("input", (e) => {
        query = e.target.value;
        limit = 60;
        renderList(root);
      });
      root.querySelector(".pick-filters").addEventListener("click", (e) => {
        const f = e.target.closest("[data-field]");
        if (!f) return;
        const key = f.getAttribute("data-field");
        const active = Object.values(fields).filter(Boolean).length;
        if (fields[key] && active === 1) return;
        fields[key] = !fields[key];
        f.classList.toggle("on", fields[key]);
        renderList(root);
      });
      root.querySelector("#pick-all").addEventListener("click", () => {
        const list = bookmarks.filter(match).slice(0, limit);
        list.forEach((b) => picked.add(b.id));
        renderList(root);
      });
      root.querySelector("#pick-clear").addEventListener("click", () => {
        picked.clear();
        renderList(root);
      });
      root.querySelector("#pick-body").addEventListener("change", (e) => {
        const cb = e.target.closest("[data-pick]");
        if (!cb) return;
        const id = cb.getAttribute("data-pick");
        if (cb.checked) picked.add(id); else picked.delete(id);
        root.querySelector("#pick-count").textContent = i18n.t("pickSelected", { n: picked.size });
      });
      root.querySelector("#pick-body").addEventListener("click", (e) => {
        if (e.target.closest("#pick-more")) {
          limit += 100;
          renderList(root);
          return;
        }
        const open = e.target.closest("[data-action='open-one']");
        if (open) {
          const url = open.getAttribute("data-url");
          if (url) chrome.tabs.create({ url });
        }
      });
      root.querySelector('[data-modal="cancel"]').addEventListener("click", close);
      root.querySelector("#pick-next").addEventListener("click", () => {
        if (!picked.size) {
          toast(i18n.t("pickNeed"));
          return;
        }
        const items = bookmarks.filter((b) => picked.has(b.id));
        close();
        showShareTitleModal(items);
      });
    }
  );
}

function showShareTitleModal(items) {
  const domains = new Set();
  for (const b of items) {
    try {
      domains.add(new URL(b.url).hostname.replace(/^www\./, ""));
    } catch {
      /* skip */
    }
  }
  const defaultTitle = domains.size === 1
    ? i18n.t("shareTitleDomain", { domain: [...domains][0] })
    : i18n.t("shareTitleDefault");
  const themeNames = {
    gradient: i18n.t("themeGradient"),
    minimal: i18n.t("themeMinimal"),
    paper: i18n.t("themePaper"),
    dark: i18n.t("themeDark")
  };
  let selectedTheme = "gradient";
  openModal(
    `<h3>${i18n.t("exportShare")}</h3>
     <div class="form-row">
       <label>${i18n.t("shareTitleLabel")}</label>
       <input id="share-title" class="select" value="${escapeHtml(defaultTitle)}">
     </div>
     <div class="form-row" style="align-items:flex-start">
       <label>${i18n.t("themeLabel")}</label>
       <div class="theme-picker" id="share-theme">
         ${Object.keys(themeNames).map((t) => `
           <button class="theme-opt ${t === selectedTheme ? "active" : ""}" data-theme="${t}" title="${themeNames[t]}">
             <span class="theme-thumb thumb-${t}"><span class="thumb-dot"></span><span class="thumb-card"></span></span>
             <span class="theme-name">${themeNames[t]}</span>
           </button>`).join("")}
       </div>
     </div>
     <div class="modal-actions">
       <button class="btn" data-modal="cancel">${i18n.t("cancel")}</button>
       <button class="btn" id="share-poster">${i18n.t("exportPoster")}</button>
       <button class="btn primary" id="share-html">${i18n.t("exportHtml")}</button>
     </div>`,
    (root, close) => {
      const input = root.querySelector("#share-title");
      input.focus();
      input.select();
      root.querySelector("#share-theme").addEventListener("click", (e) => {
        const opt = e.target.closest("[data-theme]");
        if (!opt) return;
        selectedTheme = opt.getAttribute("data-theme");
        root.querySelectorAll(".theme-opt").forEach((el) => {
          el.classList.toggle("active", el.getAttribute("data-theme") === selectedTheme);
        });
      });
      root.querySelector('[data-modal="cancel"]').addEventListener("click", close);
      root.querySelector("#share-html").addEventListener("click", () => {
        const title = (input.value || "").trim() || defaultTitle;
        close();
        exportSharePage(items, title, stamp(), selectedTheme);
        toast(i18n.t("exportDone"));
      });
      root.querySelector("#share-poster").addEventListener("click", () => {
        const title = (input.value || "").trim() || defaultTitle;
        close();
        exportShareImage(items, title, stamp());
        toast(i18n.t("exportDone"));
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
  showShareTitleModal(items);
}

function bindEvents() {
  $("#tabs").addEventListener("click", (e) => {
    const tab = e.target.closest(".tab");
    if (!tab) return;
    state.activeTab = tab.getAttribute("data-tab");
    state.limit = 100;
    renderAll();
  });

  $("#search-input").addEventListener("input", (e) => {
    state.search = e.target.value;
    state.limit = 100;
    renderPanel();
  });

  $("#sort-select").addEventListener("change", (e) => {
    state.sort = e.target.value;
    renderPanel();
  });

  $("#date-select").addEventListener("change", (e) => {
    state.dateRange = e.target.value;
    state.limit = 100;
    renderPanel();
  });

  $("#panel").addEventListener("change", (e) => {
    const monthSel = e.target.closest("#portrait-month");
    if (monthSel) {
      state.portraitMonth = monthSel.value;
      state.portraitLimit = 50;
      renderPanel();
      return;
    }
    const cb = e.target.closest("[data-check]");
    if (cb) {
      const id = cb.getAttribute("data-check");
      const sel = state.selection[state.activeTab];
      if (cb.checked) sel.add(id); else sel.delete(id);
      renderPanel();
      renderSelectionBar();
      return;
    }
    const all = e.target.closest("#select-all");
    if (all) {
      const sel = state.selection[state.activeTab];
      sel.clear();
      if (all.checked) {
        visibleItems(currentTabItems()).forEach((x) => sel.add(x.id));
      }
      renderPanel();
      renderSelectionBar();
    }
  });

  $("#panel").addEventListener("click", async (e) => {
    const yearBtn = e.target.closest("[data-year]");
    if (yearBtn) {
      state.portraitYear = yearBtn.getAttribute("data-year");
      state.portraitMonth = "all";
      state.portraitLimit = 50;
      renderPanel();
      return;
    }
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    await handleAction(btn.getAttribute("data-action"), btn.getAttribute("data-id"), btn);
  });

  $("#selection-bar").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    await handleAction(btn.getAttribute("data-action"), btn.getAttribute("data-id"), btn);
  });

  async function handleAction(action, id, btn) {
    if (action === "show-more") {
      state.limit += 100;
      renderPanel();
      return;
    }
    if (action === "portrait-more") {
      state.portraitLimit += 50;
      renderPanel();
      return;
    }
    if (action === "clear-selection") {
      state.selection[state.activeTab].clear();
      renderAll();
      return;
    }
    if (action === "clean-titles") return showCleanTitlesModal();
    if (action === "delete-one") {
      const b = state.items.find((x) => x.id === id);
      const { trashEntries } = await bm.removeWithSnapshot([id]);
      if (trashEntries.length) await storage.addToTrash(trashEntries);
      await logOp({ type: "delete", titles: [b ? b.title || b.url : id] });
      state.selection[state.activeTab].delete(id);
      await refreshData();
      renderAll();
      toast(i18n.t("deleteDone", { n: trashEntries.length }));
      return;
    }
    if (action === "mark-ok") {
      const st = await storage.getScanState();
      if (st && st.results && st.results[id]) {
        const prev = st.results[id];
        st.results[id] = { ...prev, status: STATUS.OK, note: "manual_confirmed", checkedAt: Date.now() };
        await storage.setScanState(st);
        state.scan = st;
        const b = state.items.find((x) => x.id === id);
        await logOp({ type: "mark-ok", id, titles: [b ? b.title || b.url : id], prevStatus: prev.status, prevNote: prev.note || null });
      }
      renderAll();
      toast(i18n.t("updated"));
      return;
    }
    if (action === "archive-one" || action === "archive-selected") {
      const ids = action === "archive-one" ? [id] : [...state.selection[state.activeTab]];
      if (!ids.length) return;
      const name = state.activeTab === "dead" ? i18n.t("defaultArchiveFolder") : i18n.t("unverifiableArchiveFolder");
      const existing = state.items.find((x) => x.type === "folder" && x.title === name && x.parentId === "1");
      const folderId = existing ? existing.id : (await bm.createFolder("1", name)).id;
      const snapshot = ids.map((bid) => {
        const b = state.items.find((x) => x.id === bid) || {};
        return { id: bid, title: b.title || b.url || bid, parentId: b.parentId || null };
      });
      const moved = await bm.moveBookmarks(ids, folderId);
      await storage.addArchivedIds(ids);
      await logOp({ type: "archive", titles: snapshot.map((x) => x.title), items: snapshot });
      state.selection[state.activeTab].clear();
      await refreshData();
      renderAll();
      toast(`${i18n.t("moveDone", { n: moved })} · ${i18n.t("archivedHint")}`);
      return;
    }
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
        const b = state.items.find((x) => x.id === id);
        const prevUrl = b ? b.url : null;
        await bm.updateBookmarkUrl(id, url);
        await logOp({ type: "url", id, titles: [b ? b.title || b.url : id], prevUrl });
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
    if (action === "browser-verify") {
      const b = state.items.find((x) => x.id === id);
      if (!b) return;
      btn.disabled = true;
      btn.textContent = "...";
      const resp = await chrome.runtime.sendMessage({ type: "browser:verify", url: b.url });
      const st = await storage.getScanState();
      if (st && st.results && st.results[id]) {
        const prev = st.results[id];
        if (resp && resp.status) {
          st.results[id] = {
            ...prev,
            status: resp.status,
            code: resp.code || prev.code,
            finalUrl: resp.finalUrl || prev.finalUrl,
            movedTo: resp.movedTo || prev.movedTo,
            note: resp.note || "browser_verified",
            checkedAt: Date.now()
          };
        } else {
          st.results[id] = { ...prev, note: "browser_unverified", checkedAt: Date.now() };
        }
        await storage.setScanState(st);
        state.scan = st;
      }
      renderAll();
      toast(resp && resp.status === STATUS.OK ? i18n.t("browserVerified") : i18n.t("browserFailed"));
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
  }

  $("#btn-scan").addEventListener("click", async () => {
    const s = state.scan;
    if (s && s.status === "scanning") {
      await chrome.runtime.sendMessage({ type: "scan:stop" });
      return;
    }
    const granted = await permissions.ensureScanPermissions();
    if (!granted) {
      toast(i18n.t("permissionDenied"));
      return;
    }
    await chrome.runtime.sendMessage({ type: "scan:start", mode: "incremental" });
    setTimeout(async () => {
      state.scan = await storage.getScanState();
      renderScanStatus();
    }, 300);
  });

  $("#btn-rescan-full").addEventListener("click", async () => {
    const ok = await confirmModal(i18n.t("tipRescanFull"));
    if (!ok) return;
    const granted = await permissions.ensureScanPermissions();
    if (!granted) {
      toast(i18n.t("permissionDenied"));
      return;
    }
    await chrome.runtime.sendMessage({ type: "scan:start", mode: "full" });
    setTimeout(async () => {
      state.scan = await storage.getScanState();
      renderScanStatus();
    }, 300);
  });

  $("#btn-import").addEventListener("click", () => $("#import-file").click());

  $("#import-file").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    showImportModal(file);
  });

  $("#btn-backup").addEventListener("click", () => showExportModal());
  $("#btn-report").addEventListener("click", () => {
    exportReportCsv(state.items, state.scan ? state.scan.results : {}, stamp());
    toast(i18n.t("exportDone"));
  });
  $("#btn-share").addEventListener("click", showSharePicker);
  $("#btn-history").addEventListener("click", showHistory);
  $("#btn-timemachine").addEventListener("click", showTimeMachine);
  $("#btn-unvisited").addEventListener("click", checkUnvisited);
  $("#btn-settings").addEventListener("click", showSettings);
  $("#excluded-hint").addEventListener("click", (e) => {
    if (e.target.closest("#open-settings")) {
      e.preventDefault();
      showSettings();
    }
  });
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
  try {
    const w = await chrome.windows.getCurrent();
    state.windowId = w.id;
  } catch {
    /* side panel fallback uses getCurrent */
  }
  $("#lang-select").value = i18n.getLang();
  applyI18n();
  await refreshData();
  renderAll();
  bindEvents();
}

init();
