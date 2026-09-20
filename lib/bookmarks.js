import { isHttpUrl, normalizeUrl, parseUrl } from "./url.js";

export async function getTree() {
  return chrome.bookmarks.getTree();
}

export function flattenTree(tree) {
  const out = [];
  const roots = tree || [];
  for (const root of roots) {
    walk(root, [], out);
  }
  return out;
}

function walk(node, path, out) {
  const isFolder = !node.url;
  const label = folderLabel(node);
  const nextPath = isFolder ? [...path, label] : path;
  if (isFolder) {
    out.push({
      id: node.id,
      type: "folder",
      title: node.title || label,
      parentId: node.parentId || null,
      path: path.join(" / "),
      dateAdded: node.dateAdded || null
    });
  } else {
    out.push({
      id: node.id,
      type: "bookmark",
      title: node.title || "",
      url: node.url || "",
      parentId: node.parentId || null,
      path: path.join(" / "),
      dateAdded: node.dateAdded || null
    });
  }
  for (const child of node.children || []) {
    walk(child, nextPath, out);
  }
}

function folderLabel(node) {
  if (node.id === "0") return "root";
  return node.title || "";
}

export function httpBookmarks(items) {
  return items.filter((x) => x.type === "bookmark" && isHttpUrl(x.url));
}

export function findDuplicates(bookmarks) {
  const groups = new Map();
  for (const b of bookmarks) {
    if (!isHttpUrl(b.url)) continue;
    const key = normalizeUrl(b.url);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(b);
  }
  const dups = [];
  for (const [key, list] of groups.entries()) {
    if (list.length > 1) {
      dups.push({ key, items: list });
    }
  }
  return dups;
}

export function findEmptyFolders(items) {
  const folderMap = new Map();
  for (const it of items) {
    if (it.type === "folder") folderMap.set(it.id, { ...it, children: [] });
  }
  for (const it of items) {
    if (it.parentId && folderMap.has(it.parentId)) {
      folderMap.get(it.parentId).children.push(it.id);
    }
  }
  const empty = [];
  for (const [id, folder] of folderMap.entries()) {
    if (id === "0") continue;
    const kids = items.filter((x) => x.parentId === id);
    if (kids.length === 0) empty.push(folder);
  }
  return empty;
}

export async function getNodes(ids) {
  const nodes = [];
  for (const id of ids) {
    try {
      const arr = await chrome.bookmarks.get(id);
      if (arr && arr[0]) nodes.push(arr[0]);
    } catch {
      /* already removed */
    }
  }
  return nodes;
}

export async function getSubTree(id) {
  try {
    const arr = await chrome.bookmarks.getSubTree(id);
    return arr && arr[0] ? arr[0] : null;
  } catch {
    return null;
  }
}

export function snapshotNode(node, parentId, index) {
  const snap = {
    title: node.title || "",
    parentId,
    index: typeof index === "number" ? index : undefined,
    dateAdded: node.dateAdded || Date.now(),
    isFolder: !node.url
  };
  if (node.url) snap.url = node.url;
  if (snap.isFolder) {
    snap.children = (node.children || []).map((c) => snapshotNode(c, node.id, c.index));
  }
  return snap;
}

export async function removeWithSnapshot(ids) {
  const trashEntries = [];
  const errors = [];
  for (const id of ids) {
    try {
      const nodes = await chrome.bookmarks.get(id);
      const node = nodes && nodes[0];
      if (!node) continue;
      let snap;
      if (node.url) {
        const parent = node.parentId ? (await chrome.bookmarks.get(node.parentId))[0] : null;
        const index = parent ? (parent.children || []).findIndex((c) => c.id === id) : 0;
        snap = snapshotNode(node, node.parentId, index);
        await chrome.bookmarks.remove(id);
      } else {
        const sub = await getSubTree(id);
        snap = snapshotNode(sub || node, node.parentId, 0);
        await chrome.bookmarks.removeTree(id);
      }
      snap.deletedAt = Date.now();
      trashEntries.push(snap);
    } catch (e) {
      errors.push({ id, message: String(e && e.message ? e.message : e) });
    }
  }
  return { trashEntries, errors };
}

export async function restoreEntries(entries) {
  let restored = 0;
  for (const entry of entries) {
    try {
      await restoreOne(entry);
      restored += 1;
    } catch {
      /* skip broken entries */
    }
  }
  return restored;
}

async function restoreOne(entry) {
  let parentId = entry.parentId || "1";
  try {
    await chrome.bookmarks.get(parentId);
  } catch {
    parentId = await firstWritableFolder();
  }
  if (entry.isFolder) {
    const folder = await chrome.bookmarks.create({ parentId, title: entry.title || "" });
    for (const child of entry.children || []) {
      await restoreInto(child, folder.id);
    }
  } else {
    await chrome.bookmarks.create({
      parentId,
      title: entry.title || entry.url || "",
      url: entry.url
    });
  }
}

async function restoreInto(entry, parentId) {
  if (entry.isFolder) {
    const folder = await chrome.bookmarks.create({ parentId, title: entry.title || "" });
    for (const child of entry.children || []) {
      await restoreInto(child, folder.id);
    }
  } else {
    await chrome.bookmarks.create({ parentId, title: entry.title || entry.url || "", url: entry.url });
  }
}

async function firstWritableFolder() {
  const tree = await getTree();
  const root = tree[0];
  const kids = root.children || [];
  const bar = kids.find((c) => !c.url);
  return bar ? bar.id : root.id;
}

export async function moveBookmarks(ids, parentId) {
  let moved = 0;
  for (const id of ids) {
    try {
      await chrome.bookmarks.move(id, { parentId });
      moved += 1;
    } catch {
      /* skip */
    }
  }
  return moved;
}

export async function createFolder(parentId, title) {
  return chrome.bookmarks.create({ parentId, title });
}

export async function updateBookmarkUrl(id, url) {
  return chrome.bookmarks.update(id, { url });
}

export async function openUrls(urls, limit) {
  const list = urls.slice(0, limit);
  for (const url of list) {
    try {
      await chrome.tabs.create({ url, active: false });
    } catch {
      /* skip */
    }
  }
  return list.length;
}

export function isFolderNode(node) {
  return node && !node.url;
}

export function safeParse(url) {
  return parseUrl(url);
}
