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

export async function createStaffActionLog(input: StaffActionLogInput) {
  if (!input.actor?.id) return;

  await pb.collection("staff_action_logs").create({
    actor: input.actor.id,
    actor_role_snapshot: input.actor.role || "user",
    target_user: input.targetUserId || null,
    target_collection: input.targetCollection,
    target_record: input.targetRecord || "",
    action: input.action,
    before: input.before ?? null,
    after: input.after ?? null,
    note: input.note || "",
  });
}
