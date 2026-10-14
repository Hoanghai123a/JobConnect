import type { InternalStaffHoursRecord } from "./pocketbase";

type StaffHoursSnapshot = Pick<
  InternalStaffHoursRecord,
  | "user"
  | "month"
  | "employee_code"
  | "full_name"
  | "factory_name"
  | "hc_hours"
  | "tc_hours"
  | "total_hours"
  | "source"
  | "batch_id"
  | "note"
>;

export function createStaffHoursSnapshot(record: InternalStaffHoursRecord): string {
  const snapshot: StaffHoursSnapshot = {
    user: record.user,
    month: record.month,
    employee_code: record.employee_code || "",
    full_name: record.full_name || "",
    factory_name: record.factory_name || "",
    hc_hours: record.hc_hours || 0,
    tc_hours: record.tc_hours || 0,
    total_hours: record.total_hours || 0,
    source: record.source,
    batch_id: record.batch_id,
    note: record.note || "",
  };
  return JSON.stringify(snapshot);
}

export function restoreStaffHoursSnapshot(value: string) {
  return {
    ...(JSON.parse(value) as StaffHoursSnapshot),
    previous_record: "",
  };
}
