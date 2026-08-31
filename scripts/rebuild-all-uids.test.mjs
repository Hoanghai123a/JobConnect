import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHistoryPlanFromRecords,
  buildUserPlanFromRecords,
  createTemporaryUids,
  parseArgs,
  parseHistoryDate,
} from "./rebuild-all-uids.mjs";

test("parseArgs yêu cầu xác nhận maintenance và nhận output dir", () => {
  assert.deepEqual(parseArgs(["--apply", "--maintenance-confirmed", "--output-dir", "out"]), {
    apply: true,
    allowCreatedDateFallback: false,
    maintenanceConfirmed: true,
    outputDir: "out",
  });
});

test("buildUserPlanFromRecords chuẩn hóa theo thứ tự đã tải", () => {
  const plan = buildUserPlanFromRecords(
    [
      { id: "a", uid: "HL000002" },
      { id: "b", uid: "HL000001" },
    ],
    "HL",
  );
  assert.deepEqual(plan.map((item) => item.new_uid), ["HL000001", "HL000002"]);
  assert.ok(plan.every((item) => item.changed));
});

test("buildHistoryPlanFromRecords dừng khi thiếu join_date", () => {
  assert.throws(
    () => buildHistoryPlanFromRecords([{ id: "h1", uid: "", created: "2026-08-01 08:00:00" }], "HL"),
    /join_date/,
  );
});

test("buildHistoryPlanFromRecords chỉ fallback created khi được yêu cầu", () => {
  const result = buildHistoryPlanFromRecords(
    [{ id: "h1", uid: "", created: "2026-08-01 08:00:00" }],
    "HL",
    { allowCreatedDateFallback: true },
  );
  assert.equal(result.plan[0].new_uid, "HL26080001");
  assert.equal(result.plan[0].uid_date_source, "created");
});

test("parseHistoryDate không phụ thuộc timezone của máy chạy", () => {
  assert.deepEqual(parseHistoryDate("2026-01-31 23:59:59"), { year: 2026, month: 1 });
  assert.equal(parseHistoryDate("2026-13-01"), null);
  assert.equal(parseHistoryDate("2026-02-31"), null);
});

test("createTemporaryUids tạo UID tạm không trùng và tôn trọng max", () => {
  const values = createTemporaryUids({
    currentUids: ["TAAAA000", "HL000001"],
    count: 3,
    uidField: { min: 0, max: 20, pattern: "" },
  });
  assert.equal(new Set(values).size, 3);
  assert.ok(values.every((value) => value.length <= 20 && value.startsWith("T")));
});
