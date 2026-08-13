import { getPBUpstream } from "./pocketbase-config";

export type UidCounterType = "user" | "employment_history";

type AuthUser = { id: string; role?: string };
type CounterRecord = {
  id: string;
  counter_key: string;
  counter_type: UidCounterType;
  prefix: string;
  period?: string;
  current_value: number;
};

type AllocateBody = {
  action?: "allocate" | "observe";
  type?: UidCounterType;
  count?: number;
  referenceDate?: string;
  uid?: string;
  actorId?: string;
};

const locks = new Map<string, Promise<void>>();
let cachedAdminToken = "";

function env(name: string) {
  const value = typeof process !== "undefined" ? process.env[name] || "" : "";
  return value || (import.meta.env as Record<string, string | undefined>)?.[name] || "";
}

function escapePb(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
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

function jsonError(message: string, status = 400) {
  return Response.json({ message }, { status });
}

function bearerToken(request: Request) {
  return /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
}

async function getAuthUser(request: Request): Promise<AuthUser | null> {
  const token = bearerToken(request);
  if (!token) return null;
  const response = await pbFetch("/api/collections/users/auth-refresh", { method: "POST" }, token);
  if (!response.ok) return null;
  const body = await readJson(response);
  return body?.record?.id ? (body.record as AuthUser) : null;
}

async function getAdminToken() {
  if (cachedAdminToken) return cachedAdminToken;
  const direct = env("PB_ADMIN_TOKEN");
  if (direct) return (cachedAdminToken = direct);
  const identity = env("PB_ADMIN_EMAIL");
  const password = env("PB_ADMIN_PASSWORD");
  if (!identity || !password) return "";
  for (const path of [
    "/api/collections/_superusers/auth-with-password",
    "/api/admins/auth-with-password",
  ]) {
    const response = await pbFetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity, password }),
    });
    const body = await readJson(response);
    if (response.ok && body?.token) return (cachedAdminToken = body.token);
  }
  return "";
}

async function withCounterLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => (release = resolve));
  const queued = previous.then(() => current);
  locks.set(key, queued);
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (locks.get(key) === queued) locks.delete(key);
  }
}

async function getPrefix(token: string) {
  const response = await pbFetch(
    "/api/collections/app_settings/records?page=1&perPage=1&fields=account_code_prefix",
    {},
    token,
  );
  if (!response.ok) throw new Error("Không đọc được tiền tố UID từ PocketBase.");
  const body = await readJson(response);
  return String(body?.items?.[0]?.account_code_prefix || "")
    .trim()
    .toUpperCase();
}

function counterMeta(type: UidCounterType, prefix: string, referenceDate?: string) {
  if (type === "user") return { key: `user:${prefix}`, period: "", limit: 999_999 };
  const date = referenceDate ? new Date(referenceDate) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error("Ngày tham chiếu cấp UID không hợp lệ.");
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  return {
    key: `employment_history:${prefix}:${year}${String(month).padStart(2, "0")}`,
    period: `${year}${String(month).padStart(2, "0")}`,
    limit: 9_999,
  };
}

function formatUid(type: UidCounterType, prefix: string, period: string, value: number) {
  if (type === "user") return `${prefix}${String(value).padStart(6, "0")}`;
  return `${prefix}${period.slice(2, 4)}${period.slice(4, 6)}${String(value).padStart(4, "0")}`;
}

async function getCounter(key: string, token: string): Promise<CounterRecord | null> {
  const params = new URLSearchParams({
    page: "1",
    perPage: "1",
    filter: `counter_key="${escapePb(key)}"`,
  });
  const response = await pbFetch(`/api/collections/uid_counters/records?${params}`, {}, token);
  if (response.status === 404) throw new Error("PocketBase chưa có collection uid_counters.");
  if (!response.ok) throw new Error("Không đọc được bộ đếm UID.");
  return ((await readJson(response))?.items?.[0] as CounterRecord | undefined) || null;
}

async function scanMaximum(type: UidCounterType, prefix: string, period: string, token: string) {
  const collection = type === "user" ? "users" : "employment_histories";
  const response = await pbFetch(
    `/api/collections/${collection}/records?page=1&perPage=500&fields=uid`,
    {},
    token,
  );
  if (!response.ok) throw new Error("Không thể khởi tạo bộ đếm từ dữ liệu UID hiện tại.");
  const body = await readJson(response);
  const totalPages = Math.max(1, Number(body?.totalPages || 1));
  let max = 0;
  const inspect = (items: Array<{ uid?: string }>) => {
    const pattern =
      type === "user"
        ? new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d{6})$`)
        : new RegExp(
            `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${period.slice(2, 6)}(\\d{4})$`,
          );
    for (const item of items || []) {
      const match = String(item.uid || "").match(pattern);
      if (match) max = Math.max(max, Number(match[1]));
    }
  };
  inspect(body?.items || []);
  for (let page = 2; page <= totalPages; page += 1) {
    const next = await pbFetch(
      `/api/collections/${collection}/records?page=${page}&perPage=500&fields=uid`,
      {},
      token,
    );
    if (!next.ok) throw new Error("Không thể quét đầy đủ UID hiện tại.");
    inspect((await readJson(next))?.items || []);
  }
  return max;
}

async function saveCounter(
  input: Omit<CounterRecord, "id">,
  id: string | undefined,
  token: string,
) {
  const path = id
    ? `/api/collections/uid_counters/records/${encodeURIComponent(id)}`
    : "/api/collections/uid_counters/records";
  const response = await pbFetch(
    path,
    {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    token,
  );
  if (!response.ok) {
    const body = await readJson(response);
    throw new Error(body?.message || "Không cập nhật được bộ đếm UID.");
  }
  return (await readJson(response)) as CounterRecord;
}

async function allocate(body: AllocateBody, actor: AuthUser | null, adminToken: string) {
  const type = body.type;
  if (type !== "user" && type !== "employment_history") return jsonError("Loại UID không hợp lệ.");
  const count = Math.trunc(Number(body.count || 1));
  if (count < 1 || count > 1_000) return jsonError("Số lượng UID phải từ 1 đến 1000.");
  if (type === "employment_history" && !actor)
    return jsonError("Cần đăng nhập để cấp UID lịch sử.", 401);
  if (count > 1 && !actor) return jsonError("Cần đăng nhập để cấp nhiều UID.", 401);

  const prefix = await getPrefix(adminToken);
  const meta = counterMeta(type, prefix, body.referenceDate);
  return withCounterLock(meta.key, async () => {
    let counter = await getCounter(meta.key, adminToken);
    if (!counter) {
      const current = await scanMaximum(type, prefix, meta.period, adminToken);
      counter = await saveCounter(
        {
          counter_key: meta.key,
          counter_type: type,
          prefix,
          period: meta.period,
          current_value: current,
          updated_by: actor?.id || body.actorId || "",
          note: "Khởi tạo tự động từ dữ liệu hiện có",
        },
        undefined,
        adminToken,
      );
    }
    const startValue = Number(counter.current_value || 0) + 1;
    const endValue = startValue + count - 1;
    if (endValue > meta.limit)
      return jsonError(
        type === "user"
          ? "Đã vượt giới hạn 999999 UID theo tiền tố hiện tại."
          : "Đã vượt giới hạn 9999 UID lịch sử trong tháng.",
        409,
      );
    await saveCounter(
      {
        counter_key: meta.key,
        counter_type: type,
        prefix,
        period: meta.period,
        current_value: endValue,
        updated_by: actor?.id || body.actorId || "",
        note: counter.note || "",
      },
      counter.id,
      adminToken,
    );
    const uids = Array.from({ length: count }, (_, index) =>
      formatUid(type, prefix, meta.period, startValue + index),
    );
    return Response.json({ type, prefix, period: meta.period, startValue, endValue, uids });
  });
}

async function observe(body: AllocateBody, actor: AuthUser | null, adminToken: string) {
  if (!actor || (actor.role !== "admin" && actor.role !== "staff"))
    return jsonError("Bạn không có quyền cập nhật bộ đếm UID.", 403);
  const type = body.type;
  const uid = String(body.uid || "")
    .trim()
    .toUpperCase();
  if ((type !== "user" && type !== "employment_history") || !uid)
    return jsonError("UID quan sát không hợp lệ.");
  const prefix = await getPrefix(adminToken);
  const meta = counterMeta(type, prefix, body.referenceDate);
  const pattern =
    type === "user"
      ? new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d{6})$`)
      : new RegExp(
          `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${meta.period.slice(2, 6)}(\\d{4})$`,
        );
  const match = uid.match(pattern);
  if (!match) return Response.json({ observed: false });
  const observed = Number(match[1]);
  return withCounterLock(meta.key, async () => {
    const counter = await getCounter(meta.key, adminToken);
    if (counter && Number(counter.current_value || 0) >= observed)
      return Response.json({ observed: false });
    await saveCounter(
      {
        counter_key: meta.key,
        counter_type: type,
        prefix,
        period: meta.period,
        current_value: observed,
        updated_by: actor.id,
        note: "Nâng bộ đếm theo UID nhập thủ công",
      },
      counter?.id,
      adminToken,
    );
    return Response.json({ observed: true, currentValue: observed });
  });
}

export async function handleUidCounterRequest(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as AllocateBody | null;
    if (!body) return jsonError("Dữ liệu yêu cầu không hợp lệ.");
    const adminToken = await getAdminToken();
    if (!adminToken) return jsonError("Máy chủ chưa cấu hình quyền quản trị PocketBase.", 424);
    const actor = await getAuthUser(request);
    return body.action === "observe"
      ? observe(body, actor, adminToken)
      : allocate(body, actor, adminToken);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Không cấp được UID.", 500);
  }
}
