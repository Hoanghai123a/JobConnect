import { pb } from "./pocketbase";
import { getPBUpstream } from "./pocketbase-config";

const GUEST_SESSION_KEY = "guest_session_id";
const GUEST_LAST_LOG_KEY = "guest_last_log_date";

/**
 * Lấy hoặc tạo session ID cho guest
 */
export function getGuestSessionId(): string {
  let sessionId = localStorage.getItem(GUEST_SESSION_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem(GUEST_SESSION_KEY, sessionId);
  }
  return sessionId;
}

/**
 * Kiểm tra user hiện tại có phải là guest không
 */
export function isGuest(): boolean {
  return !pb.authStore.isValid;
}

/**
 * Ghi log guest login vào login_history (chỉ 1 lần mỗi ngày)
 */
export async function logGuestLogin() {
  if (!isGuest()) return; // Chỉ log cho guest

  try {
    const sessionId = getGuestSessionId();
    const now = new Date();
    const today = now.toISOString().split('T')[0]; // "2026-09-23"

    // Kiểm tra đã log hôm nay chưa
    const lastLogDate = localStorage.getItem(GUEST_LAST_LOG_KEY);
    if (lastLogDate === today) {
      console.debug('[guest] Already logged today, skip');
      return; // Đã log rồi, không log nữa
    }

    // Ghi log vào login_history
    await fetch(`${getPBUpstream()}/api/collections/login_history/records`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({
        session_id: sessionId,
        login_type: "guest",
        login_at: now.toISOString(),
      }),
    });

    // Lưu ngày đã log
    localStorage.setItem(GUEST_LAST_LOG_KEY, today);
    console.debug('[guest] Logged successfully for', today);
  } catch (error) {
    // Silent fail - không ảnh hưởng UX
    console.debug("Failed to log guest login:", error);
  }
}

/**
 * Log hoạt động của guest
 */
export async function logGuestActivity(page: string, action: string = "visit") {
  if (!isGuest()) return; // Chỉ log cho guest

  try {
    const sessionId = getGuestSessionId();
    await pb.collection("guest_sessions").create({
      session_id: sessionId,
      ip_address: "", // Backend có thể lấy từ request header
      user_agent: navigator.userAgent,
      page_visited: page,
      action,
      visited_at: new Date().toISOString(),
    });
  } catch (error) {
    // Silent fail - không ảnh hưởng UX
    console.debug("Failed to log guest activity:", error);
  }
}

/**
 * Clear guest session (khi user đăng ký/đăng nhập)
 */
export function clearGuestSession() {
  localStorage.removeItem(GUEST_SESSION_KEY);
  localStorage.removeItem(GUEST_LAST_LOG_KEY);
}
