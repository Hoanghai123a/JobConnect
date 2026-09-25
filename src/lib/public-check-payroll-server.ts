import { getPublicAdminToken, jsonPublicError, listPublicPbRecords } from "@/lib/public-pb-server";

type PbRecord = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCode(value: unknown) {
  return text(value).replace(/\s+/g, "").toLocaleLowerCase("vi-VN");
}

function normalizeText(value: unknown) {
  return text(value).replace(/\s+/g, " ").toLocaleLowerCase("vi-VN");
}

function objectValue(value: unknown): PbRecord {
  return typeof value === "object" && value ? (value as PbRecord) : {};
}

function matchesCompany(row: PbRecord, wantedCompany: string) {
  if (!wantedCompany) return true;
  const company = text(row.company) || text(objectValue(row.personal).company);
  return !company || normalizeText(company) === normalizeText(wantedCompany);
}

function sanitizeBatch(value: unknown) {
  const batch = objectValue(value);
  return {
    id: text(batch.id),
    month: text(batch.month),
    round_no: Number(batch.round_no || 0),
    note: text(batch.note),
    created: text(batch.created),
  };
}

function sanitizeAttendance(row: PbRecord) {
  return {
    id: text(row.id),
    batch: text(row.batch),
    user: "",
    month: text(row.month),
    round_no: Number(row.round_no || 0),
    full_name: text(row.full_name),
    rows: Array.isArray(row.rows) ? row.rows : [],
    summary: objectValue(row.summary),
    created: text(row.created),
    expand: row.expand ? { batch: sanitizeBatch(objectValue(row.expand).batch) } : undefined,
  };
}

function sanitizeSalary(row: PbRecord) {
  const personal = objectValue(row.personal);
  return {
    id: text(row.id),
    batch: text(row.batch),
    user: "",
    month: text(row.month),
    round_no: Number(row.round_no || 0),
    personal: {
      employee_code: text(row.employee_code) || text(personal.employee_code),
      company: text(row.company) || text(personal.company),
      full_name: text(row.full_name) || text(personal.full_name),
      start_date: text(personal.start_date),
      end_date: text(personal.end_date),
      base_salary: Number(personal.base_salary || 0),
      standard_workdays: Number(personal.standard_workdays || 0),
    },
    wage_lines: Array.isArray(row.wage_lines) ? row.wage_lines : [],
    allowance_lines: Array.isArray(row.allowance_lines) ? row.allowance_lines : [],
    deduction_lines: Array.isArray(row.deduction_lines) ? row.deduction_lines : [],
    totals: objectValue(row.totals),
    created: text(row.created),
    expand: row.expand ? { batch: sanitizeBatch(objectValue(row.expand).batch) } : undefined,
  };
}

export async function handlePublicCheckPayroll(request: Request) {
  const body = objectValue(await request.json().catch(() => null));
  const employeeCode = text(body.employee_code);
  const company = text(body.company);

  if (employeeCode.length < 1 || employeeCode.length > 80) {
    return jsonPublicError("Vui lòng nhập mã nhân viên hợp lệ.");
  }

  const token = await getPublicAdminToken();
  if (!token) return jsonPublicError("Backend chưa cấu hình quyền tra cứu guest.", 503);

  try {
    const [histories, attendance, salary] = await Promise.all([
      listPublicPbRecords<PbRecord>("employment_histories", { sort: "-created" }, token),
      listPublicPbRecords<PbRecord>(
        "check_attendance_items",
        { sort: "-created", expand: "batch" },
        token,
      ),
      listPublicPbRecords<PbRecord>(
        "check_salary_items",
        { sort: "-created", expand: "batch" },
        token,
      ),
    ]);

    const code = normalizeCode(employeeCode);
    const matchedUserIds = new Set(
      histories
        .filter((row) => normalizeCode(row.employee_code) === code && matchesCompany(row, company))
        .map((row) => text(row.user))
        .filter(Boolean),
    );

    const matches = (row: PbRecord) => {
      const personal = objectValue(row.personal);
      const directCode = text(row.employee_code) || text(personal.employee_code);
      if (directCode) {
        return normalizeCode(directCode) === code && matchesCompany(row, company);
      }
      return matchedUserIds.has(text(row.user));
    };

    return Response.json({
      employee_code: employeeCode,
      company,
      attendance: attendance.filter(matches).slice(0, 100).map(sanitizeAttendance),
      salary: salary.filter(matches).slice(0, 100).map(sanitizeSalary),
    });
  } catch (error: unknown) {
    return jsonPublicError(
      error instanceof Error ? error.message : "Không tải được dữ liệu check công/lương.",
      502,
    );
  }
}
