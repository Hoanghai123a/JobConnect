import { pb } from "@/lib/pocketbase";
import { isStandaloneMode } from "@/lib/pwa-install";

const PUSH_DISMISSED_PREFIX = "jobconnect:push-dismissed:";

export type PushSupportState = {
  supported: boolean;
  standalone: boolean;
  permission: NotificationPermission | "unsupported";
  configured: boolean;
};

type PushSubscriptionPayload = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

function authHeaders(): Record<string, string> {
  const token = pb.authStore.token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

const DISMISS_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

export function getPushDismissed(userId: string) {
  if (typeof window === "undefined") return false;
  const raw = window.localStorage.getItem(`${PUSH_DISMISSED_PREFIX}${userId}`);
  if (!raw) return false;
  const dismissedAt = Number(raw);
  if (Number.isNaN(dismissedAt)) return false;
  return Date.now() - dismissedAt < DISMISS_COOLDOWN_MS;
}

export function setPushDismissed(userId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${PUSH_DISMISSED_PREFIX}${userId}`, String(Date.now()));
}

export function isPushBrowserSupported() {
  if (typeof window === "undefined") return false;
  return "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
}

export async function getVapidPublicKey() {
  const res = await fetch("/api/push/public-key");
  if (!res.ok) return "";
  const body = await res.json().catch(() => ({}));
  return typeof body?.publicKey === "string" ? body.publicKey : "";
}

export async function getPushSupportState(): Promise<PushSupportState> {
  const supported = isPushBrowserSupported();
  const standalone = import.meta.env.DEV || isStandaloneMode();
  const permission = supported ? Notification.permission : "unsupported";
  const configured = supported ? Boolean(await getVapidPublicKey().catch(() => "")) : false;
  return { supported, standalone, permission, configured };
}

async function saveSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON() as PushSubscriptionPayload;
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("Thiết bị không trả về khóa thông báo hợp lệ.");
  }

  const res = await fetch("/api/push/subscription", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      platform: navigator.platform || "",
      userAgent: navigator.userAgent || "",
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message || "Không lưu được thiết bị nhận thông báo.");
  }
}

export async function enablePushNotifications() {
  if (!isPushBrowserSupported()) throw new Error("Thiết bị chưa hỗ trợ thông báo.");
  if (!import.meta.env.DEV && !isStandaloneMode()) throw new Error("Chỉ bật thông báo khi dùng app đã cài.");

  const publicKey = await getVapidPublicKey();
  if (!publicKey) throw new Error("Máy chủ chưa cấu hình khóa thông báo.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Bạn chưa cho phép nhận thông báo.");

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    }));

  await saveSubscription(subscription);
}

export async function syncExistingPushSubscription() {
  if (!isPushBrowserSupported() || !isStandaloneMode() || Notification.permission !== "granted") {
    return;
  }
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) await saveSubscription(subscription);
}

async function postApprovalNotification(type: "approval:new" | "approval:result", requestId: string) {
  if (!pb.authStore.token) return;
  await fetch("/api/push/approval", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ type, requestId }),
  }).catch(() => undefined);
}

export function notifyApprovalCreated(requestId: string) {
  return postApprovalNotification("approval:new", requestId);
}

export function notifyApprovalResolved(requestId: string) {
  return postApprovalNotification("approval:result", requestId);
}
