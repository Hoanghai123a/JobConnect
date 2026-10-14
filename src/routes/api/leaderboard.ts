import { createFileRoute } from "@tanstack/react-router";
import { getPBUpstream } from "@/lib/pocketbase-config";
import { getPublicAdminToken, publicPbFetch, readPublicJson } from "@/lib/public-pb-server";
import type { StaffHoursDataSource, UserRecord } from "@/lib/pocketbase";

interface StaffHoursRecord {
  id: string;
  user: string;
  month: string;
  employee_code?: string;
  full_name?: string;
  factory_name?: string;
  hc_hours: number;
  tc_hours: number;
  total_hours: number;
  created: string;
  expand?: { user?: UserRecord };
}

interface AdminStaffHoursRecord {
  id: string;
  admin_id: string;
  month: string;
  employee_code?: string;
  full_name?: string;
  factory_name?: string;
  hc_hours?: number;
  tc_hours?: number;
  total_hours?: number;
  created: string;
}

interface AttendanceRecord {
  id: string;
  user: string;
  date: string;
  hc_hours?: number;
  ot_hours?: number;
  created: string;
  expand?: { user?: UserRecord & { is_internal?: boolean } };
}

interface ListResponse<T> {
  items?: T[];
  totalPages?: number;
  message?: string;
}

function bearerToken(request: Request) {
  return /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
}

function jsonError(message: string, status = 400) {
  return Response.json({ message }, { status });
}

async function authenticate(request: Request) {
  const token = bearerToken(request);
  if (!token) return null;

  const response = await fetch(`${getPBUpstream()}/api/collections/users/auth-refresh`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "ngrok-skip-browser-warning": "true" },
  });
  const body = await readPublicJson(response);
  const user = body?.record as UserRecord | undefined;
  return response.ok && user?.id ? { token, user } : null;
}

async function fullList<T>(collection: string, params: Record<string, string>, token: string) {
  const rows: T[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const query = new URLSearchParams({ page: String(page), perPage: "500", ...params });
    const response = await publicPbFetch(
      `/api/collections/${encodeURIComponent(collection)}/records?${query}`,
      {},
      token,
    );
    const body = (await readPublicJson(response)) as ListResponse<T> | null;
    if (!response.ok) throw new Error(body?.message || `Không tải được ${collection}.`);
    rows.push(...(body?.items || []));
    totalPages = Math.max(1, Number(body?.totalPages || 1));
    page += 1;
  } while (page <= totalPages);
  return rows;
}

function mapEntry(record: StaffHoursRecord) {
  const user = record.expand?.user;
  return {
    rank: 0,
    userId: record.user,
    fullName: record.full_name || user?.full_name || user?.username || "Chưa xác định",
    employeeCode: record.employee_code || user?.employee_code || "",
    factoryName: record.factory_name || "",
    avatar: user?.avatar,
    avatarRecord: user
      ? { id: user.id, collectionId: user.collectionId, collectionName: user.collectionName }
      : undefined,
    hcHours: Number(record.hc_hours) || 0,
    tcHours: Number(record.tc_hours) || 0,
    totalHours: Number(record.total_hours) || 0,
    month: record.month,
    createdAt: record.created,
  };
}

function rankEntries(records: StaffHoursRecord[]) {
  return records
    .map(mapEntry)
    .sort(
      (a, b) =>
        b.totalHours - a.totalHours ||
        b.hcHours - a.hcHours ||
        a.fullName.localeCompare(b.fullName, "vi") ||
        (a.createdAt || "").localeCompare(b.createdAt || "") ||
        a.userId.localeCompare(b.userId),
    )
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function rankAdminEntries(records: AdminStaffHoursRecord[]) {
  return records
    .map((record) => ({
      rank: 0,
      userId: `admin-import:${record.id}`,
      fullName: record.full_name || "Chưa có tên",
      employeeCode: record.employee_code || "",
      factoryName: record.factory_name || "",
      hcHours: Number(record.hc_hours) || 0,
      tcHours: Number(record.tc_hours) || 0,
      totalHours: Number(record.total_hours) || 0,
      month: record.month,
      createdAt: record.created,
    }))
    .sort(
      (a, b) =>
        b.totalHours - a.totalHours ||
        b.hcHours - a.hcHours ||
        a.fullName.localeCompare(b.fullName, "vi") ||
        (a.createdAt || "").localeCompare(b.createdAt || "") ||
        a.userId.localeCompare(b.userId),
    )
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

async function selfCheckinRecords(month: string, token: string): Promise<StaffHoursRecord[]> {
  const [year, monthNumber] = month.split("-").map(Number);
  const end = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);
  const attendance = await fullList<AttendanceRecord>(
    "attendance",
    {
      filter: `date>="${month}-01" && date<"${end}"`,
      expand: "user",
      sort: "date",
    },
    token,
  );
  const byUser = new Map<string, StaffHoursRecord>();

  for (const row of attendance) {
    const user = row.expand?.user;
    if (!user?.is_internal) continue;
    const record = byUser.get(row.user) || {
      id: row.id,
      user: row.user,
      month,
      employee_code: user.employee_code || "",
      hc_hours: 0,
      tc_hours: 0,
      total_hours: 0,
      created: row.created,
      expand: { user },
    };
    record.hc_hours += Number(row.hc_hours) || 0;
    record.tc_hours += Number(row.ot_hours) || 0;
    record.total_hours = record.hc_hours + record.tc_hours;
    if (row.created < record.created) record.created = row.created;
    byUser.set(row.user, record);
  }

  return [...byUser.values()];
}

async function handleLeaderboard(request: Request) {
  try {
    const auth = await authenticate(request);
    if (!auth) return jsonError("Phiên đăng nhập không hợp lệ.", 401);

    const url = new URL(request.url);
    const month = url.searchParams.get("month") || "";
    const source = url.searchParams.get("source") || "";
    const requestedLimit = Number(url.searchParams.get("maxRankDisplay") || 10);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return jsonError("Tháng không hợp lệ.");
    if (source !== "admin_upload" && source !== "self_checkin")
      return jsonError("Nguồn dữ liệu không hợp lệ.");
    if (!Number.isInteger(requestedLimit) || requestedLimit < 3 || requestedLimit > 1000)
      return jsonError("Số lượng hiển thị không hợp lệ.");

    const isAdmin = auth.user.role === "admin";
    if (!isAdmin && !auth.user.is_internal)
      return jsonError("Bạn không có quyền xem bảng xếp hạng.", 403);

    if (source === "admin_upload" && !isAdmin) {
      return jsonError("Dữ liệu admin import chỉ dành cho admin đã nhập dữ liệu.", 403);
    }

    const adminToken = await getPublicAdminToken();
    if (!adminToken) return jsonError("Chưa cấu hình tài khoản quản trị PocketBase.", 503);

    const filter = `month="${month}" && source="${source}"`;
    const [records, settings] = await Promise.all([
      source === "self_checkin"
        ? selfCheckinRecords(month, adminToken)
        : fullList<AdminStaffHoursRecord>(
            "admin_staff_hours",
            {
              filter: `admin_id="${auth.user.id}" && ${filter}`,
              sort: "-total_hours,-hc_hours,+employee_code_key,+factory_name_key",
            },
            adminToken,
          ),
      fullList<{ max_rank_display?: number }>(
        "leaderboard_settings",
        { fields: "max_rank_display" },
        adminToken,
      ),
    ]);
    const entries =
      source === "admin_upload"
        ? rankAdminEntries(records as AdminStaffHoursRecord[])
        : rankEntries(records as StaffHoursRecord[]);

    if (isAdmin) return Response.json({ entries, totalParticipants: entries.length });

    const maxRankDisplay = Math.min(
      requestedLimit,
      Math.max(3, Number(settings[0]?.max_rank_display) || 10),
    );
    const userEntry = entries.find((entry) => entry.userId === auth.user.id);
    return Response.json({
      topEntries: entries.slice(0, maxRankDisplay),
      userEntry,
      userRank: userEntry?.rank,
      totalParticipants: entries.length,
    });
  } catch (error) {
    console.error("[leaderboard]", error);
    return jsonError("Không tải được bảng xếp hạng.", 502);
  }
}

export const Route = createFileRoute("/api/leaderboard")({
  server: { handlers: { GET: async ({ request }) => handleLeaderboard(request) } },
});
