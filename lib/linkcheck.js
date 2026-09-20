import { isHttpUrl, hostOf, sameSite } from "./url.js";

export const STATUS = {
  OK: "ok",
  DEAD: "dead",
  BLOCKED: "blocked",
  MOVED: "moved",
  SERVER_ERROR: "server_error",
  TIMEOUT: "timeout",
  SKIPPED: "skipped",
  UNKNOWN: "unknown"
};

export async function checkUrl(url, timeoutMs) {
  if (!isHttpUrl(url)) {
    return { status: STATUS.SKIPPED, checkedAt: Date.now() };
  }
  const head = await tryFetch(url, timeoutMs, "HEAD");
  if (head.kind === "response" && head.response.ok) {
    return classify(head.response, url);
  }
  const get = await tryFetch(url, timeoutMs, "GET");
  if (get.kind === "response") {
    return classify(get.response, url);
  }
  if (get.kind === "timeout") {
    return { status: STATUS.TIMEOUT, checkedAt: Date.now() };
  }
  return { status: STATUS.DEAD, checkedAt: Date.now(), note: get.error || "network" };
}

async function tryFetch(url, timeoutMs, method) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      redirect: "follow",
      signal: controller.signal,
      cache: "no-store",
      credentials: "omit"
    });
    if (response.body) {
      try {
        await response.body.cancel();
      } catch {
        /* ignore */
      }
    }
    return { kind: "response", response };
  } catch (e) {
    if (e && (e.name === "AbortError" || /aborted/i.test(String(e.message || "")))) {
      return { kind: "timeout" };
    }
    return { kind: "error", error: String((e && e.message) || e) };
  } finally {
    clearTimeout(timer);
  }
}

function classify(response, originalUrl) {
  const code = response.status;
  const finalUrl = response.url || originalUrl;
  const base = { code, finalUrl, checkedAt: Date.now() };
  if (code >= 200 && code < 300) {
    if (finalUrl && hostOf(finalUrl) && !sameSite(finalUrl, originalUrl)) {
      return { ...base, status: STATUS.MOVED, movedTo: finalUrl };
    }
    return { ...base, status: STATUS.OK };
  }
  if (code === 404 || code === 410) return { ...base, status: STATUS.DEAD };
  if (code >= 500) return { ...base, status: STATUS.SERVER_ERROR };
  if ([401, 403, 405, 406, 429, 451].includes(code)) return { ...base, status: STATUS.BLOCKED };
  if (code >= 300 && code < 400) {
    if (finalUrl && hostOf(finalUrl) && !sameSite(finalUrl, originalUrl)) {
      return { ...base, status: STATUS.MOVED, movedTo: finalUrl };
    }
    return { ...base, status: STATUS.BLOCKED };
  }
  return { ...base, status: STATUS.UNKNOWN };
}

export async function checkWayback(url, timeoutMs) {
  if (!isHttpUrl(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const api = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`;
    const resp = await fetch(api, { signal: controller.signal, cache: "no-store" });
    if (!resp.ok) return null;
    const data = await resp.json();
    const snap = data && data.archived_snapshots && data.archived_snapshots.closest;
    if (!snap || !snap.available || !snap.url) return null;
    const normalized = String(snap.url).replace(/^http:\/\//i, "https://");
    return { url: normalized, timestamp: snap.timestamp || "" };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
