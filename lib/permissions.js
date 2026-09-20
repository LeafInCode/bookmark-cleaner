const SCAN_PERMISSIONS = {
  origins: ["<all_urls>"],
  permissions: ["webRequest", "webNavigation"]
};

export async function hasScanPermissions() {
  try {
    return await chrome.permissions.contains(SCAN_PERMISSIONS);
  } catch {
    return false;
  }
}

export async function ensureScanPermissions() {
  try {
    return await chrome.permissions.request(SCAN_PERMISSIONS);
  } catch {
    return false;
  }
}
