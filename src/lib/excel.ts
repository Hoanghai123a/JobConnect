import * as XLSX from "xlsx";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function formatDateOnly(value: string | number | Date | undefined | null): string {
  if (!value) return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    return `${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${value.getFullYear()}`;
  }
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    return parsed ? `${pad(parsed.d)}/${pad(parsed.m)}/${parsed.y}` : "";
  }

  const text = String(value).trim();
  if (!text) return "";

  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return `${pad(Number(iso[3]))}/${pad(Number(iso[2]))}/${iso[1]}`;

  const vn = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (vn) return `${pad(Number(vn[1]))}/${pad(Number(vn[2]))}/${vn[3]}`;

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return `${pad(parsed.getDate())}/${pad(parsed.getMonth() + 1)}/${parsed.getFullYear()}`;
  }

  return text.replace(/[T ]\d{2}:\d{2}.*$/, "");
}

export function exportToExcel(filename: string, sheets: Record<string, any[]>) {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : filename + ".xlsx");
}
