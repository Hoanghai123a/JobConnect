/**
 * Stub file for staff-log - staff functionality removed
 */

export interface StaffActionLog {
  id?: string;
  actor?: any;
  targetUserId?: string;
  targetCollection?: string;
  targetRecord?: string;
  action?: string;
  before?: any;
  after?: any;
  note?: string;
}

/**
 * Stub: Does nothing
 */
export async function createStaffActionLog(data: StaffActionLog) {
  // No-op stub
  return null;
}

export const ACTION_TYPE_LABELS: Record<string, string> = {
  create: "Tạo mới",
  update: "Cập nhật",
  delete: "Xóa",
};

/**
 * Stub: Returns empty string
 */
export function formatStaffActionDateTime(date: string | Date): string {
  return "";
}

/**
 * Stub: Returns empty string
 */
export function getWorkerActionSummary(log: StaffActionLog): string {
  return "";
}
