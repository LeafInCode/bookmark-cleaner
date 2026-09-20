import * as i18n from "./lib/i18n.js";
import * as storage from "./lib/storage.js";

const $ = (sel) => document.querySelector(sel);

async function render() {
  await i18n.initLang();
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = i18n.t(el.getAttribute("data-i18n"));
  });
  const { scanState } = await chrome.storage.local.get({ scanState: null });
  const stats = $("#stats");
  const tree = await chrome.bookmarks.getTree();
  let total = 0;
  const walk = (nodes) => {
    for (const n of nodes) {
      if (n.url) total += 1;
      if (n.children) walk(n.children);
    }
  };
  walk(tree);
  const results = scanState && scanState.results ? Object.values(scanState.results) : [];
  const dead = results.filter((r) => r.status === "dead" || r.status === "timeout").length;
  const moved = results.filter((r) => r.status === "moved").length;
  stats.innerHTML = `
    <div class="popup-stat"><div class="num">${total}</div><div class="label">${i18n.t("totalBookmarks")}</div></div>
    <div class="popup-stat"><div class="num">${dead}</div><div class="label">${i18n.t("deadLinks")}</div></div>
    <div class="popup-stat"><div class="num">${moved}</div><div class="label">${i18n.t("movedLinks")}</div></div>`;
  const status = $("#btn-scan");
  if (scanState && scanState.status === "scanning") {
    status.textContent = `${i18n.t("scanning")} ${scanState.processed}/${scanState.total}`;
  } else {
    status.textContent = i18n.t("quickScan");
  }
}

$("#btn-scan").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "scan:start" });
  await render();
});

$("#btn-dashboard").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.scanState) render();
});

render();
