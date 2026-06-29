import { pb, type UserRecord } from "./pocketbase";
import type { FactoryRecord } from "./factories";
import type { MainHouseRecord } from "./main-houses";
import { relationInFilter } from "./delegations";
import { fetchAppSettings } from "./app-settings";

export type EmploymentStatus = "working" | "left";

export interface EmploymentHistoryRecord {
  id: string;
  uid?: string;
  user: string;
  factory: string;
  main_house?: string;
  employee_code?: string;
  worker_name_snapshot: string;
  worker_cccd_snapshot: string;
  recruiter_staff?: string;
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
  };
}

export interface EmploymentDraft {
  user: string;
  factory: string;
  main_house?: string;
  employee_code?: string;
  worker_name_snapshot: string;
  worker_cccd_snapshot: string;
  recruiter_staff?: string;
  join_date: string;
  leave_date?: string;
  status: EmploymentStatus;
  note?: string;
}

export function buildHistoryUid(prefix: string, year: number, month: number, seq: number): string {
  const yy = String(year % 100).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  const nnn = String(seq).padStart(3, "0");
  return `${prefix}${yy}${mm}${nnn}`;
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
  const match = uid.match(new RegExp(`^${escapedPrefix}${yy}${mm}(\\d{3})$`));
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
  return buildHistoryUid(prefix, year, month, computeMaxHistoryUidSeq(res, prefix, year, month) + 1);
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
    const aCurrent = a.status === "working" ? 1 : 0;
    const bCurrent = b.status === "working" ? 1 : 0;
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
  return histories.some((item) => item.status === "working" && !item.leave_date);
}

export async function findActiveEmploymentByUser(userId: string) {
  const list = (await pb.collection("employment_histories").getList(1, 1, {
    filter: `user="${userId}" && status="working"`,
    sort: "-join_date,-created",
    expand: "user,factory,recruiter_staff",
  })) as unknown as { items: EmploymentHistoryRecord[] };

  return list.items[0] || null;
}

export async function createEmploymentHistory(
  draft: EmploymentDraft,
  opts?: { uid?: string },
) {
  const uid = opts?.uid || (await generateEmploymentHistoryUid());
  return (await pb.collection("employment_histories").create(
    { ...draft, uid },
    { expand: "user,factory,recruiter_staff,main_house" },
  )) as unknown as EmploymentHistoryRecord;
}

export async function updateEmploymentHistory(id: string, payload: Partial<EmploymentDraft>) {
  return (await pb.collection("employment_histories").update(id, payload, {
    expand: "user,factory,recruiter_staff",
  })) as unknown as EmploymentHistoryRecord;
}

export async function syncLegacyUserWorkFields(
  userId: string,
  latestHistory: EmploymentHistoryRecord | null,
) {
  await pb.collection("users").update(userId, {
    company: latestHistory?.expand?.factory?.name || "",
    employee_code: latestHistory?.employee_code || "",
  });
}

export function maskCccd(cccd?: string | null) {
  const raw = (cccd || "").trim();
  if (!raw) return "Chưa có";
  if (raw.length <= 4) return raw;
  return `${"*".repeat(Math.max(0, raw.length - 4))}${raw.slice(-4)}`;
}
