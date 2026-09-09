import { pb } from "./pocketbase";
import { escapePb } from "./pocketbase-utils";
import { fetchAppSettings, fetchAppSettingsStrict, type AppSettings } from "./app-settings";
import type { Role } from "./pocketbase";

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

export type AdvancePolicy = {
  limit: number;
  outstanding: number;
  available: number;
};

export type AdvancePolicyOptions = {
  actorRole?: Role;
};

const OUTSTANDING_FILTER =
  '(status="pending" || (status="accepted" && (recovery_status="" || recovery_status="none")))';

export async function loadAdvanceOutstanding(userId: string) {
  const rows = await pb.collection("advances").getFullList<{ amount?: number }>({
    filter: `user="${escapePb(userId)}" && ${OUTSTANDING_FILTER}`,
    fields: "amount",
  });
  return rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
}

export async function resolveAdvancePolicy(
  userId: string,
  options: AdvancePolicyOptions = {},
): Promise<AdvancePolicy> {
  const [settings, outstanding] = await Promise.all([
    fetchAppSettings(),
    loadAdvanceOutstanding(userId),
  ]);

  // Default limit from settings or fallback
  const limit = Math.max(0, Number(settings?.default_advance_limit || 5000000));

  if (limit <= 0) {
    throw new Error("Chưa cài đặt hạn mức ứng tiền");
  }

  return {
    limit,
    outstanding,
    available: Math.max(0, limit - outstanding),
  };
}

export function validateAdvanceAmount(policy: AdvancePolicy, amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Số tiền ứng không hợp lệ");
  }
  if (policy.outstanding + amount > policy.limit) {
    throw new Error(
      `Vượt hạn mức ứng tiền. Đã ứng chưa thu hồi ${policy.outstanding.toLocaleString("vi-VN")} đ, còn có thể ứng ${policy.available.toLocaleString("vi-VN")} đ`,
    );
  }
}
