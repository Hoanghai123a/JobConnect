import { normalizeEmployeeCode } from "./leaderboard";
import { parseExcelToRows } from "./excel";
import {
  validateImportData as validateImportRows,
  type ImportValidationRow,
} from "./staff-hours-import-validation";

export interface StaffHoursExcelRow {
  rowNumber: number;
  employeeCodeRaw: string;
  employeeCode: string; // Normalized
  fullName: string;
  factoryName: string;
  month: string;
  hcHours: number;
  tcHours: number;
  note?: string;
}

export interface StaffHoursImportResult {
  batchId: string;
  successCount: number;
  errorCount: number;
  errors: string[];
}

/**
 * Normalize giá trị giờ từ Excel
 */
function parseHours(value: unknown): number {
  if (typeof value === "number") return Math.max(0, value);
  const text = String(value || "")
    .trim()
    .replace(",", ".");
  const parsed = Number.parseFloat(text);
  return Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
}

/**
 * New template columns: Mã NV | Họ tên | Tên nhà máy | Tháng | Giờ HC | Giờ TC | Ghi chú
 */
function parseStaffHoursRow(
  row: string[],
  headers: Map<string, number>,
  rowNumber: number,
  fallbackMonth: string,
): StaffHoursExcelRow | null {
  const getValue = (names: string[], fallbackIndex?: number) => {
    const index = names.map((name) => headers.get(name)).find((value) => value !== undefined);
    return (row[index ?? fallbackIndex ?? -1] || "").trim();
  };
  const isNewTemplate = headers.has("gio hc") || headers.has("hc hours") || headers.has("hc_hours");

  const employeeCodeRaw = getValue(["ma nv", "employee code", "employee_code"], 0);
  if (!employeeCodeRaw) return null;

  const employeeCode = normalizeEmployeeCode(employeeCodeRaw);
  const fullName = getValue(["ho ten", "full name", "full_name"]);
  const factoryName = getValue(["ten nha may", "nha may", "factory", "factory name"]);
  const month = getValue(["thang", "month"]) || fallbackMonth;
  const hcHours = parseHours(getValue(["gio hc", "hc hours", "hc_hours"], isNewTemplate ? 4 : 1));
  const tcHours = parseHours(getValue(["gio tc", "tc hours", "tc_hours"], isNewTemplate ? 5 : 2));
  const note = getValue(["ghi chu", "note"], isNewTemplate ? 6 : 3) || undefined;

  return {
    rowNumber,
    employeeCodeRaw,
    employeeCode,
    fullName,
    factoryName,
    month,
    hcHours,
    tcHours,
    note,
  };
}

/**
 * Read Excel file và parse thành rows
 */
export async function readStaffHoursExcel(
  file: File,
  fallbackMonth: string,
): Promise<StaffHoursExcelRow[]> {
  const rows = await parseExcelToRows(file);
  if (rows.length === 0) return [];

  const normalizeHeader = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[._-]+/g, " ")
      .replace(/\s+/g, " ");
  const headers = new Map<string, number>();
  rows[0].forEach((header, index) => headers.set(normalizeHeader(header), index));

  // Skip header row
  const dataRows = rows.slice(1);

  const parsed: StaffHoursExcelRow[] = [];
  for (let i = 0; i < dataRows.length; i++) {
    const row = parseStaffHoursRow(dataRows[i], headers, i + 2, fallbackMonth);
    if (row) {
      parsed.push(row);
    }
  }

  return parsed;
}

/**
 * Validate import data trước khi execute
 */
export function validateImportData(rows: StaffHoursExcelRow[]): string[] {
  return validateImportRows(rows as ImportValidationRow[]);
}
