import assert from "node:assert/strict";
import test from "node:test";

const { deduplicateImportRows, validateImportData } = await import("./staff-hours-import-validation.ts");

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

test("accepts duplicate employee rows for the same month and factory", () => {
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

  assert.deepEqual(errors, []);
});

test("uses the last duplicate row as the update", () => {
  const rows = deduplicateImportRows([
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

  assert.equal(rows.length, 1);
  assert.equal(rows[0].rowNumber, 3);
  assert.equal(rows[0].hcHours, 168);
});
