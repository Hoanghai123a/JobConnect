import { pb, type UserRecord } from "./pocketbase";
import type { FactoryRecord } from "./factories";
import type { MainHouseRecord } from "./main-houses";
import type { CccdVersionRecord } from "./cccd-versions";
import { relationInFilter } from "./delegations";
import { updateCachedHistory, updateCachedUser } from "./staff-cache";
import { fetchAppSettings } from "./app-settings";
import { normalizeDate } from "./date-utils";

export type EmploymentStatus = "working" | "left";

export function deriveEmploymentStatus(
  history: { leave_date?: string | null; status?: EmploymentStatus | null },
  referenceDate: Date = new Date(),
): EmploymentStatus {
  if (history.leave_date) {
    const leave = new Date(history.leave_date);
    if (!Number.isNaN(leave.getTime())) {
      const leaveDay = new Date(leave.getFullYear(), leave.getMonth(), leave.getDate());
      const today = new Date(
        referenceDate.getFullYear(),
        referenceDate.getMonth(),
        referenceDate.getDate(),
      );
      return leaveDay <= today ? "left" : "working";
    }
  }

  return history.status === "left" ? "left" : "working";
}

export function isCurrentlyWorking(
  history: { leave_date?: string | null; status?: EmploymentStatus | null },
  referenceDate: Date = new Date(),
): boolean {
  return deriveEmploymentStatus(history, referenceDate) === "working";
}

/**
 * Returns records whose stored status is still working even though their leave
 * date has already arrived. These records can violate the PocketBase partial
 * unique index until their status is synchronized to left.
 */
export function getStaleWorkingEmploymentHistories(
  histories: EmploymentHistoryRecord[],
  referenceDate: Date = new Date(),
) {
  return histories.filter(
    (history) =>
      history.status === "working" &&
      Boolean(history.leave_date) &&
      !isCurrentlyWorking(history, referenceDate),
  );
}

/** Detects PocketBase's field-level unique error for an employment user relation. */
export function isEmploymentUserUniqueError(error: unknown) {
  const data =
    typeof error === "object" && error !== null && "data" in error
      ? (error.data as { data?: Record<string, unknown> }).data
      : undefined;
  const userError = data?.user;
  const userMessage =
    typeof userError === "object" && userError !== null && "message" in userError
      ? String(userError.message)
      : String(userError || "");
  if (/unique/i.test(userMessage)) return true;

  const message = error instanceof Error ? error.message : String(error || "");
  return /unique/i.test(message) && /user|employment/i.test(message);
}

function startOfDay(referenceDate: Date) {
  return new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
}

function historyDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
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
  worker_date_of_birth_snapshot?: string;
  worker_address_snapshot?: string;
  hometown_snapshot?: string;
  cccd_issue_date?: string;
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
  worker_date_of_birth_snapshot: string;
  worker_address_snapshot: string;
  hometown_snapshot?: string;
  cccd_issue_date: string;
  worker_tax_code_snapshot?: string;
  recruiter_staff?: string;
  cccd_version?: string;
  join_date: string;
  leave_date?: string;
  status: EmploymentStatus;
  note?: string;
}

export type EmploymentPersonalSnapshot = Pick<
  EmploymentDraft,
  | "worker_name_snapshot"
  | "worker_cccd_snapshot"
  | "worker_date_of_birth_snapshot"
  | "worker_address_snapshot"
  | "cccd_issue_date"
>;

const SNAPSHOT_FIELD_LABELS: Record<keyof EmploymentPersonalSnapshot, string> = {
  worker_name_snapshot: "họ tên",
  worker_cccd_snapshot: "CCCD",
  worker_date_of_birth_snapshot: "ngày sinh",
  worker_address_snapshot: "địa chỉ thường trú",
  cccd_issue_date: "ngày cấp CCCD",
};

function cleanSnapshotText(value: unknown) {
  return String(value ?? "").trim();
}

/**
 * Trả về thông tin cá nhân đã lưu của một lịch sử.
 * Chỉ khi chưa có lịch sử mới lấy hồ sơ users làm dữ liệu gợi ý tạo mới.
 */
export function getEmploymentPersonalSnapshot(
  history?: Partial<EmploymentHistoryRecord> | null,
  user?: Partial<UserRecord> | null,
): EmploymentPersonalSnapshot {
  if (history) {
    return {
      worker_name_snapshot: cleanSnapshotText(history.worker_name_snapshot),
      worker_cccd_snapshot: cleanSnapshotText(history.worker_cccd_snapshot),
      worker_date_of_birth_snapshot: normalizeDate(history.worker_date_of_birth_snapshot),
      worker_address_snapshot:
        cleanSnapshotText(history.worker_address_snapshot) ||
        cleanSnapshotText(history.hometown_snapshot),
      cccd_issue_date: normalizeDate(history.cccd_issue_date),
    };
  }

  return {
    worker_name_snapshot: cleanSnapshotText(user?.full_name) || cleanSnapshotText(user?.username),
    worker_cccd_snapshot: cleanSnapshotText(user?.cccd),
    worker_date_of_birth_snapshot: normalizeDate(user?.date_of_birth),
    worker_address_snapshot: cleanSnapshotText(user?.address),
    cccd_issue_date: normalizeDate(user?.cccd_issue_date),
  };
}

export function getMissingEmploymentSnapshotFields(snapshot: Partial<EmploymentPersonalSnapshot>) {
  return (Object.keys(SNAPSHOT_FIELD_LABELS) as Array<keyof EmploymentPersonalSnapshot>)
    .filter((field) => !cleanSnapshotText(snapshot[field]))
    .map((field) => SNAPSHOT_FIELD_LABELS[field]);
}

const EDIT_REQUIRED_SNAPSHOT_FIELDS = [
  "worker_name_snapshot",
  "worker_cccd_snapshot",
] as const satisfies ReadonlyArray<keyof EmploymentPersonalSnapshot>;

export function getMissingEmploymentEditFields(snapshot: Partial<EmploymentPersonalSnapshot>) {
  return EDIT_REQUIRED_SNAPSHOT_FIELDS.filter((field) => !cleanSnapshotText(snapshot[field])).map(
    (field) => SNAPSHOT_FIELD_LABELS[field],
  );
}

function normalizeEmploymentPayload<T extends Partial<EmploymentDraft>>(payload: T): T {
  const normalized = { ...payload } as T & Partial<EmploymentDraft>;

  if ("worker_name_snapshot" in payload) {
    normalized.worker_name_snapshot = cleanSnapshotText(payload.worker_name_snapshot);
  }
  if ("worker_cccd_snapshot" in payload) {
    normalized.worker_cccd_snapshot = cleanSnapshotText(payload.worker_cccd_snapshot);
  }
  if ("worker_date_of_birth_snapshot" in payload) {
    normalized.worker_date_of_birth_snapshot = normalizeDate(payload.worker_date_of_birth_snapshot);
  }
  if ("cccd_issue_date" in payload) {
    normalized.cccd_issue_date = normalizeDate(payload.cccd_issue_date);
  }
  if ("worker_address_snapshot" in payload || "hometown_snapshot" in payload) {
    const address = cleanSnapshotText(payload.worker_address_snapshot ?? payload.hometown_snapshot);
    normalized.worker_address_snapshot = address;
    normalized.hometown_snapshot = address;
  }

  return normalized as T;
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
    expand: "user,factory,recruiter_staff,main_house,cccd_version",
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

    const aJoinTime = new Date(a.join_date || 0).getTime();
    const bJoinTime = new Date(b.join_date || 0).getTime();
    const aJoinValid = !Number.isNaN(aJoinTime);
    const bJoinValid = !Number.isNaN(bJoinTime);
    if (aJoinValid && bJoinValid && aJoinTime !== bJoinTime) return bJoinTime - aJoinTime;
    if (!aJoinValid && bJoinValid) return 1;
    if (aJoinValid && !bJoinValid) return -1;

    const aCreatedTime = new Date(a.created || 0).getTime();
    const bCreatedTime = new Date(b.created || 0).getTime();
    if (aCreatedTime !== bCreatedTime) return bCreatedTime - aCreatedTime;

    const aLeaveTime = new Date(a.leave_date || 0).getTime();
    const bLeaveTime = new Date(b.leave_date || 0).getTime();
    return bLeaveTime - aLeaveTime;
  });
}

export function getLatestEmploymentHistory(histories: EmploymentHistoryRecord[]) {
  return sortEmploymentHistories(histories)[0] || null;
}

/** Returns the employment record that was valid on the supplied calendar date. */
export function getEmploymentHistoryAtDate(
  histories: EmploymentHistoryRecord[],
  referenceDate: Date = new Date(),
) {
  const referenceDay = startOfDay(referenceDate);
  return (
    histories
      .filter((history) => {
        const joinDay = historyDate(history.join_date);
        if (!joinDay || joinDay > referenceDay) return false;
        const leaveDay = historyDate(history.leave_date);
        return !leaveDay || leaveDay > referenceDay;
      })
      .sort((a, b) => {
        const joinDiff =
          (historyDate(b.join_date)?.getTime() || 0) - (historyDate(a.join_date)?.getTime() || 0);
        if (joinDiff) return joinDiff;
        return new Date(b.created || 0).getTime() - new Date(a.created || 0).getTime();
      })[0] || null
  );
}

/** Returns the worker's current employment without using fields on the user record. */
export function getCurrentEmploymentHistory(
  histories: EmploymentHistoryRecord[],
  referenceDate: Date = new Date(),
) {
  return getEmploymentHistoryAtDate(histories, referenceDate);
}

export function getEmploymentIdentity(history: EmploymentHistoryRecord | null | undefined) {
  return {
    historyId: history?.id || "",
    employeeCode: history?.employee_code || "",
    factoryId: history?.factory || "",
    factoryName: history?.expand?.factory?.name || "",
  };
}

export function hasActiveEmployment(histories: EmploymentHistoryRecord[]) {
  return Boolean(getCurrentEmploymentHistory(histories));
}

export async function findActiveEmploymentByUser(userId: string) {
  const histories = (await pb.collection("employment_histories").getFullList({
    filter: `user="${userId}"`,
    sort: "-join_date,-created",
    expand: "user,factory,recruiter_staff,main_house",
  })) as unknown as EmploymentHistoryRecord[];

  return getCurrentEmploymentHistory(histories);
}

export async function createEmploymentHistory(draft: EmploymentDraft, opts?: { uid?: string }) {
  const normalizedDraft = normalizeEmploymentPayload(draft);
  const missingFields = getMissingEmploymentSnapshotFields(normalizedDraft);
  if (missingFields.length) {
    throw new Error(`Thiếu thông tin cá nhân của lịch sử đi làm: ${missingFields.join(", ")}.`);
  }

  const uid = opts?.uid || (await generateEmploymentHistoryUid());
  const record = (await pb
    .collection("employment_histories")
    .create(
      { ...normalizedDraft, uid },
      { expand: "user,factory,recruiter_staff,main_house,cccd_version" },
    )) as unknown as EmploymentHistoryRecord;
  await updateCachedHistory(record);
  return record;
}

export async function updateEmploymentHistory(id: string, payload: Partial<EmploymentDraft>) {
  const normalizedPayload = normalizeEmploymentPayload(payload);
  const record = (await pb.collection("employment_histories").update(id, normalizedPayload, {
    expand: "user,factory,recruiter_staff,cccd_version",
  })) as unknown as EmploymentHistoryRecord;
  await updateCachedHistory(record);
  return record;
}
export async function restoreEmploymentHistoryToWorking(
  id: string,
  payload: Partial<EmploymentDraft> = {},
) {
  return updateEmploymentHistory(id, {
    ...payload,
    leave_date: "",
    status: "working",
  });
}

export async function updateUserAndCache(id: string, payload: Record<string, unknown> | FormData) {
  const record = (await pb.collection("users").update(id, payload)) as unknown as UserRecord;
  await updateCachedUser(record);
  return record;
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

  const activeUserIds = new Set(histories.filter((h) => isCurrentlyWorking(h)).map((h) => h.user));
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
