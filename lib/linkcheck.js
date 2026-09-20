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

const AUTH_HOST_PATTERNS = [
  /(^|\.)login\./i,
  /(^|\.)signin\./i,
  /(^|\.)sign-in\./i,
  /(^|\.)sso\./i,
  /(^|\.)idp\./i,
  /(^|\.)auth\./i,
  /(^|\.)accounts?\./i,
  /(^|\.)adfs\./i,
  /(^|\.)okta\.com$/i,
  /(^|\.)auth0\.com$/i,
  /login\.microsoftonline\.com$/i,
  /login\.live\.com$/i,
  /accounts\.google\.com$/i
];

const AUTH_PATH_PATTERNS = [
  /\/(login|log-in|signin|sign-in|signon|sign-on)(\/|$|\?)/i,
  /\/(auth|sso|adfs|oauth|saml|session|cas)(\/|$|\?)/i,
  /\/(account|user|users)\/(login|signin|sign-in)/i
];

export function looksLikeAuth(url) {
  try {
    const u = new URL(url);
    if (AUTH_HOST_PATTERNS.some((p) => p.test(u.hostname))) return true;
    if (AUTH_PATH_PATTERNS.some((p) => p.test(u.pathname))) return true;
    return false;
  } catch {
    return false;
  }
}

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
    return { status: STATUS.TIMEOUT, checkedAt: Date.now(), note: "timeout" };
  }
  return { status: STATUS.DEAD, checkedAt: Date.now(), note: "network" };
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
      credentials: "include",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8"
      }
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
  const crossSite = finalUrl && hostOf(finalUrl) && !sameSite(finalUrl, originalUrl);
  if (code >= 200 && code < 300) {
    if (crossSite) {
      if (looksLikeAuth(finalUrl)) return { ...base, status: STATUS.BLOCKED, note: "login_required" };
      return { ...base, status: STATUS.MOVED, movedTo: finalUrl };
    }
    return { ...base, status: STATUS.OK };
  }
  if (code === 404 || code === 410) return { ...base, status: STATUS.DEAD, note: "not_found" };
  if (code === 502 || code === 504) return { ...base, status: STATUS.DEAD, note: "gateway_error" };
  if (code >= 500) return { ...base, status: STATUS.SERVER_ERROR, note: "server_error" };
  if (code === 401) return { ...base, status: STATUS.BLOCKED, note: "auth" };
  if (code === 403) return { ...base, status: STATUS.BLOCKED, note: "forbidden" };
  if (code === 405 || code === 406) return { ...base, status: STATUS.BLOCKED, note: "method" };
  if (code === 429) return { ...base, status: STATUS.BLOCKED, note: "rate_limited" };
  if (code === 451) return { ...base, status: STATUS.BLOCKED, note: "legal" };
  if (code >= 300 && code < 400) {
    if (crossSite) {
      if (looksLikeAuth(finalUrl)) return { ...base, status: STATUS.BLOCKED, note: "login_required" };
      return { ...base, status: STATUS.MOVED, movedTo: finalUrl };
    }
    return { ...base, status: STATUS.BLOCKED, note: "redirect" };
  }
  return { ...base, status: STATUS.UNKNOWN, note: "unknown" };
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
