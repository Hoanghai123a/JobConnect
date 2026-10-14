import assert from "node:assert/strict";
import test from "node:test";

const { validateImportData } = await import("./staff-hours-import-validation.ts");

test("accepts multiple months and duplicate employee codes across factories", () => {
  const errors = validateImportData([
    {
      rowNumber: 2,
      employeeCode: "NV001",
      factoryName: "Nhà máy A",
      month: "2026-09",
      hcHours: 160,
      tcHours: 10,
    },
    {
      rowNumber: 3,
      employeeCode: "NV001",
      factoryName: "Nhà máy B",
      month: "2026-10",
      hcHours: 168,
      tcHours: 8,
    },
  ]);

  assert.deepEqual(errors, []);
});

test("rejects duplicate employee rows for the same month and factory", () => {
  const errors = validateImportData([
    {
      rowNumber: 2,
      employeeCode: "NV001",
      factoryName: "Nhà máy A",
      month: "2026-09",
      hcHours: 160,
      tcHours: 10,
    },
    {
      rowNumber: 3,
      employeeCode: "NV001",
      factoryName: "  nhà máy a ",
      month: "2026-09",
      hcHours: 168,
      tcHours: 8,
    },
  ]);

  assert.equal(errors.length, 1);
  assert.match(errors[0], /trùng lặp trong tháng 2026-09/);
});
