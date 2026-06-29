import * as XLSX from "xlsx";

/**
 * Normalize various date formats to yyyy-mm-dd string.
 * Handles: Excel serial numbers, Date objects, dd-mm-yyyy, dd/mm/yyyy, yyyy-mm-dd.
 */
export function normalizeDate(value: unknown): string {
  if (value == null || value === "") return "";

  if (typeof value === "number") {
    const d = XLSX.SSF.parse_date_code(value);
    if (d) {
      return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    }
    return "";
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    return value.toISOString().slice(0, 10);
  }

  const text = String(value).trim();
  if (!text) return "";

  // yyyy-mm-dd
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(text)) {
    const [y, m, d] = text.split(/[-/]/);
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // dd-mm-yyyy or dd/mm/yyyy
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(text)) {
    const [d, m, y] = text.split(/[-/]/);
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // Fallback: try native Date parse
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return "";
}
