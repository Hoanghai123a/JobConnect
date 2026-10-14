import assert from "node:assert/strict";
import test from "node:test";

const { createStaffHoursSnapshot, restoreStaffHoursSnapshot } =
  await import("./staff-hours-import-snapshot.ts");

test("rollback snapshot restores imported fields without retaining stale snapshot", () => {
  const record = {
    user: "user-1",
    month: "2026-10",
    employee_code: "NV-01",
    full_name: "Nguyễn Văn A",
    factory_name: "Nhà máy A",
    hc_hours: 160,
    tc_hours: 12,
    total_hours: 172,
    source: "admin_upload",
    batch_id: "old-batch",
    previous_record: "stale",
    note: "Điều chỉnh",
  };

  assert.deepEqual(restoreStaffHoursSnapshot(createStaffHoursSnapshot(record)), {
    user: "user-1",
    month: "2026-10",
    employee_code: "NV-01",
    full_name: "Nguyễn Văn A",
    factory_name: "Nhà máy A",
    hc_hours: 160,
    tc_hours: 12,
    total_hours: 172,
    source: "admin_upload",
    batch_id: "old-batch",
    note: "Điều chỉnh",
    previous_record: "",
  });
});
