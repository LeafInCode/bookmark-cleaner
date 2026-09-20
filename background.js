import { getTree, flattenTree, httpBookmarks } from "./lib/bookmarks.js";
import { checkUrl, checkWayback, looksLikeAuth, STATUS } from "./lib/linkcheck.js";
import { getScanState, patchScanState, getSettings } from "./lib/storage.js";
import { hostOf, sameSite } from "./lib/url.js";

let scanning = false;
let stopRequested = false;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg && msg.type) {
        case "scan:start":
          startScan();
          sendResponse({ ok: true, started: true });
          break;
        case "scan:stop":
          stopRequested = true;
          sendResponse({ ok: true });
          break;
        case "scan:state": {
          const state = await getScanState();
          sendResponse({ ok: true, state });
          break;
        }
        case "wayback:check": {
          const settings = await getSettings();
          const snap = await checkWayback(msg.url, settings.timeoutMs + 4000);
          sendResponse({ ok: true, snapshot: snap });
          break;
        }
        case "url:check-one": {
          const settings = await getSettings();
          const result = await checkUrl(msg.url, settings.timeoutMs);
          sendResponse({ ok: true, result });
          break;
        }
        case "browser:verify": {
          const res = await verifyInBrowser(msg.url);
          sendResponse({ ok: true, ...res });
          break;
        }
        default:
          sendResponse({ ok: false, error: "unknown message" });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String((e && e.message) || e) });
    }
  })();
  return true;
});

async function startScan() {
  if (scanning) return;
  scanning = true;
  stopRequested = false;
  const settings = await getSettings();
  const startedAt = Date.now();

  const tree = await getTree();
  const items = flattenTree(tree);
  const targets = httpBookmarks(items);
  const results = {};
  const total = targets.length;

  await patchScanState({
    status: "scanning",
    startedAt,
    updatedAt: Date.now(),
    total,
    processed: 0,
    results,
    summary: null,
    error: null
  });

  chrome.alarms.create("scan-keepalive", { periodInMinutes: 0.5 });

  let processed = 0;
  let cursor = 0;
  const concurrency = Math.max(1, Math.min(16, settings.concurrency || 8));

  async function worker() {
    while (!stopRequested) {
      const idx = cursor;
      cursor += 1;
      if (idx >= targets.length) return;
      const b = targets[idx];
      const result = await checkUrl(b.url, settings.timeoutMs);
      results[b.id] = { ...result, url: b.url, title: b.title };
      processed += 1;
      if (processed % 50 === 0 || processed === total) {
        await patchScanState({ processed, results, updatedAt: Date.now() });
      }
    }
  }

  try {
    const workers = [];
    for (let i = 0; i < concurrency; i += 1) {
      workers.push(worker());
    }
    await Promise.all(workers);
    await patchScanState({
      status: "done",
      finishedAt: Date.now(),
      updatedAt: Date.now(),
      processed,
      total,
      results
    });
  } catch (e) {
    await patchScanState({
      status: "error",
      updatedAt: Date.now(),
      error: String((e && e.message) || e)
    });
  } finally {
    scanning = false;
    chrome.alarms.clear("scan-keepalive");
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "scan-keepalive") return;
  const state = await getScanState();
  if (state && state.status === "scanning" && !scanning) {
    await patchScanState({
      status: "interrupted",
      updatedAt: Date.now(),
      note: "service worker restarted"
    });
  }
});

const FATAL_ERRORS = [
  "NAME_NOT_RESOLVED",
  "NAME_RESOLUTION_FAILED",
  "CONNECTION_REFUSED",
  "CONNECTION_FAILED",
  "CONNECTION_RESET",
  "ADDRESS_UNREACHABLE",
  "INTERNET_DISCONNECTED"
];

const hasWebRequest = typeof chrome.webRequest !== "undefined" && !!chrome.webRequest.onCompleted;
const hasWebNavigation = typeof chrome.webNavigation !== "undefined" && !!chrome.webNavigation.onErrorOccurred;

function verifyInBrowser(url) {
  if (!hasWebRequest || !hasWebNavigation) {
    return Promise.resolve({ status: STATUS.BLOCKED, error: "permission", note: "browser_unverified" });
  }
  return new Promise((resolve) => {
    let done = false;
    let tabId = null;
    const cleanup = () => {
      chrome.webRequest.onCompleted.removeListener(onWebCompleted);
      chrome.webNavigation.onErrorOccurred.removeListener(onError);
      clearTimeout(timer);
      if (tabId !== null) {
        chrome.tabs.remove(tabId).catch(() => {});
      }
    };
    const finish = (result) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(result);
    };
    const onWebCompleted = (d) => {
      if (d.tabId !== tabId || d.frameId !== 0 || d.type !== "main_frame") return;
      const code = d.statusCode;
      const finalUrl = d.url || url;
      const crossSite = hostOf(finalUrl) && !sameSite(finalUrl, url);
      if (code >= 200 && code < 300) {
        if (crossSite && !looksLikeAuth(finalUrl)) {
          finish({ status: STATUS.MOVED, code, finalUrl, movedTo: finalUrl, note: "browser_verified" });
        } else {
          finish({ status: STATUS.OK, code, finalUrl, note: "browser_verified" });
        }
      } else if (code === 404 || code === 410) {
        finish({ status: STATUS.DEAD, code, finalUrl, note: "browser_not_found" });
      } else if (code >= 500) {
        finish({ status: STATUS.SERVER_ERROR, code, finalUrl, note: "browser_server_error" });
      } else {
        finish({ status: STATUS.BLOCKED, code, finalUrl, note: "browser_blocked" });
      }
    };
    const onError = (d) => {
      if (d.tabId !== tabId || d.frameId !== 0) return;
      const fatal = FATAL_ERRORS.some((x) => String(d.error || "").includes(x));
      finish({
        status: fatal ? STATUS.DEAD : STATUS.BLOCKED,
        error: d.error || "unknown",
        note: fatal ? "browser_error" : "browser_unverified"
      });
    };
    chrome.webRequest.onCompleted.addListener(onWebCompleted, {
      urls: ["<all_urls>"],
      types: ["main_frame"]
    });
    chrome.webNavigation.onErrorOccurred.addListener(onError);
    const timer = setTimeout(
      () => finish({ status: STATUS.BLOCKED, error: "timeout", note: "browser_unverified" }),
      25000
    );
    chrome.tabs.create({ url, active: false }, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        finish({ status: STATUS.BLOCKED, error: "tab-create-failed", note: "browser_unverified" });
        return;
      }
      tabId = tab.id;
    });
  });
}

export { STATUS };
