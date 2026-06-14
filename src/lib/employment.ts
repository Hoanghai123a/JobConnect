import { pb, type UserRecord } from "./pocketbase";
import type { FactoryRecord } from "./factories";
import { relationInFilter } from "./delegations";

export type EmploymentStatus = "working" | "left";

export interface EmploymentHistoryRecord {
  id: string;
  user: string;
  factory: string;
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
    recruiter_staff?: UserRecord;
  };
}

export interface EmploymentDraft {
  user: string;
  factory: string;
  employee_code?: string;
  worker_name_snapshot: string;
  worker_cccd_snapshot: string;
  recruiter_staff?: string;
  join_date: string;
  leave_date?: string;
  status: EmploymentStatus;
  note?: string;
}

export async function fetchEmploymentHistories(userIds?: string[]) {
  const filter = userIds?.length ? relationInFilter("user", userIds) : "";
  return (await pb.collection("employment_histories").getFullList({
    filter,
    sort: "-join_date,-created",
    expand: "user,factory,recruiter_staff",
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

export async function createEmploymentHistory(draft: EmploymentDraft) {
  return (await pb.collection("employment_histories").create(draft, {
    expand: "user,factory,recruiter_staff",
  })) as unknown as EmploymentHistoryRecord;
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
