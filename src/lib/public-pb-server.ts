import { getPBUpstream } from "@/lib/pocketbase-config";

type PbListResponse<T> = {
  items?: T[];
  totalPages?: number;
};

let cachedAdminToken: string | null = null;

function env(name: string) {
  const processValue = typeof process !== "undefined" ? process.env[name] || "" : "";
  if (processValue) return processValue;
  return (import.meta.env as Record<string, string | undefined>)?.[name] || "";
}

export function escapePublicPb(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function jsonPublicError(message: string, status = 400) {
  return Response.json({ message }, { status });
}

export async function readPublicJson(response: Response) {
  return response.json().catch(() => null);
}

export async function getPublicAdminToken() {
  if (cachedAdminToken) return cachedAdminToken;

  const directToken = env("PB_ADMIN_TOKEN");
  if (directToken) {
    cachedAdminToken = directToken;
    return cachedAdminToken;
  }

  const identity = env("PB_ADMIN_EMAIL");
  const password = env("PB_ADMIN_PASSWORD");
  if (!identity || !password) return "";

  for (const path of [
    "/api/collections/_superusers/auth-with-password",
    "/api/admins/auth-with-password",
  ]) {
    const response = await fetch(`${getPBUpstream()}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({ identity, password }),
    });
    const body = await readPublicJson(response);
    if (response.ok && body?.token) {
      cachedAdminToken = String(body.token);
      return cachedAdminToken;
    }
  }

  return "";
}

export async function publicPbFetch(path: string, init: RequestInit = {}, token = "") {
  const headers = new Headers(init.headers);
  headers.set("ngrok-skip-browser-warning", "true");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${getPBUpstream()}${path}`, { ...init, headers });
}

export async function listPublicPbRecords<T>(
  collection: string,
  params: Record<string, string> = {},
  token: string,
) {
  const rows: T[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const query = new URLSearchParams({
      page: String(page),
      perPage: "500",
      ...params,
    });
    const response = await publicPbFetch(
      `/api/collections/${encodeURIComponent(collection)}/records?${query}`,
      {},
      token,
    );
    if (!response.ok) {
      const body = await readPublicJson(response);
      throw new Error(body?.message || `Không tải được dữ liệu ${collection}.`);
    }
    const body = (await readPublicJson(response)) as PbListResponse<T> | null;
    rows.push(...(body?.items || []));
    totalPages = Math.max(1, Number(body?.totalPages || 1));
    page += 1;
  } while (page <= totalPages);

  return rows;
}
