export interface ImportValidationRow {
  rowNumber: number;
  employeeCode: string;
  factoryName: string;
  month: string;
  hcHours: number;
  tcHours: number;
}

function normalizeFactoryName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ");
}

function getImportRowKey(row: Pick<ImportValidationRow, "employeeCode" | "factoryName" | "month">): string {
  return JSON.stringify([row.month, row.employeeCode, normalizeFactoryName(row.factoryName)]);
}

/** Dòng sau cùng trong file được xem là giá trị cập nhật cho cùng một khóa. */
export function deduplicateImportRows<T extends ImportValidationRow>(rows: T[]): T[] {
  const rowsByKey = new Map<string, T>();
  for (const row of rows) rowsByKey.set(getImportRowKey(row), row);
  return [...rowsByKey.values()];
}

export function validateImportData(rows: ImportValidationRow[]): string[] {
  const errors: string[] = [];

  for (const row of rows) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(row.month)) {
      errors.push(`Dòng ${row.rowNumber}: Tháng phải có định dạng YYYY-MM (ví dụ 2026-10)`);
    }
    if (row.hcHours < 0 || row.tcHours < 0) {
      errors.push(`Dòng ${row.rowNumber}: Giờ không được âm`);
    }
    if (row.hcHours > 1000 || row.tcHours > 1000) {
      errors.push(`Dòng ${row.rowNumber}: Giờ vượt quá giới hạn hợp lý (>1000)`);
    }
  }

  return errors;
}
