#!/usr/bin/env node
// 压测：10k 书签的本地计算性能（去重/空文件夹/统计画像核心路径）
// 网络检查（linkcheck）不在本测——它有并发节流，瓶颈在带宽不在算法。
// 用法: node scripts/stress_test.js [N]  (默认 10000)
import { flattenTree, findDuplicates, findEmptyFolders, httpBookmarks } from "../lib/bookmarks.js";
import { normalizeUrl } from "../lib/url.js";

const N = parseInt(process.argv[2] || "10000", 10);

// 合成书签树：deep folders + duplicates + empties + noise
const domains = ["github.com", "news.ycombinator.com", "stackoverflow.com", "en.wikipedia.org",
  "reddit.com", "youtube.com", "medium.com", "docs.python.org", "mozilla.org", "example.com"];
const tree = { id: "0", title: "", children: [] };
let id = 1;
const folderCount = Math.floor(N / 40);
for (let f = 0; f < folderCount; f++) {
  const folder = { id: String(id++), title: `Folder ${f}`, children: [], parent: "0" };
  for (let i = 0; i < 38; i++) {
    const d = domains[id % domains.length];
    const u = `https://${d}/page/${id}?utm_source=x&id=${id}`;
    folder.children.push({ id: String(id++), title: `Page ${id}`, url: u, parent: folder.id });
  }
  if (f % 10 === 0) folder.children.push({ id: String(id++), title: "Empty", children: [], parent: folder.id });
  // 每 5 个文件夹放一个重复（同 normalizeUrl）
  if (f % 5 === 0) {
    const orig = folder.children[0];
    folder.children.push({ id: String(id++), title: orig.title + " copy", url: orig.url + "&fbclid=tracking", parent: folder.id });
  }
  tree.children.push(folder);
}

const t0 = performance.now();
const flat = flattenTree([tree]);
const t1 = performance.now();
const http = httpBookmarks(flat);
const dups = findDuplicates(http);
const t2 = performance.now();
const empties = findEmptyFolders(flat);
const t3 = performance.now();
// normalizeUrl 全量（画像/去重路径）
for (const b of http) normalizeUrl(b.url);
const t4 = performance.now();

console.log(`书签总数: ${flat.filter(x => x.url).length} (目标 ${N})`);
console.log(`flattenTree:        ${(t1 - t0).toFixed(1)} ms`);
console.log(`findDuplicates:     ${(t2 - t1).toFixed(1)} ms  (找到 ${dups.length} 组重复)`);
console.log(`findEmptyFolders:   ${(t3 - t2).toFixed(1)} ms  (找到 ${empties.length} 个空夹)`);
console.log(`normalizeUrl×N:     ${(t4 - t3).toFixed(1)} ms`);
console.log(`合计本地计算:       ${(t4 - t0).toFixed(0)} ms`);
console.log(`内存 heapUsed:      ${(process.memoryUsage().heapUsed / 1048576).toFixed(0)} MB`);
const total = t4 - t0;
console.log(total < 2000
  ? `\n✅ PASS — ${N} 书签本地计算 ${total.toFixed(0)}ms < 2s，竞品「几千卡死」死穴我们无此问题`
  : `\n⚠️ 边缘 — ${total.toFixed(0)}ms，需优化后再宣称大集合能力`);
