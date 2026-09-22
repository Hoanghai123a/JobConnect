import { pb } from "./pocketbase";

const GUEST_SESSION_KEY = "guest_session_id";

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
}
