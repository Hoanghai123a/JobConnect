import { v4 as uuidv4 } from "uuid";
import { readStaffHoursExcel, type StaffHoursExcelRow } from "./staff-hours-import";
import { deduplicateImportRows, validateImportData } from "./staff-hours-import-validation";
import { pb, type StaffHoursDataSource } from "./pocketbase";

export interface AdminStaffHoursRecord {
  id: string;
  admin_id: string;
  batch_id: string;
  employee_code: string;
  employee_code_key?: string;
  full_name?: string;
  full_name_key?: string;
  factory_name?: string;
  factory_name_key?: string;
  month: string;
  hc_hours: number;
  tc_hours: number;
  total_hours: number;
  source: StaffHoursDataSource;
  note?: string;
  previous_record?: string;
  created: string;
  updated: string;
}

export interface AdminStaffHoursBatch {
  id: string;
  batchId: string;
  adminUserId: string;
  source: StaffHoursDataSource;
  months: string[];
  importedAt: string;
  successCount: number;
  errorCount: number;
  status: "completed" | "rolled_back";
}

export interface AdminStaffHoursPreview {
  batchId: string;
  source: StaffHoursDataSource;
  rows: StaffHoursExcelRow[];
  months: string[];
  successCount: number;
  errorCount: number;
  unmatchedRows: StaffHoursExcelRow[];
}

interface AdminStaffHoursCache {
  records: AdminStaffHoursRecord[];
  batches: AdminStaffHoursBatch[];
}

const RECORDS_COLLECTION = "admin_staff_hours";
const HISTORY_COLLECTION = "admin_staff_hours_import_history";
const CACHE_PREFIX = "jobconnect.admin_staff_hours.cache.v2:";

function cacheKey(adminUserId: string): string {
  return `${CACHE_PREFIX}${adminUserId}`;
}

function emptyCache(): AdminStaffHoursCache {
  return { records: [], batches: [] };
}

function readCache(adminUserId: string): AdminStaffHoursCache {
  if (typeof window === "undefined") return emptyCache();
  try {
    const raw = window.localStorage.getItem(cacheKey(adminUserId));
    if (!raw) return emptyCache();
    const value = JSON.parse(raw) as Partial<AdminStaffHoursCache>;
    return {
      records: Array.isArray(value.records) ? value.records : [],
      batches: Array.isArray(value.batches) ? value.batches : [],
    };
  } catch {
    return emptyCache();
  }
}

function writeCache(adminUserId: string, cache: AdminStaffHoursCache): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(cacheKey(adminUserId), JSON.stringify(cache));
  }
}

export function normalizeAdminSearch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ");
}

function rowKey(
  row: Pick<StaffHoursExcelRow, "employeeCode" | "factoryName" | "month">,
  source: StaffHoursDataSource,
): string {
  return `${source}|${row.month}|${row.employeeCode}|${normalizeAdminSearch(row.factoryName)}`;
}

function recordToRow(record: AdminStaffHoursRecord): StaffHoursExcelRow {
  return {
    rowNumber: 0,
    employeeCodeRaw: record.employee_code,
    employeeCode: record.employee_code_key || record.employee_code,
    fullName: record.full_name || "",
    factoryName: record.factory_name || "",
    month: record.month,
    hcHours: Number(record.hc_hours || 0),
    tcHours: Number(record.tc_hours || 0),
    note: record.note,
  };
}

function recordSnapshot(record: AdminStaffHoursRecord): Record<string, unknown> {
  return {
    admin_id: record.admin_id,
    batch_id: record.batch_id,
    employee_code: record.employee_code,
    employee_code_key: record.employee_code_key || normalizeAdminSearch(record.employee_code),
    full_name: record.full_name || "",
    full_name_key: record.full_name_key || normalizeAdminSearch(record.full_name || ""),
    factory_name: record.factory_name || "",
    factory_name_key: record.factory_name_key || normalizeAdminSearch(record.factory_name || ""),
    month: record.month,
    hc_hours: record.hc_hours || 0,
    tc_hours: record.tc_hours || 0,
    total_hours: record.total_hours || 0,
    source: record.source,
    note: record.note || "",
    previous_record: record.previous_record || "",
  };
}

function parseMonths(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return value
      .split(",")
      .map((month) => month.trim())
      .filter(Boolean);
  }
}

function buildFilter(adminUserId: string, month?: string, source?: StaffHoursDataSource): string {
  const filters = [`admin_id = "${adminUserId}"`];
  if (month) filters.push(`month = "${month}"`);
  if (source) filters.push(`source = "${source}"`);
  return filters.join(" && ");
}

function matchesScope(
  record: AdminStaffHoursRecord,
  month?: string,
  source?: StaffHoursDataSource,
): boolean {
  return (!month || record.month === month) && (!source || record.source === source);
}

export async function previewAdminStaffHours(
  file: File,
  fallbackMonth: string,
  source: StaffHoursDataSource,
): Promise<AdminStaffHoursPreview> {
  const parsedRows = await readStaffHoursExcel(file, fallbackMonth);
  if (parsedRows.length === 0) throw new Error("File Excel không có dữ liệu hợp lệ");

  const validationErrors = validateImportData(parsedRows);
  if (validationErrors.length > 0) {
    throw new Error(`Lỗi validation:\n${validationErrors.join("\n")}`);
  }

  const rows = deduplicateImportRows(parsedRows);

  return {
    batchId: uuidv4(),
    source,
    rows,
    months: [...new Set(rows.map((row) => row.month))],
    successCount: rows.length,
    errorCount: 0,
    unmatchedRows: [],
  };
}

export async function syncAdminStaffHours(
  adminUserId: string,
  options: { month?: string; source?: StaffHoursDataSource } = {},
): Promise<AdminStaffHoursRecord[]> {
  const records = await pb.collection(RECORDS_COLLECTION).getFullList<AdminStaffHoursRecord>({
    filter: buildFilter(adminUserId, options.month, options.source),
    sort: "-month,-total_hours,+employee_code_key,+factory_name_key",
  });
  const cache = readCache(adminUserId);
  const retained = cache.records.filter(
    (record) => !matchesScope(record, options.month, options.source),
  );
  const byId = new Map([...retained, ...records].map((record) => [record.id, record]));
  writeCache(adminUserId, { ...cache, records: [...byId.values()] });
  return records;
}

export function getCachedAdminStaffHours(
  adminUserId: string,
  month: string,
  source: StaffHoursDataSource,
  query = "",
): AdminStaffHoursRecord[] {
  const normalizedQuery = normalizeAdminSearch(query);
  return readCache(adminUserId).records.filter((record) => {
    if (record.month !== month || record.source !== source) return false;
    if (!normalizedQuery) return true;
    return [record.employee_code, record.full_name, record.factory_name]
      .filter(Boolean)
      .map((value) => normalizeAdminSearch(value || ""))
      .some((value) => value.includes(normalizedQuery));
  });
}

export async function executeAdminStaffHours(
  preview: AdminStaffHoursPreview,
  adminUserId: string,
): Promise<{ batchId: string; successCount: number; errorCount: number; errors: string[] }> {
  const rows = deduplicateImportRows(preview.rows);
  const existing = await pb.collection(RECORDS_COLLECTION).getFullList<AdminStaffHoursRecord>({
    filter: buildFilter(adminUserId),
  });
  const incomingKeys = new Set(rows.map((row) => rowKey(row, preview.source)));
  const previousByKey = new Map(
    existing
      .filter((record) => incomingKeys.has(rowKey(recordToRow(record), record.source)))
      .map((record) => [rowKey(recordToRow(record), record.source), record]),
  );

  for (const row of rows) {
    const previous = previousByKey.get(rowKey(row, preview.source));
    const payload = {
      admin_id: adminUserId,
      batch_id: preview.batchId,
      employee_code: row.employeeCodeRaw,
      employee_code_key: row.employeeCode,
      full_name: row.fullName,
      full_name_key: normalizeAdminSearch(row.fullName),
      factory_name: row.factoryName,
      factory_name_key: normalizeAdminSearch(row.factoryName),
      month: row.month,
      hc_hours: row.hcHours,
      tc_hours: row.tcHours,
      total_hours: row.hcHours + row.tcHours,
      source: preview.source,
      note: row.note || "",
      previous_record: previous ? JSON.stringify(recordSnapshot(previous)) : "",
    };

    if (previous) {
      await pb.collection(RECORDS_COLLECTION).update(previous.id, payload);
    } else {
      await pb.collection(RECORDS_COLLECTION).create(payload);
    }
  }

  await pb.collection(HISTORY_COLLECTION).create({
    admin_id: adminUserId,
    batch_id: preview.batchId,
    months: JSON.stringify(preview.months),
    source: preview.source,
    success_count: rows.length,
    error_count: 0,
    status: "completed",
  });

  await syncAdminStaffHours(adminUserId);
  await getAdminStaffHoursBatches(adminUserId);
  return { batchId: preview.batchId, successCount: rows.length, errorCount: 0, errors: [] };
}

export async function getAdminStaffHours(
  adminUserId: string,
  month: string,
  source: StaffHoursDataSource,
): Promise<AdminStaffHoursRecord[]> {
  await syncAdminStaffHours(adminUserId, { month, source });
  return getCachedAdminStaffHours(adminUserId, month, source);
}

export async function getAdminStaffHoursBatches(
  adminUserId: string,
): Promise<AdminStaffHoursBatch[]> {
  const records = await pb.collection(HISTORY_COLLECTION).getFullList<{
    id: string;
    admin_id: string;
    batch_id: string;
    months: string;
    source: StaffHoursDataSource;
    success_count: number;
    error_count: number;
    status: "completed" | "rolled_back";
    created: string;
  }>({
    filter: `admin_id = "${adminUserId}"`,
    sort: "-created",
  });

  const batches = records.map((record) => ({
    id: record.id,
    batchId: record.batch_id,
    adminUserId: record.admin_id,
    source: record.source,
    months: parseMonths(record.months),
    importedAt: record.created,
    successCount: Number(record.success_count || 0),
    errorCount: Number(record.error_count || 0),
    status: record.status,
  }));
  const cache = readCache(adminUserId);
  writeCache(adminUserId, { ...cache, batches });
  return batches;
}

export async function rollbackAdminStaffHours(adminUserId: string, batchId: string): Promise<void> {
  const records = await pb.collection(RECORDS_COLLECTION).getFullList<AdminStaffHoursRecord>({
    filter: `admin_id = "${adminUserId}" && batch_id = "${batchId}"`,
  });
  if (records.length === 0)
    throw new Error("Batch đã được thay thế hoặc không còn dữ liệu để rollback.");

  for (const record of records) {
    if (!record.previous_record) {
      await pb.collection(RECORDS_COLLECTION).delete(record.id);
      continue;
    }
    await pb
      .collection(RECORDS_COLLECTION)
      .update(record.id, JSON.parse(record.previous_record) as Record<string, unknown>);
  }

  const history = await pb
    .collection(HISTORY_COLLECTION)
    .getFirstListItem(`admin_id = "${adminUserId}" && batch_id = "${batchId}"`);
  await pb.collection(HISTORY_COLLECTION).update(history.id, {
    status: "rolled_back",
    note: "Import đã được rollback",
  });
  await syncAdminStaffHours(adminUserId);
  await getAdminStaffHoursBatches(adminUserId);
}
