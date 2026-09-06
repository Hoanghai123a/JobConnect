import assert from "node:assert/strict";
import test from "node:test";

const { aggregate, calcSalary, distributeDay, EMPTY_BUCKETS } = await import("./salary.ts");

const baseRow = {
  date: "2099-01-05", // Monday, kept in the future so allowance checks cover one day.
  shift: "day",
  is_holiday: false,
  hc_hours: 8,
  ot_hours: 0,
};

test("trạng thái nghỉ không tạo giờ lương", () => {
  const buckets = EMPTY_BUCKETS();
  distributeDay({ ...baseRow, shift: "night", hc_hours: 8, ot_hours: 4, is_holiday: true, attendance_type: "off" }, buckets);
  assert.deepEqual(buckets, EMPTY_BUCKETS());
});

test("nghỉ phép luôn tính 8 giờ ca ngày hệ số 100%", () => {
  const buckets = aggregate([
    {
      ...baseRow,
      shift: "night",
      hc_hours: 0,
      ot_hours: 5,
      is_holiday: true,
      attendance_type: "paid_leave",
    },
  ]);
  assert.equal(buckets.r100, 8);
  assert.equal(buckets.r300, 0);
  assert.equal(buckets.r390, 0);
});

test("bản ghi cũ không có attendance_type giữ nguyên logic ca ngày", () => {
  const buckets = aggregate([{ ...baseRow, ot_hours: 2 }]);
  assert.equal(buckets.r100, 8);
  assert.equal(buckets.r150, 2);
});

test("giữ nguyên phân bổ ca đêm ngày thường", () => {
  const buckets = aggregate([{ ...baseRow, shift: "night", hc_hours: 10, ot_hours: 2 }]);
  assert.equal(buckets.r100, 4);
  assert.equal(buckets.r130, 6);
  assert.equal(buckets.r200, 1);
  assert.equal(buckets.r150, 1);
});

test("giữ nguyên phân bổ ca ngày Chủ nhật và ngày lễ", () => {
  const sunday = aggregate([{ ...baseRow, date: "2099-01-04", hc_hours: 8, ot_hours: 2 }]);
  assert.equal(sunday.r200, 10);

  const holiday = aggregate([{ ...baseRow, is_holiday: true, hc_hours: 8, ot_hours: 2 }]);
  assert.equal(holiday.r300, 10);
});

test("nghỉ phép giữ phụ cấp chuyên cần nhưng không tính phụ cấp đời sống", () => {
  const salary = calcSalary(EMPTY_BUCKETS(), {
    lcb: 0,
    chuyen_can: 100,
    doi_song: 260,
    tham_nien: 0,
    rows: [{ ...baseRow, attendance_type: "paid_leave" }],
    periodStart: baseRow.date,
  });
  assert.equal(salary.allowance, 100);
});

test("nghỉ làm mất phụ cấp chuyên cần và không tính phụ cấp đời sống", () => {
  const salary = calcSalary(EMPTY_BUCKETS(), {
    lcb: 0,
    chuyen_can: 100,
    doi_song: 260,
    tham_nien: 0,
    rows: [{ ...baseRow, attendance_type: "off" }],
    periodStart: baseRow.date,
  });
  assert.equal(salary.allowance, 0);
});
