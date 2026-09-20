import { hostOf, displayHost } from "./url.js";
import { STATUS } from "./linkcheck.js";

export function buildPortrait(bookmarks, scanResults, duplicates) {
  const bms = bookmarks.filter((b) => b.type === "bookmark" && b.url);
  const folders = bookmarks.filter((b) => b.type === "folder");
  const domains = new Map();
  for (const b of bms) {
    const h = displayHost(b.url) || "(invalid)";
    domains.set(h, (domains.get(h) || 0) + 1);
  }
  const topDomains = [...domains.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([domain, count]) => ({ domain, count }));

  const monthly = new Map();
  let oldest = null;
  let newest = null;
  for (const b of bms) {
    if (!b.dateAdded) continue;
    const d = new Date(b.dateAdded);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthly.set(key, (monthly.get(key) || 0) + 1);
    if (!oldest || b.dateAdded < oldest.dateAdded) oldest = b;
    if (!newest || b.dateAdded > newest.dateAdded) newest = b;
  }
  const months = [...monthly.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const recentMonths = months.slice(-12);

  const results = scanResults ? Object.values(scanResults) : [];
  const checked = results.filter((r) => r.status && r.status !== STATUS.SKIPPED);
  const deadCount = checked.filter((r) => r.status === STATUS.DEAD).length;
  const movedCount = checked.filter((r) => r.status === STATUS.MOVED).length;
  const blockedCount = checked.filter((r) => r.status === STATUS.BLOCKED).length;

  return {
    totalBookmarks: bms.length,
    totalFolders: folders.length,
    topDomains,
    monthly: recentMonths,
    oldest,
    newest,
    checkedCount: checked.length,
    deadCount,
    movedCount,
    blockedCount,
    deadRatio: checked.length ? deadCount / checked.length : 0,
    duplicateCount: duplicates ? duplicates.reduce((n, g) => n + (g.items.length - 1), 0) : 0
  };
}
