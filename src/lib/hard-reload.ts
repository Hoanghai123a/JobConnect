// Bản đã cài (PWA) giữ service worker + Cache Storage của phiên bản cũ. Sau khi
// deploy, tên file chunk đổi theo hash nên cache cũ trả về asset không còn tồn
// tại và app vỡ ngay khi mở. Tải sâu xoá hết lớp cache đó rồi nạp lại từ máy chủ.
//
// localStorage được giữ nguyên có chủ đích: nó chứa token đăng nhập (pb_auth) và
// dữ liệu chỉ có trên máy (chấm công chế độ khách, tin nhắn offline, tiến trình
// vườn cây/game) — những thứ không có bản sao trên server, xoá là mất vĩnh viễn.

const HARD_RELOAD_GUARD_KEY = "jobconnect.hardReload.guard";
const IDB_DELETE_TIMEOUT_MS = 1500;

async function unregisterServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
}

async function deleteCacheStorage() {
  if (!("caches" in window)) return;
  const keys = await caches.keys();
  await Promise.all(keys.map((key) => caches.delete(key)));
}

// deleteDatabase blocks indefinitely while another tab holds the connection open,
// so cap the wait instead of leaving the user on a dead button.
function deleteDatabase(name: string) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, IDB_DELETE_TIMEOUT_MS);
    const finish = () => {
      clearTimeout(timer);
      resolve();
    };
    try {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = finish;
      request.onerror = finish;
      request.onblocked = finish;
    } catch {
      finish();
    }
  });
}

async function deleteIndexedDatabases() {
  if (typeof indexedDB === "undefined") return;
  // databases() is unavailable on Firefox and older Safari; the known cache name
  // covers those browsers.
  const names = indexedDB.databases
    ? (await indexedDB.databases().catch(() => [])).map((db) => db.name)
    : ["jobconnect-workforce-dashboard"];
  await Promise.all(
    names.filter((name): name is string => Boolean(name)).map((name) => deleteDatabase(name)),
  );
}

/**
 * Xoá service worker, Cache Storage, IndexedDB và sessionStorage rồi nạp lại
 * trang từ máy chủ. Giữ nguyên localStorage (token đăng nhập + dữ liệu offline).
 */
export async function hardReload() {
  if (typeof window === "undefined") return;

  await Promise.allSettled([
    unregisterServiceWorkers(),
    deleteCacheStorage(),
    deleteIndexedDatabases(),
  ]);

  try {
    window.sessionStorage.clear();
    // Set after clear() so the guard survives into the next load and a failure
    // that reappears immediately cannot loop the reload.
    window.sessionStorage.setItem(HARD_RELOAD_GUARD_KEY, window.location.pathname);
  } catch {
    // Private mode can reject storage access; the reload below still applies.
  }

  // Bypass the HTTP cache for the document itself — reload() alone may serve the
  // stale HTML that references the deleted chunks.
  const url = new URL(window.location.href);
  url.searchParams.set("_r", Date.now().toString(36));
  window.location.replace(url.toString());
}

/** True khi lần tải hiện tại đã đến từ một lần tải sâu (dùng để chặn vòng lặp). */
export function didHardReload() {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(HARD_RELOAD_GUARD_KEY) === window.location.pathname;
  } catch {
    return false;
  }
}
