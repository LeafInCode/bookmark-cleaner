import { getTree, flattenTree, httpBookmarks } from "./lib/bookmarks.js";
import { checkUrl, checkWayback, STATUS } from "./lib/linkcheck.js";
import { getScanState, patchScanState, getSettings } from "./lib/storage.js";

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

export { STATUS };
