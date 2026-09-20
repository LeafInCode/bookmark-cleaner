import * as i18n from "./lib/i18n.js";
import { getTree, flattenTree } from "./lib/bookmarks.js";

const $ = (sel) => document.querySelector(sel);

let bookmarks = [];
let randomPicks = [];
let activeTm = "day";

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function load() {
  const tree = await getTree();
  bookmarks = flattenTree(tree).filter((x) => x.type === "bookmark" && x.url && x.dateAdded);
}

function shuffle() {
  return [...bookmarks].sort(() => Math.random() - 0.5).slice(0, 8);
}

function onThisDay() {
  const now = new Date();
  const md = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return bookmarks
    .filter((b) => {
      const d = new Date(b.dateAdded);
      const key = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return key === md && d.getFullYear() < now.getFullYear();
    })
    .sort((a, b) => b.dateAdded - a.dateAdded);
}

function card(b, kind) {
  const now = new Date();
  const d = new Date(b.dateAdded);
  const badge = kind === "day" ? i18n.t("yearsAgo", { n: now.getFullYear() - d.getFullYear() }) : d.getFullYear();
  return `
    <div class="tm-card tm-${kind}">
      <span class="tm-year">${badge}</span>
      <div class="item-main">
        <div class="item-title">${escapeHtml(b.title || b.url)}</div>
        <div class="item-url">${escapeHtml(b.url)}</div>
      </div>
      <button class="btn small ghost" data-url="${escapeHtml(b.url)}">↗</button>
    </div>`;
}

function render() {
  const day = onThisDay();
  $("#tm-tabs").innerHTML = `
    <button class="tm-tab ${activeTm === "day" ? "active" : ""}" data-tm="day">🕰 ${i18n.t("onThisDay")} (${day.length})</button>
    <button class="tm-tab ${activeTm === "random" ? "active" : ""}" data-tm="random">🎲 ${i18n.t("randomPicks")}</button>`;
  if (activeTm === "day") {
    $("#tm-body").innerHTML = day.length
      ? day.slice(0, 30).map((b) => card(b, "day")).join("")
      : `<div class="muted small">${i18n.t("noOnThisDay")}</div>`;
  } else {
    $("#tm-body").innerHTML = `<div class="tm-shuffle-row"><button class="btn small" id="tm-shuffle">🎲 ${i18n.t("refresh")}</button></div>`
      + randomPicks.map((b) => card(b, "random")).join("");
  }
}

document.addEventListener("click", (e) => {
  const tab = e.target.closest("[data-tm]");
  if (tab) {
    activeTm = tab.getAttribute("data-tm");
    render();
    return;
  }
  if (e.target.closest("#tm-shuffle")) {
    randomPicks = shuffle();
    render();
    return;
  }
  const open = e.target.closest("[data-url]");
  if (open) {
    const url = open.getAttribute("data-url");
    if (url) chrome.tabs.create({ url });
  }
});

async function init() {
  await i18n.initLang();
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = i18n.t(el.getAttribute("data-i18n"));
  });
  document.documentElement.lang = i18n.getLang() === "zh" ? "zh-CN" : "en";
  await load();
  randomPicks = shuffle();
  render();
}

init();
