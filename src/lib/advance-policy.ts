import { pb } from "./pocketbase";
import { escapePb } from "./pocketbase-utils";
import { fetchAppSettings, fetchAppSettingsStrict, type AppSettings } from "./app-settings";
import type { Role, UserRecord } from "./pocketbase";

export const ADVANCE_INTERACTION_DISABLED_MESSAGE =
  "Chức năng báo ứng đang tạm khóa. User hiện chỉ có thể xem dữ liệu.";

export function isAdvanceInteractionAllowed(
  settings: Pick<AppSettings, "advance_reporting_enabled"> | null | undefined,
  role?: Role,
) {
  return role === "admin" || settings?.advance_reporting_enabled !== false;
}

export async function assertAdvanceInteractionAllowed(role?: Role) {
  if (role === "admin") return;
  const settings = await fetchAppSettingsStrict();
  if (!isAdvanceInteractionAllowed(settings, role)) {
    throw new Error(ADVANCE_INTERACTION_DISABLED_MESSAGE);
  }
}

export type AdvancePolicyEmployment = {
  id: string;
  employee_code: string;
  worker_name_snapshot: string;
  join_date: string;
  leave_date?: string;
  recruiter_staff?: string;
};

export type AdvancePolicy = {
  factoryName: string;
  isWorking: boolean;
};

export type AdvancePolicyOptions = {
  actorRole?: Role;
  allowAfterLeave?: boolean;
};

const OUTSTANDING_FILTER =
  '(status="pending" || (status="accepted" && (recovery_status="" || recovery_status="none")))';

/**
 * Kiểm tra số lần ứng lương trong 1 ngày
 */
export async function checkAdvanceTodayCount(userId: string): Promise<number> {
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const filter = `user="${escapePb(userId)}" && created>="${startOfDay.toISOString()}" && created<"${endOfDay.toISOString()}"`;

  const rows = await pb.collection("advances").getFullList({
    filter,
    fields: "id",
  });

  return rows.length;
}

export async function loadAdvanceOutstanding(userId: string) {
  const rows = await pb.collection("advances").getFullList<{ amount?: number }>({
    filter: `user="${escapePb(userId)}" && ${OUTSTANDING_FILTER}`,
    fields: "amount",
  });
  return rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
}

interface EmploymentHistoryRecord {
  id: string;
  user: string;
  factory?: string;
  employee_code?: string;
  join_date?: string;
  leave_date?: string;
  recruiter_staff?: string;
  worker_name_snapshot?: string;
  expand?: {
    factory?: {
      id: string;
      name?: string;
    };
  };
}

export async function resolveAdvancePolicy(
  userId: string,
  options: AdvancePolicyOptions = {},
): Promise<AdvancePolicy> {
  const [settings, user] = await Promise.all([
    fetchAppSettings(),
    pb.collection("users").getOne<UserRecord>(escapePb(userId)),
  ]);

  // Kiểm tra user có bị chặn không
  const blockedUsers = settings?.advance_blocked_users || [];
  if (blockedUsers.includes(userId)) {
    throw new Error("Tài khoản của bạn đã bị chặn báo ứng. Vui lòng liên hệ admin.");
  }

  // Kiểm tra số lần ứng trong ngày
  const todayCount = await checkAdvanceTodayCount(userId);
  if (todayCount >= 2) {
    throw new Error("Bạn đã báo ứng 2 lần trong ngày hôm nay. Không thể báo ứng thêm.");
  }

  return {
    factoryName: "JobConnect",
    isWorking: true,
  };
}

export function validateAdvanceAmount(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Số tiền ứng không hợp lệ");
  }
}
