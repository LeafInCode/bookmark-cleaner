import { hostOf, displayHost } from "./url.js";
import { STATUS } from "./linkcheck.js";

export function buildPortrait(bookmarks, scanResults, duplicates) {
  const bms = bookmarks.filter((b) => b.type === "bookmark" && b.url);
  const folders = bookmarks.filter((b) => b.type === "folder");
  const domainMap = new Map();
  for (const b of bms) {
    const h = displayHost(b.url) || "(invalid)";
    if (!domainMap.has(h)) domainMap.set(h, { count: 0, years: new Map() });
    const rec = domainMap.get(h);
    rec.count += 1;
    if (b.dateAdded) {
      const y = String(new Date(b.dateAdded).getFullYear());
      rec.years.set(y, (rec.years.get(y) || 0) + 1);
    }
  }
  const topDomains = [...domainMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([domain, rec]) => ({
      domain,
      count: rec.count,
      years: [...rec.years.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    }));

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
  const recentMonths = months.slice(-24);
  const yearly = new Map();
  for (const [key, count] of months) {
    const y = key.slice(0, 4);
    yearly.set(y, (yearly.get(y) || 0) + count);
  }
  const yearCounts = [...yearly.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const mostActive = months.length
    ? months.reduce((best, cur) => (cur[1] > best[1] ? cur : best), months[0])
    : null;
  const spanDays = oldest && newest ? Math.max(1, Math.round((newest.dateAdded - oldest.dateAdded) / 86400000)) : 0;
  const spanMonths = oldest && newest
    ? Math.max(1, (newest.dateAdded - oldest.dateAdded) / (30.44 * 86400000))
    : 0;
  const avgPerMonth = spanMonths ? Math.round((bms.length / spanMonths) * 10) / 10 : 0;

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
    allMonths: months,
    yearCounts,
    mostActive,
    spanDays,
    avgPerMonth,
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
