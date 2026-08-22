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
  note?: string;
};

type AllocateBody = {
  action?: "allocate" | "observe";
  type?: UidCounterType;
  count?: number;
  referenceDate?: string;
  uid?: string;
};

type UidCounterErrorCode =
  | "PB_UNREACHABLE"
  | "PB_AUTH_EXPIRED"
  | "PB_PERMISSION_DENIED"
  | "PB_RECORD_NOT_FOUND"
  | "PB_READ_FAILED"
  | "PB_WRITE_FAILED"
  | "PB_VALIDATION_FAILED"
  | "UID_PREFIX_MISSING"
  | "UID_COUNTER_INVALID";

class UidCounterRequestError extends Error {
  readonly code: UidCounterErrorCode;
  readonly status: number;
  readonly operation: string;

  constructor(message: string, code: UidCounterErrorCode, status: number, operation: string) {
    super(message);
    this.name = "UidCounterRequestError";
    this.code = code;
    this.status = status;
    this.operation = operation;
  }
}

const locks = new Map<string, Promise<void>>();
let cachedAdminToken = "";

type AdminAuthResult =
  | { ok: true; token: string }
  | { ok: false; reason: "missing_config" | "unreachable" | "invalid_credentials" };

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

function structuredError(
  message: string,
  code: UidCounterErrorCode,
  status: number,
  operation?: string,
) {
  return Response.json({ message, code, ...(operation ? { operation } : {}) }, { status });
}

function pocketBaseMessage(body: any, fallback: string) {
  return typeof body?.message === "string" && body.message.trim() ? body.message.trim() : fallback;
}

function pocketBaseErrorCode(status: number, operation: string): UidCounterErrorCode {
  if (status === 401) return "PB_AUTH_EXPIRED";
  if (status === 403) return "PB_PERMISSION_DENIED";
  if (status === 404) return "PB_RECORD_NOT_FOUND";
  if (status === 400 || status === 409) return "PB_VALIDATION_FAILED";
  return operation.startsWith("read") ? "PB_READ_FAILED" : "PB_WRITE_FAILED";
}

function logPocketBaseFailure(operation: string, response: Response, body: any) {
  const fieldErrors = body?.data && typeof body.data === "object" ? Object.keys(body.data) : [];
  console.error("[uid-counter] PocketBase request failed", {
    operation,
    status: response.status,
    message: pocketBaseMessage(body, response.statusText || "PocketBase request failed"),
    fieldErrors,
  });
}

async function requirePocketBaseJson<T>(
  path: string,
  init: RequestInit,
  token: string,
  operation: string,
  fallback: string,
): Promise<T> {
  let response: Response;
  try {
    response = await pbFetch(path, init, token);
  } catch (error) {
    console.error("[uid-counter] PocketBase request unreachable", {
      operation,
      message: error instanceof Error ? error.message : String(error),
    });
    throw new UidCounterRequestError(
      "Máy chủ không kết nối được PocketBase.",
      "PB_UNREACHABLE",
      503,
      operation,
    );
  }

  const body = await readJson(response);
  if (!response.ok) {
    logPocketBaseFailure(operation, response, body);
    throw new UidCounterRequestError(
      pocketBaseMessage(body, fallback),
      pocketBaseErrorCode(response.status, operation),
      response.status,
      operation,
    );
  }
  return body as T;
}

function bearerToken(request: Request) {
  return /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
}

async function getAuthUser(request: Request): Promise<AuthUser | null> {
  const token = bearerToken(request);
  if (!token) return null;
  try {
    const response = await pbFetch(
      "/api/collections/users/auth-refresh",
      { method: "POST" },
      token,
    );
    if (!response.ok) return null;
    const body = await readJson(response);
    return body?.record?.id ? (body.record as AuthUser) : null;
  } catch {
    return null;
  }
}

async function getAdminToken(): Promise<AdminAuthResult> {
  if (cachedAdminToken) return { ok: true, token: cachedAdminToken };
  const direct = env("PB_ADMIN_TOKEN");
  if (direct) {
    cachedAdminToken = direct;
    return { ok: true, token: cachedAdminToken };
  }

  const identity = env("PB_ADMIN_EMAIL");
  const password = env("PB_ADMIN_PASSWORD");
  if (!identity || !password) return { ok: false, reason: "missing_config" };

  for (const path of [
    "/api/collections/_superusers/auth-with-password",
    "/api/admins/auth-with-password",
  ]) {
    try {
      const response = await pbFetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identity, password }),
      });
      const body = await readJson(response);
      if (response.ok && body?.token) {
        cachedAdminToken = body.token;
        return { ok: true, token: cachedAdminToken };
      }
      console.error("[uid-counter] PocketBase admin authentication failed", {
        operation: path,
        status: response.status,
        message: pocketBaseMessage(body, "PocketBase admin authentication failed"),
      });
    } catch {
      return { ok: false, reason: "unreachable" };
    }
  }

  return { ok: false, reason: "invalid_credentials" };
}

function adminAuthError(reason: Exclude<AdminAuthResult, { ok: true }>["reason"]) {
  if (reason === "missing_config") {
    return structuredError(
      "Máy chủ thiếu cấu hình quản trị PocketBase.",
      "PB_VALIDATION_FAILED",
      424,
    );
  }
  if (reason === "unreachable") {
    return structuredError("Máy chủ không kết nối được PocketBase.", "PB_UNREACHABLE", 503);
  }
  return structuredError(
    "Thông tin đăng nhập quản trị PocketBase không hợp lệ.",
    "PB_AUTH_EXPIRED",
    424,
  );
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
  const body = await requirePocketBaseJson<{ items?: Array<{ account_code_prefix?: string }> }>(
    "/api/collections/app_settings/records?page=1&perPage=1&fields=account_code_prefix",
    {},
    token,
    "read app_settings.account_code_prefix",
    "Không đọc được tiền tố UID từ PocketBase.",
  );
  const prefix = String(body?.items?.[0]?.account_code_prefix || "")
    .trim()
    .toUpperCase();
  if (!prefix) {
    throw new UidCounterRequestError(
      "PocketBase chưa cấu hình tiền tố UID.",
      "UID_PREFIX_MISSING",
      424,
      "read app_settings.account_code_prefix",
    );
  }
  return prefix;
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
  try {
    const body = await requirePocketBaseJson<{ items?: CounterRecord[] }>(
      `/api/collections/uid_counters/records?${params}`,
      {},
      token,
      "read uid_counters",
      "Không đọc được bộ đếm UID.",
    );
    return body?.items?.[0] || null;
  } catch (error) {
    if (error instanceof UidCounterRequestError && error.code === "PB_RECORD_NOT_FOUND") {
      throw new UidCounterRequestError(
        "PocketBase chưa có collection uid_counters.",
        "PB_RECORD_NOT_FOUND",
        424,
        "read uid_counters",
      );
    }
    throw error;
  }
}

async function scanMaximum(type: UidCounterType, prefix: string, period: string, token: string) {
  const collection = type === "user" ? "users" : "employment_histories";
  const body = await requirePocketBaseJson<{
    totalPages?: number;
    items?: Array<{ uid?: string }>;
  }>(
    `/api/collections/${collection}/records?page=1&perPage=500&fields=uid`,
    {},
    token,
    `read ${collection}.uid`,
    "Không thể khởi tạo bộ đếm từ dữ liệu UID hiện tại.",
  );
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
    const nextBody = await requirePocketBaseJson<{ items?: Array<{ uid?: string }> }>(
      `/api/collections/${collection}/records?page=${page}&perPage=500&fields=uid`,
      {},
      token,
      `read ${collection}.uid page ${page}`,
      "Không thể quét đầy đủ UID hiện tại.",
    );
    inspect(nextBody?.items || []);
  }
  return max;
}

async function saveCounter(
  input: Omit<CounterRecord, "id"> & { updated_by?: string },
  id: string | undefined,
  token: string,
) {
  const path = id
    ? `/api/collections/uid_counters/records/${encodeURIComponent(id)}`
    : "/api/collections/uid_counters/records";
  return requirePocketBaseJson<CounterRecord>(
    path,
    {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    token,
    `${id ? "update" : "create"} uid_counters`,
    "Không cập nhật được bộ đếm UID.",
  );
}

function validateCounter(
  counter: CounterRecord,
  expected: { key: string; type: UidCounterType; prefix: string; period: string },
) {
  const currentValue = Number(counter.current_value);
  if (
    counter.counter_key !== expected.key ||
    counter.counter_type !== expected.type ||
    String(counter.prefix || "") !== expected.prefix ||
    String(counter.period || "") !== expected.period ||
    !Number.isSafeInteger(currentValue) ||
    currentValue < 0
  ) {
    console.error("[uid-counter] Invalid PocketBase counter record", {
      operation: "read uid_counters",
      counterId: counter.id,
      expected,
      actual: {
        counterKey: counter.counter_key,
        counterType: counter.counter_type,
        prefix: counter.prefix || "",
        period: counter.period || "",
        currentValue: counter.current_value,
      },
    });
    throw new UidCounterRequestError(
      "Bản ghi bộ đếm UID trong PocketBase không hợp lệ.",
      "UID_COUNTER_INVALID",
      500,
      "read uid_counters",
    );
  }
  return currentValue;
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
          updated_by: actor?.id || "",
          note: "Khởi tạo tự động từ dữ liệu hiện có",
        },
        undefined,
        adminToken,
      );
    }
    const currentValue = validateCounter(counter, {
      key: meta.key,
      type,
      prefix,
      period: meta.period,
    });
    const startValue = currentValue + 1;
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
        updated_by: actor?.id || "",
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
    if (counter) {
      const currentValue = validateCounter(counter, {
        key: meta.key,
        type,
        prefix,
        period: meta.period,
      });
      if (currentValue >= observed) return Response.json({ observed: false });
    }
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

async function executeRequest(body: AllocateBody, actor: AuthUser | null, token: string) {
  return body.action === "observe" ? observe(body, actor, token) : allocate(body, actor, token);
}

export async function handleUidCounterRequest(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as AllocateBody | null;
    if (!body) return jsonError("Dữ liệu yêu cầu không hợp lệ.");
    const actor = await getAuthUser(request);
    const adminAuth = await getAdminToken();
    if (!adminAuth.ok) return adminAuthError(adminAuth.reason);

    try {
      return await executeRequest(body, actor, adminAuth.token);
    } catch (error) {
      if (!(error instanceof UidCounterRequestError) || error.code !== "PB_AUTH_EXPIRED") {
        throw error;
      }
      cachedAdminToken = "";
      const refreshed = await getAdminToken();
      if (!refreshed.ok || refreshed.token === adminAuth.token) throw error;
      return await executeRequest(body, actor, refreshed.token);
    }
  } catch (error) {
    if (error instanceof UidCounterRequestError) {
      return structuredError(error.message, error.code, error.status, error.operation);
    }
    console.error("[uid-counter] Unexpected UID allocation error", {
      message: error instanceof Error ? error.message : String(error),
    });
    return structuredError("Không cấp được UID do lỗi máy chủ.", "PB_WRITE_FAILED", 500);
  }
}

export function resetUidCounterServerStateForTests() {
  cachedAdminToken = "";
  locks.clear();
}
