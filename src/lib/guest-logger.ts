import { getPBUpstream } from "./pocketbase-config";

export interface GuestLogEntry {
  action: string;
  details?: Record<string, unknown>;
  timestamp: string;
  device_info?: string;
}

const GUEST_LOG_QUEUE_KEY = "jobconnect.guestLogQueue";
const MAX_QUEUE_SIZE = 100;
const SYNC_INTERVAL_MS = 60000; // 1 phút

let syncTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Ghi log hoạt động của guest vào queue local
 */
export function logGuestAction(action: string, details?: Record<string, unknown>) {
  if (typeof window === "undefined") return;

  const entry: GuestLogEntry = {
    action,
    details,
    timestamp: new Date().toISOString(),
    device_info: getDeviceInfo(),
  };

  try {
    const queue = readLogQueue();
    queue.push(entry);

    // Giữ queue không quá lớn
    if (queue.length > MAX_QUEUE_SIZE) {
      queue.splice(0, queue.length - MAX_QUEUE_SIZE);
    }

    saveLogQueue(queue);
  } catch (error) {
    console.warn("[guest-logger] Failed to queue log:", error);
  }
}

/**
 * Đọc queue log từ localStorage
 */
function readLogQueue(): GuestLogEntry[] {
  try {
    const raw = window.localStorage.getItem(GUEST_LOG_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Lưu queue log vào localStorage
 */
function saveLogQueue(queue: GuestLogEntry[]) {
  try {
    window.localStorage.setItem(GUEST_LOG_QUEUE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.warn("[guest-logger] Failed to save log queue:", error);
  }
}

/**
 * Gửi logs trong queue lên PocketBase
 */
async function syncLogsToBackend() {
  const queue = readLogQueue();
  if (queue.length === 0) return;

  try {
    const response = await fetch(`${getPBUpstream()}/api/collections/guest_logs/records`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({
        logs: queue,
        synced_at: new Date().toISOString(),
      }),
    });

    if (response.ok) {
      // Xóa logs đã sync thành công
      saveLogQueue([]);
      console.info("[guest-logger] Synced", queue.length, "logs to backend");
    }
  } catch (error) {
    console.warn("[guest-logger] Failed to sync logs:", error);
    // Giữ logs trong queue để thử lại sau
  }
}

/**
 * Bắt đầu sync logs định kỳ
 */
export function startGuestLogSync() {
  if (syncTimer) return;
  if (typeof window === "undefined") return;

  // Sync ngay lần đầu
  syncLogsToBackend();

  // Sync định kỳ
  syncTimer = setInterval(() => {
    syncLogsToBackend();
  }, SYNC_INTERVAL_MS);
}

/**
 * Dừng sync logs
 */
export function stopGuestLogSync() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

/**
 * Lấy thông tin device đơn giản
 */
function getDeviceInfo(): string {
  if (typeof window === "undefined") return "unknown";
  return `${window.navigator.userAgent.slice(0, 100)}`;
}
