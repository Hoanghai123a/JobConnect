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

export function validateImportData(rows: ImportValidationRow[]): string[] {
  const errors: string[] = [];
  const rowsByEmployeeMonthFactory = new Map<string, number[]>();

  for (const row of rows) {
    const key = JSON.stringify([
      row.month,
      row.employeeCode,
      normalizeFactoryName(row.factoryName),
    ]);
    const rowNumbers = rowsByEmployeeMonthFactory.get(key) || [];
    rowNumbers.push(row.rowNumber);
    rowsByEmployeeMonthFactory.set(key, rowNumbers);
  }

  for (const [key, rowNumbers] of rowsByEmployeeMonthFactory) {
    if (rowNumbers.length > 1) {
      const [month, code, factory] = JSON.parse(key) as [string, string, string];
      errors.push(
        `Mã NV "${code}" trùng lặp trong tháng ${month}${factory ? ` tại nhà máy ${factory}` : ""} ở dòng ${rowNumbers.join(", ")}`,
      );
    }
  }

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
