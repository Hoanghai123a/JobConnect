import { pb, type UserRecord } from "./pocketbase";

export type FactoryStatus = "active" | "inactive";

export interface FactoryRecord {
  id: string;
  code?: string;
  name: string;
  address?: string;
  hotline?: string;
  attendance_cutoff_day?: number;
  status: FactoryStatus;
  note?: string;
  created?: string;
  updated?: string;
}

export interface FactoryManagerRecord {
  id: string;
  factory: string;
  staff: string;
  active_from?: string;
  active_to?: string;
  status: FactoryStatus;
  note?: string;
  created?: string;
  updated?: string;
  expand?: {
    factory?: FactoryRecord;
    staff?: UserRecord;
  };
}

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
  status: EmploymentStatus;
  note?: string;
  created?: string;
  updated?: string;
  expand?: {
    user?: UserRecord;
    factory?: FactoryRecord;
    recruiter_staff?: UserRecord;
  };
}

export type StaffAction =
  | "create"
  | "update"
  | "delete"
  | "export"
  | "import"
  | "report_advance"
  | "report_leave"
  | "report_join"
  | "update_bank"
  | "check_payroll";

export interface StaffActionLogRecord {
  id: string;
  actor: string;
  actor_role_snapshot: string;
  target_user?: string;
  target_collection: string;
  target_record?: string;
  action: StaffAction;
  before?: unknown;
  after?: unknown;
  note?: string;
  created?: string;
  updated?: string;
  expand?: {
    actor?: UserRecord;
    target_user?: UserRecord;
  };
}

export const FACTORIES_COLLECTION = "factories";
export const FACTORY_MANAGERS_COLLECTION = "factory_managers";
export const EMPLOYMENT_HISTORIES_COLLECTION = "employment_histories";
export const STAFF_ACTION_LOGS_COLLECTION = "staff_action_logs";

export type StaffPermission =
  | "qlnm"        // ngu?i qu?n l? nh? m?y
  | "nvtd"        // nh?n vi?n tuy?n d?ng
  | "qlnm+nvtd";  // c? hai

export const STAFF_LOOKBACK_DAYS = 90;

export function isWithinLastDays(date: string | undefined, days = STAFF_LOOKBACK_DAYS): boolean {
  if (!date) return false;
  const ts = new Date(date).getTime();
  if (Number.isNaN(ts)) return false;
  const now = Date.now();
  return now - ts <= days * 24 * 60 * 60 * 1000;
}

export function pickLatestHistory(items: EmploymentHistoryRecord[]): EmploymentHistoryRecord | null {
  if (!items.length) return null;
  const working = items.find((it) => it.status === "working");
  if (working) return working;
  const sorted = [...items].sort((a, b) => {
    const aKey = (a.leave_date || a.join_date || a.created || "");
    const bKey = (b.leave_date || b.join_date || b.created || "");
    return bKey.localeCompare(aKey);
  });
  return sorted[0] ?? null;
}

export function isHistoryWithinScope(history: EmploymentHistoryRecord): boolean {
  if (history.status === "working") return true;
  if (isWithinLastDays(history.join_date)) return true;
  if (isWithinLastDays(history.leave_date)) return true;
  return false;
}

export function maskCCCD(value?: string): string {
  if (!value) return "";
  const trimmed = String(value).replace(/\s+/g, "");
  if (trimmed.length <= 4) return trimmed;
  const tail = trimmed.slice(-4);
  return `${"*".repeat(Math.max(0, trimmed.length - 4))}${tail}`;
}

export function fetchAllFactories() {
  return pb.collection(FACTORIES_COLLECTION).getFullList<FactoryRecord>({
    sort: "name",
  });
}