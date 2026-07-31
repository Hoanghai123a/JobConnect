import { pb, type UserRecord } from "./pocketbase";

export type StaffActionType =
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

export interface StaffActionLogInput {
  actor?: Partial<UserRecord> | null;
  targetUserId?: string;
  targetCollection: string;
  targetRecord?: string;
  action: StaffActionType;
  before?: unknown;
  after?: unknown;
  note?: string;
}

export interface StaffActionLogRecord {
  id: string;
  actor: string;
  actor_role_snapshot: string;
  target_user?: string;
  target_collection: string;
  target_record?: string;
  action: StaffActionType;
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

export type StaffActionLogChange = {
  field: string;
  label: string;
  before: string;
  after: string;
};

const ACTION_LABELS: Record<string, string> = {
  create: "Tạo mới",
  update: "Cập nhật",
  delete: "Xóa",
  export: "Xuất dữ liệu",
  import: "Nhập dữ liệu",
  report_advance: "Báo ứng lương",
  report_leave: "Báo nghỉ",
  report_join: "Báo đi làm mới",
  update_bank: "Cập nhật tài khoản ngân hàng",
  check_payroll: "Kiểm tra công lương",
};

const COLLECTION_LABELS: Record<string, string> = {
  users: "Hồ sơ NLĐ",
  employment_histories: "Lịch sử đi làm",
  advances: "Yêu cầu ứng lương",
  cccd_versions: "CCCD",
  salary_holds: "Giữ lương",
};

const FIELD_LABELS: Record<string, string> = {
  uid: "Mã tài khoản",
  username: "Tên đăng nhập",
  full_name: "Họ và tên",
  phone: "Số điện thoại",
  cccd: "CCCD",
  cccd_front: "Ảnh CCCD mặt trước",
  cccd_back: "Ảnh CCCD mặt sau",
  cccd_version: "Phiên bản CCCD",
  cccd_issue_date: "Ngày cấp CCCD",
  front_image: "Ảnh CCCD mặt trước",
  back_image: "Ảnh CCCD mặt sau",
  bank_name: "Ngân hàng",
  bank_account_number: "Số tài khoản",
  bank_account_name: "Tên chủ tài khoản",
  bank_account_note: "Ghi chú STK",
  factory: "Nhà máy",
  main_house: "Nhà chính",
  employee_code: "Mã nhân viên",
  worker_name_snapshot: "Họ tên tại thời điểm đi làm",
  worker_cccd_snapshot: "CCCD tại thời điểm đi làm",
  worker_date_of_birth_snapshot: "Ngày sinh tại thời điểm đi làm",
  worker_address_snapshot: "Địa chỉ tại thời điểm đi làm",
  hometown_snapshot: "Quê quán/địa chỉ",
  worker_tax_code_snapshot: "Mã số thuế",
  recruiter_staff: "Người tuyển",
  join_date: "Ngày vào làm",
  leave_date: "Ngày nghỉ",
  status: "Trạng thái",
  note: "Ghi chú",
  amount: "Số tiền",
  reason: "Lý do",
  payout_method: "Phương thức chi",
  recovery_status: "Trạng thái thu hồi",
};

const HIDDEN_FIELDS = new Set(["id", "created", "updated", "expand", "collectionId"]);
const SENSITIVE_FIELD_PATTERN = /(password|token|secret|cccd|bank_account_number|account_number)/i;

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function comparableValue(value: unknown) {
  if (value === undefined) return "__undefined__";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function maskDigits(value: string, prefix: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "Đã che";
  return `${prefix}${digits.slice(-4)}`;
}

export function getStaffActionLabel(action?: string) {
  return ACTION_LABELS[action || ""] || "Thao tác khác";
}

export function getStaffActionCollectionLabel(collection?: string) {
  return COLLECTION_LABELS[collection || ""] || collection || "Bản ghi liên quan";
}

export function getStaffActionFieldLabel(field: string) {
  return FIELD_LABELS[field] || field.replace(/_/g, " ");
}

export function formatStaffActionValue(field: string, value: unknown) {
  if (value === undefined || value === null || value === "") return "—";
  if (SENSITIVE_FIELD_PATTERN.test(field)) {
    if (/password|token|secret/i.test(field)) return "Đã che";
    return maskDigits(String(value), /cccd/i.test(field) ? "********" : "•••• ");
  }
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (typeof value === "number") return new Intl.NumberFormat("vi-VN").format(value);
  if (typeof value === "string") return value;
  return "Đã cập nhật";
}

export function getStaffActionLogChanges(log: Pick<StaffActionLogRecord, "before" | "after">) {
  const before = toRecord(log.before);
  const after = toRecord(log.after);
  if (!before && !after) return [] as StaffActionLogChange[];

  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...keys]
    .filter((field) => !HIDDEN_FIELDS.has(field))
    .filter((field) => comparableValue(before?.[field]) !== comparableValue(after?.[field]))
    .map((field) => ({
      field,
      label: getStaffActionFieldLabel(field),
      before: formatStaffActionValue(field, before?.[field]),
      after: formatStaffActionValue(field, after?.[field]),
    }));
}

export function formatStaffActionDateTime(value?: string) {
  if (!value) return "Không rõ thời gian";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export async function fetchStaffActionLogsForUser(userId: string, limit = 50) {
  if (!userId) return [] as StaffActionLogRecord[];
  const result = await pb.collection("staff_action_logs").getList<StaffActionLogRecord>(1, limit, {
    filter: `target_user="${userId}"`,
    sort: "-created",
    expand: "actor",
  });
  return result.items;
}

export async function createStaffActionLog(input: StaffActionLogInput) {
  if (!input.actor?.id) return;

  await pb.collection("staff_action_logs").create({
    actor: input.actor.id,
    actor_role_snapshot: input.actor.role || "user",
    target_user: input.targetUserId || "",
    target_collection: input.targetCollection,
    target_record: input.targetRecord || "",
    action: input.action,
    before: input.before ?? null,
    after: input.after ?? null,
    note: input.note || "",
  });
}
