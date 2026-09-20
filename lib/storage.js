const KEYS = {
  lang: "lang",
  trash: "trash",
  scan: "scanState",
  settings: "settings"
};

const DEFAULT_SETTINGS = {
  timeoutMs: 8000,
  concurrency: 8,
  openLimit: 20,
  trashLimit: 2000,
  autoArchiveName: "",
  excludedFolders: ["归档", "失效书签归档", "无法确认归档"]
};

export async function getSettings() {
  const { settings } = await chrome.storage.local.get({ settings: {} });
  return { ...DEFAULT_SETTINGS, ...settings };
}

export async function setSettings(patch) {
  const cur = await getSettings();
  const next = { ...cur, ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}

export async function getTrash() {
  const { trash } = await chrome.storage.local.get({ trash: [] });
  return Array.isArray(trash) ? trash : [];
}

export async function addToTrash(entries) {
  const limit = (await getSettings()).trashLimit;
  const trash = await getTrash();
  const next = [...entries, ...trash].slice(0, limit);
  await chrome.storage.local.set({ trash: next });
}

export async function setTrash(entries) {
  await chrome.storage.local.set({ trash: entries });
}

export async function clearTrash() {
  await chrome.storage.local.set({ trash: [] });
}

export async function getArchivedIds() {
  const { archivedIds } = await chrome.storage.local.get({ archivedIds: [] });
  return new Set(Array.isArray(archivedIds) ? archivedIds : []);
}

export async function addArchivedIds(ids) {
  const cur = await getArchivedIds();
  for (const id of ids) cur.add(id);
  await chrome.storage.local.set({ archivedIds: [...cur].slice(-5000) });
}

export async function removeArchivedIds(ids) {
  const cur = await getArchivedIds();
  for (const id of ids) cur.delete(id);
  await chrome.storage.local.set({ archivedIds: [...cur] });
}

export async function getOpLog() {
  const { opLog } = await chrome.storage.local.get({ opLog: [] });
  return Array.isArray(opLog) ? opLog : [];
}

export async function addOpLog(entry) {
  const log = await getOpLog();
  log.unshift({ ...entry, at: Date.now() });
  await chrome.storage.local.set({ opLog: log.slice(0, 500) });
}

export async function setOpLog(list) {
  await chrome.storage.local.set({ opLog: list.slice(0, 500) });
}

export async function getScanState() {
  const { scanState } = await chrome.storage.local.get({ scanState: null });
  return scanState;
}

export async function setScanState(state) {
  await chrome.storage.local.set({ scanState: state });
}

export async function patchScanState(patch) {
  const cur = await getScanState();
  const next = { ...(cur || {}), ...patch };
  await chrome.storage.local.set({ scanState: next });
  return next;
}

export function onScanStateChanged(cb) {
  const listener = (changes, area) => {
    if (area === "local" && changes.scanState) {
      cb(changes.scanState.newValue || null);
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
