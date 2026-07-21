import { pb, type UserRecord } from "./pocketbase";
import type { FactoryRecord } from "./factories";
import type { MainHouseRecord } from "./main-houses";
import type { CccdVersionRecord } from "./cccd-versions";
import { relationInFilter } from "./delegations";
import { updateCachedHistory, updateCachedUser } from "./staff-cache";
import { fetchAppSettings } from "./app-settings";

export type EmploymentStatus = "working" | "left";

export function deriveEmploymentStatus(
  history: { leave_date?: string | null },
  referenceDate: Date = new Date(),
): EmploymentStatus {
  if (!history.leave_date) return "working";
  const leave = new Date(history.leave_date);
  if (Number.isNaN(leave.getTime())) return "working";
  const leaveDay = new Date(leave.getFullYear(), leave.getMonth(), leave.getDate());
  const today = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
  );
  return leaveDay <= today ? "left" : "working";
}

export function isCurrentlyWorking(
  history: { leave_date?: string | null },
  referenceDate: Date = new Date(),
): boolean {
  return deriveEmploymentStatus(history, referenceDate) === "working";
}

export interface EmploymentHistoryRecord {
  id: string;
  uid?: string;
  user: string;
  factory: string;
  main_house?: string;
  employee_code?: string;
  worker_name_snapshot: string;
  worker_cccd_snapshot: string;
  worker_tax_code_snapshot?: string;
  recruiter_staff?: string;
  cccd_version?: string;
  join_date: string;
  leave_date?: string;
  status?: EmploymentStatus;
  note?: string;
  created?: string;
  updated?: string;
  expand?: {
    user?: UserRecord;
    factory?: FactoryRecord;
    main_house?: MainHouseRecord;
    recruiter_staff?: UserRecord;
    cccd_version?: CccdVersionRecord;
  };
}

export interface EmploymentDraft {
  user: string;
  factory: string;
  main_house?: string;
  employee_code?: string;
  worker_name_snapshot: string;
  worker_cccd_snapshot: string;
  worker_tax_code_snapshot?: string;
  recruiter_staff?: string;
  cccd_version?: string;
  join_date: string;
  leave_date?: string;
  status: EmploymentStatus;
  note?: string;
}

export function buildHistoryUid(prefix: string, year: number, month: number, seq: number): string {
  if (seq < 1 || seq > 9999) {
    throw new Error(`Employment history UID sequence overflow: ${seq} (max 9999 per month)`);
  }
  const yy = String(year % 100).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  const nnnn = String(seq).padStart(4, "0");
  return `${prefix}${yy}${mm}${nnnn}`;
}

export function extractHistoryUidSeq(
  uid: string | undefined,
  prefix: string,
  year: number,
  month: number,
): number {
  if (!uid) return 0;
  const yy = String(year % 100).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = uid.match(new RegExp(`^${escapedPrefix}${yy}${mm}(\\d{3,4})$`));
  return match ? parseInt(match[1], 10) : 0;
}

export function computeMaxHistoryUidSeq(
  histories: { uid?: string }[],
  prefix: string,
  year: number,
  month: number,
): number {
  let max = 0;
  for (const h of histories) {
    const n = extractHistoryUidSeq(h.uid, prefix, year, month);
    if (n > max) max = n;
  }
  return max;
}

export async function generateEmploymentHistoryUid(referenceDate = new Date()): Promise<string> {
  const settings = await fetchAppSettings();
  const prefix = (settings.account_code_prefix || "").trim();
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth() + 1;

  const res = await pb.collection("employment_histories").getFullList<{ uid?: string }>({
    fields: "uid",
  });
  return buildHistoryUid(
    prefix,
    year,
    month,
    computeMaxHistoryUidSeq(res, prefix, year, month) + 1,
  );
}

export async function fetchEmploymentHistories(userIds?: string[]) {
  const filter = userIds?.length ? relationInFilter("user", userIds) : "";
  return (await pb.collection("employment_histories").getFullList({
    filter,
    sort: "-join_date,-created",
    expand: "user,factory,recruiter_staff,main_house",
  })) as unknown as EmploymentHistoryRecord[];
}

export function isHistoryWithinLast90Days(
  history: EmploymentHistoryRecord,
  referenceDate = new Date(),
) {
  const windowStart = new Date(referenceDate);
  windowStart.setDate(windowStart.getDate() - 90);

  const joinDate = new Date(history.join_date);
  if (Number.isNaN(joinDate.getTime())) return false;

  const leaveDate = history.leave_date ? new Date(history.leave_date) : null;
  if (leaveDate && Number.isNaN(leaveDate.getTime())) return false;

  if (joinDate > referenceDate) return false;
  if (!leaveDate) return true;
  return leaveDate >= windowStart;
}

export function sortEmploymentHistories(histories: EmploymentHistoryRecord[]) {
  return [...histories].sort((a, b) => {
    const aCurrent = isCurrentlyWorking(a) ? 1 : 0;
    const bCurrent = isCurrentlyWorking(b) ? 1 : 0;
    if (aCurrent !== bCurrent) return bCurrent - aCurrent;

    const aTime = new Date(a.leave_date || a.join_date || a.created || 0).getTime();
    const bTime = new Date(b.leave_date || b.join_date || b.created || 0).getTime();
    return bTime - aTime;
  });
}

export function getLatestEmploymentHistory(histories: EmploymentHistoryRecord[]) {
  return sortEmploymentHistories(histories)[0] || null;
}

export function hasActiveEmployment(histories: EmploymentHistoryRecord[]) {
  return histories.some((item) => isCurrentlyWorking(item));
}

export async function findActiveEmploymentByUser(userId: string) {
  const list = (await pb.collection("employment_histories").getList(1, 1, {
    filter: `user="${userId}" && status="working"`,
    sort: "-join_date,-created",
    expand: "user,factory,recruiter_staff",
  })) as unknown as { items: EmploymentHistoryRecord[] };

  return list.items[0] || null;
}

export async function createEmploymentHistory(draft: EmploymentDraft, opts?: { uid?: string }) {
  const uid = opts?.uid || (await generateEmploymentHistoryUid());
  const record = (await pb
    .collection("employment_histories")
    .create(
      { ...draft, uid },
      { expand: "user,factory,recruiter_staff,main_house,cccd_version" },
    )) as unknown as EmploymentHistoryRecord;
  await updateCachedHistory(record);
  return record;
}

export async function updateEmploymentHistory(id: string, payload: Partial<EmploymentDraft>) {
  const record = (await pb.collection("employment_histories").update(id, payload, {
    expand: "user,factory,recruiter_staff,cccd_version",
  })) as unknown as EmploymentHistoryRecord;
  await updateCachedHistory(record);
  return record;
}

export async function updateUserAndCache(id: string, payload: Record<string, unknown> | FormData) {
  const record = (await pb.collection("users").update(id, payload)) as unknown as UserRecord;
  await updateCachedUser(record);
  return record;
}

export async function syncLegacyUserWorkFields(
  userId: string,
  latestHistory: EmploymentHistoryRecord | null,
) {
  const record = (await pb.collection("users").update(userId, {
    company: latestHistory?.expand?.factory?.name || "",
    employee_code: latestHistory?.employee_code || "",
  })) as unknown as UserRecord;
  await updateCachedUser(record);
}

export function maskCccd(cccd?: string | null) {
  const raw = (cccd || "").trim();
  if (!raw) return "Chưa có";
  if (raw.length <= 4) return raw;
  return `${"*".repeat(Math.max(0, raw.length - 4))}${raw.slice(-4)}`;
}

export interface RegisterableUserHistory {
  user: string;
  status?: string;
  leave_date?: string;
}

export async function fetchRegisterableUsers(opts: { includeLongLeft?: boolean } = {}) {
  const [users, histories] = await Promise.all([
    pb.collection("users").getFullList<UserRecord>({
      filter: 'role="user" || role=""',
      sort: "full_name,username",
    }),
    pb.collection("employment_histories").getFullList<RegisterableUserHistory>({
      fields: "user,status,leave_date",
    }),
  ]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff90 = new Date(today);
  cutoff90.setDate(cutoff90.getDate() - 90);

  const activeUserIds = new Set(
    histories.filter((h) => isCurrentlyWorking(h)).map((h) => h.user),
  );
  const recentUserIds = new Set(
    histories
      .filter((h) => {
        if (isCurrentlyWorking(h)) return true;
        if (!h.leave_date) return false;
        const d = new Date(h.leave_date);
        return !Number.isNaN(d.getTime()) && d >= cutoff90;
      })
      .map((h) => h.user),
  );
  const hasHistoryUserIds = new Set(histories.map((h) => h.user));

  return users.filter((u) => {
    if (activeUserIds.has(u.id)) return false;
    if (!hasHistoryUserIds.has(u.id)) return true;
    if (recentUserIds.has(u.id)) return false;
    return Boolean(opts.includeLongLeft);
  });
}
