const TRACKING_PATTERNS = [
  /^utm_/i, /^fbclid$/i, /^gclid$/i, /^dclid$/i, /^msclkid$/i, /^igshid$/i,
  /^mc_cid$/i, /^mc_eid$/i, /^spm$/i, /^scm$/i, /^ref_src$/i, /^ref$/i,
  /^yclid$/i, /^_openstat$/i, /^vero_id$/i, /^wickedid$/i, /^oly_anon_id$/i,
  /^oly_enc_id$/i, /^__s$/i, /^rb_clickid$/i, /^s_cid$/i
];

export function isHttpUrl(raw) {
  return typeof raw === "string" && /^https?:\/\//i.test(raw);
}

export function parseUrl(raw) {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

export function hostOf(raw) {
  const u = parseUrl(raw);
  return u ? u.hostname.toLowerCase() : "";
}

export function registrableDomain(host) {
  if (!host) return "";
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  return parts.slice(-2).join(".");
}

export function sameSite(a, b) {
  const ha = registrableDomain(hostOf(a).replace(/^www\./, ""));
  const hb = registrableDomain(hostOf(b).replace(/^www\./, ""));
  return ha !== "" && ha === hb;
}

export function normalizeUrl(raw) {
  const u = parseUrl(raw);
  if (!u) return (raw || "").trim();
  const proto = u.protocol.toLowerCase();
  let host = u.hostname.toLowerCase();
  if (host.startsWith("www.")) host = host.slice(4);
  let port = u.port;
  if ((proto === "http:" && port === "80") || (proto === "https:" && port === "443")) port = "";
  const params = [];
  for (const [k, v] of u.searchParams.entries()) {
    if (TRACKING_PATTERNS.some((p) => p.test(k))) continue;
    params.push([k, v]);
  }
  params.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  const query = params.map(([k, v]) => `${k}=${v}`).join("&");
  let path = u.pathname || "/";
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  const auth = u.username ? `${u.username}${u.password ? ":" + u.password : ""}@` : "";
  return `${proto}//${auth}${host}${port ? ":" + port : ""}${path}${query ? "?" + query : ""}`;
}

export function displayHost(raw) {
  const h = hostOf(raw);
  return h.startsWith("www.") ? h.slice(4) : h;
}
