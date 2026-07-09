import webpush from "web-push";

import { getPBUpstream } from "@/lib/pocketbase-config";

type AuthUser = {
  id: string;
  username?: string;
  full_name?: string;
  phone?: string;
  role?: string;
};

type ApprovalRequest = {
  id: string;
  title?: string;
  creator: string;
  admins: string[];
  status: "pending" | "approved" | "rejected" | "completed";
};

type PushSubscriptionRecord = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

let cachedAdminToken: string | null = null;

function env(name: string) {
  const processValue = typeof process !== "undefined" ? process.env[name] || "" : "";
  if (processValue) return processValue;
  return (import.meta.env as Record<string, string | undefined>)?.[name] || "";
}

function escapePb(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function jsonError(message: string, status = 400) {
  return Response.json({ message }, { status });
}

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] || "";
}

async function pbFetch(path: string, init: RequestInit = {}, token?: string) {
  const headers = new Headers(init.headers);
  headers.set("ngrok-skip-browser-warning", "true");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${getPBUpstream()}${path}`, { ...init, headers });
}

async function readJson(response: Response) {
  return response.json().catch(() => null);
}

export async function getAuthUser(request: Request): Promise<{ token: string; user: AuthUser } | null> {
  const token = getBearerToken(request);
  if (!token) return null;

  const response = await pbFetch(
    "/api/collections/users/auth-refresh",
    { method: "POST" },
    token,
  );
  if (!response.ok) return null;

  const body = await readJson(response);
  return body?.record?.id ? { token, user: body.record as AuthUser } : null;
}

async function getAdminToken() {
  if (cachedAdminToken) return cachedAdminToken;
  const directToken = env("PB_ADMIN_TOKEN");
  if (directToken) {
    cachedAdminToken = directToken;
    return cachedAdminToken;
  }

  const identity = env("PB_ADMIN_EMAIL");
  const password = env("PB_ADMIN_PASSWORD");
  if (!identity || !password) return "";

  for (const path of ["/api/collections/_superusers/auth-with-password", "/api/admins/auth-with-password"]) {
    const response = await pbFetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity, password }),
    });
    const body = await readJson(response);
    if (response.ok && body?.token) {
      cachedAdminToken = body.token;
      return cachedAdminToken;
    }
  }

  return "";
}

export function getVapidPublicKey() {
  return env("VAPID_PUBLIC_KEY");
}

function configureWebPush() {
  const publicKey = env("VAPID_PUBLIC_KEY");
  const privateKey = env("VAPID_PRIVATE_KEY");
  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails(
    env("VAPID_SUBJECT") || "mailto:admin@jobconnect.local",
    publicKey,
    privateKey,
  );
  return true;
}

export async function savePushSubscription(request: Request) {
  const auth = await getAuthUser(request);
  if (!auth) return jsonError("Phiên đăng nhập không hợp lệ.", 401);

  const adminToken = await getAdminToken();
  if (!adminToken) return jsonError("Máy chủ chưa cấu hình quyền admin PocketBase.", 424);

  const body = await request.json().catch(() => null);
  const endpoint = String(body?.endpoint || "").trim();
  const p256dh = String(body?.p256dh || "").trim();
  const authKey = String(body?.auth || "").trim();
  if (!endpoint || !p256dh || !authKey) return jsonError("Thiếu thông tin thiết bị nhận thông báo.");

  const payload = {
    user: auth.user.id,
    endpoint,
    p256dh,
    auth: authKey,
    platform: String(body?.platform || "").slice(0, 120),
    userAgent: String(body?.userAgent || "").slice(0, 500),
    enabled: true,
    lastSeen: new Date().toISOString(),
  };

  const filter = encodeURIComponent(
    `user = "${escapePb(auth.user.id)}" && endpoint = "${escapePb(endpoint)}"`,
  );
  const existing = await pbFetch(
    `/api/collections/push_subscriptions/records?page=1&perPage=1&filter=${filter}&fields=id`,
    {},
    adminToken,
  );
  if (!existing.ok) {
    return jsonError("PocketBase chưa cấu hình collection push_subscriptions.", 424);
  }

  const found = await readJson(existing);
  const recordId = found?.items?.[0]?.id;
  const response = await pbFetch(
    recordId
      ? `/api/collections/push_subscriptions/records/${recordId}`
      : "/api/collections/push_subscriptions/records",
    {
      method: recordId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    adminToken,
  );

  if (!response.ok) return jsonError("Không lưu được thiết bị nhận thông báo.", response.status);
  return Response.json({ ok: true });
}

async function getApprovalRequest(requestId: string, adminToken: string) {
  const response = await pbFetch(
    `/api/collections/approval_requests/records/${encodeURIComponent(requestId)}`,
    {},
    adminToken,
  );
  if (!response.ok) return null;
  return (await readJson(response)) as ApprovalRequest | null;
}

async function listSubscriptions(userId: string, adminToken: string) {
  const filter = encodeURIComponent(`user = "${escapePb(userId)}" && enabled = true`);
  const response = await pbFetch(
    `/api/collections/push_subscriptions/records?page=1&perPage=200&filter=${filter}`,
    {},
    adminToken,
  );
  if (!response.ok) return [];
  const body = await readJson(response);
  return Array.isArray(body?.items) ? (body.items as PushSubscriptionRecord[]) : [];
}

async function disableSubscription(recordId: string, adminToken: string) {
  await pbFetch(
    `/api/collections/push_subscriptions/records/${encodeURIComponent(recordId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    },
    adminToken,
  ).catch(() => undefined);
}

async function sendToUsers(
  userIds: string[],
  notification: { title: string; body: string; url: string },
  adminToken: string,
) {
  if (!configureWebPush()) return { sent: 0, skipped: "missing_vapid" };

  let sent = 0;
  for (const userId of [...new Set(userIds)].filter(Boolean)) {
    const subscriptions = await listSubscriptions(userId, adminToken);
    for (const item of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: item.endpoint,
            keys: { p256dh: item.p256dh, auth: item.auth },
          },
          JSON.stringify(notification),
        );
        sent += 1;
      } catch (error: any) {
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await disableSubscription(item.id, adminToken);
        }
      }
    }
  }

  return { sent };
}

function userName(user: AuthUser) {
  return user.full_name || user.username || user.phone || "Người dùng";
}

export async function sendApprovalPush(request: Request) {
  const auth = await getAuthUser(request);
  if (!auth) return jsonError("Phiên đăng nhập không hợp lệ.", 401);

  const adminToken = await getAdminToken();
  if (!adminToken) return Response.json({ sent: 0, skipped: "missing_admin_auth" });

  const body = await request.json().catch(() => null);
  const type = body?.type === "approval:new" || body?.type === "approval:result" ? body.type : "";
  const requestId = String(body?.requestId || "").trim();
  if (!type || !requestId) return jsonError("Thiếu thông tin thông báo phê duyệt.");

  const approval = await getApprovalRequest(requestId, adminToken);
  if (!approval) return jsonError("Không tìm thấy yêu cầu phê duyệt.", 404);

  if (type === "approval:new") {
    if (approval.creator !== auth.user.id) return jsonError("Bạn không phải người tạo yêu cầu.", 403);
    return Response.json(
      await sendToUsers(
        approval.admins || [],
        {
          title: "Có phê duyệt mới",
          body: `${userName(auth.user)}: ${approval.title || "Yêu cầu phê duyệt"}`,
          url: "/staff/approvals",
        },
        adminToken,
      ),
    );
  }

  if (!["approved", "rejected"].includes(approval.status)) {
    return Response.json({ sent: 0, skipped: "request_still_pending" });
  }
  if (auth.user.role !== "admin" || !(approval.admins || []).includes(auth.user.id)) {
    return jsonError("Bạn không có quyền gửi kết quả phê duyệt.", 403);
  }

  return Response.json(
    await sendToUsers(
      [approval.creator],
      {
        title:
          approval.status === "approved"
            ? "Yêu cầu đã được phê duyệt"
            : "Yêu cầu đã bị từ chối",
        body: approval.title || "Yêu cầu phê duyệt",
        url: "/staff/approvals",
      },
      adminToken,
    ),
  );
}
