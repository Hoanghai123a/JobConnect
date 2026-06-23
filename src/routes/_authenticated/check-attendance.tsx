import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { fileUrl, pb } from "@/lib/pocketbase";
import { useAuth } from "@/lib/auth";
import { AppHeader } from "@/components/layout/BottomNav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatVND, type AttendanceRow, type RateBuckets, type Shift } from "@/lib/salary";
import { exportToExcel } from "@/lib/excel";
import { escapePb } from "@/lib/delegations";
import { markSeen } from "@/lib/seen";
import {
  buildPayrollCalendarCells,
  fetchFactoryAttendanceCutoffDay,
  getPayrollPeriod,
  type PayrollPeriod,
} from "@/lib/payroll-cycle";
import { cn } from "@/lib/utils";
import {
  CalendarCheck,
  FileDown,
  FileSpreadsheet,
  Moon,
  Send,
  Sun,
  Upload,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/check-attendance")({
  component: CheckAttendancePage,
});

type BatchRecord = {
  id: string;
  month: string;
  round_no: number;
  note?: string;
  total_users?: number;
  total_rows?: number;
  source_file?: string;
  created?: string;
  collectionId: string;
  collectionName: string;
};

type CheckItemRecord = {
  id: string;
  batch: string;
  user: string;
  month: string;
  round_no: number;
  rows: CheckAttendanceRow[];
  summary?: Partial<RateBuckets>;
  created?: string;
  expand?: { batch?: BatchRecord };
};

type SalaryPersonalInfo = {
  employee_code: string;
  company: string;
  start_date: string;
  end_date: string;
  base_salary: number;
  standard_workdays: number;
};

type SalaryWageLine = {
  rate: string;
  hours: number;
  amount: number;
};

type SalaryMoneyLine = {
  label: string;
  amount: number;
};

type SalaryTotals = {
  wage: number;
  allowance: number;
  deduction: number;
  net: number;
};

type SalaryItemRecord = {
  id: string;
  batch: string;
  user: string;
  month: string;
  round_no: number;
  personal: SalaryPersonalInfo;
  wage_lines: SalaryWageLine[];
  allowance_lines: SalaryMoneyLine[];
  deduction_lines: SalaryMoneyLine[];
  totals: SalaryTotals;
  created?: string;
  expand?: { batch?: BatchRecord };
};

type UserRecord = {
  id: string;
  full_name?: string;
  username?: string;
  phone?: string;
  company?: string;
  employee_code?: string;
};

type CheckAttendanceRow = AttendanceRow;

type ParsedRow = CheckAttendanceRow & {
  employeeCode: string;
  company: string;
  rates: RateBuckets;
};

type ParsedSalaryRow = {
  employeeCode: string;
  company: string;
  personal: SalaryPersonalInfo;
  wageLine?: SalaryWageLine;
  allowanceLine?: SalaryMoneyLine;
  deductionLine?: SalaryMoneyLine;
};

const EMPTY_CHECK_BUCKETS = (): RateBuckets => ({
  r100: 0,
  r130: 0,
  r150: 0,
  r200: 0,
  r270: 0,
  r300: 0,
  r390: 0,
});

function normalizeBuckets(summary?: Partial<RateBuckets>) {
  return {
    ...EMPTY_CHECK_BUCKETS(),
    ...(summary || {}),
  };
}

function hasRateValues(rates: RateBuckets) {
  return Object.values(rates).some((value) => Number(value) > 0);
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function ym(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function todayMonth() {
  return ym(new Date());
}

function monthStringToDate(month: string) {
  const [year, monthValue] = month.split("-").map(Number);
  return new Date(year || new Date().getFullYear(), (monthValue || 1) - 1, 1);
}

function formatTemplateDate(month: string, day: number) {
  const [year, monthValue] = month.split("-");
  return `${pad(day)}/${pad(Number(monthValue))}/${year}`;
}

function formatDisplayDate(value?: string) {
  if (!value) return "—";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

const normalize = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]/g, "");

const pick = (row: Record<string, unknown>, keys: string[]) => {
  const normalized = new Map(Object.keys(row).map((key) => [normalize(key), key]));
  for (const key of keys) {
    const sourceKey = normalized.get(normalize(key));
    if (sourceKey) return row[sourceKey];
  }
  return "";
};

function parseExcelDate(value: unknown) {
  if (typeof value === "number") {
    const d = XLSX.SSF.parse_date_code(value);
    if (d) return `${d.y}-${pad(d.m)}-${pad(d.d)}`;
  }
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return `${iso[1]}-${pad(Number(iso[2]))}-${pad(Number(iso[3]))}`;
  const vn = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (vn) return `${vn[3]}-${pad(Number(vn[2]))}-${pad(Number(vn[1]))}`;
  return raw.substring(0, 10);
}

function parseShift(value: unknown): Shift {
  const text = normalize(value);
  return text.includes("dem") || text.includes("night") ? "night" : "day";
}

function parseBool(value: unknown) {
  const text = normalize(value);
  return ["1", "x", "yes", "true", "le", "holiday"].includes(text);
}

function parseNumber(value: unknown) {
  if (typeof value === "number") return value;
  let text = String(value ?? "").trim();
  if (!text) return 0;
  text = text.replace(/\s/g, "").replace(/[^\d,.-]/g, "");
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    text = lastComma > lastDot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else if (lastComma >= 0) {
    text = text.replace(",", ".");
  } else if ((text.match(/\./g) || []).length > 1) {
    text = text.replace(/\./g, "");
  } else if (/^\d{1,3}\.\d{3}$/.test(text)) {
    text = text.replace(".", "");
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function calculateSalaryTotals({
  wageLines,
  allowanceLines,
  deductionLines,
}: {
  wageLines: SalaryWageLine[];
  allowanceLines: SalaryMoneyLine[];
  deductionLines: SalaryMoneyLine[];
}): SalaryTotals {
  const wage = wageLines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const allowance = allowanceLines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const deduction = deductionLines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  return {
    wage,
    allowance,
    deduction,
    net: wage + allowance - deduction,
  };
}

function formatSalaryRate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.includes("%")) return raw;

  const numeric = parseNumber(raw);
  if (!numeric) return raw;

  const percent = numeric <= 10 ? numeric * 100 : numeric;
  return `${Number.isInteger(percent) ? percent : Number(percent.toFixed(2))}%`;
}

async function readAttendanceExcel(file: File): Promise<ParsedRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  return rawRows
    .map((row) => {
      const employeeCode = String(pick(row, ["Mã NV", "Ma NV", "employee_code"])).trim();
      const rates = {
        r100: parseNumber(pick(row, ["100%", "100", "r100"])),
        r130: parseNumber(pick(row, ["130%", "130", "r130"])),
        r150: parseNumber(pick(row, ["150%", "150", "r150"])),
        r200: parseNumber(pick(row, ["200%", "200", "r200"])),
        r270: parseNumber(pick(row, ["270%", "270", "r270"])),
        r300: parseNumber(pick(row, ["300%", "300", "r300"])),
        r390: parseNumber(pick(row, ["390%", "390", "r390"])),
      };
      return {
        employeeCode,
        company: String(pick(row, ["Nhà máy", "Công ty", "company", "factory"])).trim(),
        rates,
        date: parseExcelDate(pick(row, ["Ngày", "date", "Ngày công"])),
        shift: parseShift(pick(row, ["Ca", "shift"])),
        is_holiday: parseBool(pick(row, ["Lễ", "Ngày lễ", "is_holiday", "holiday"])),
        hc_hours: parseNumber(pick(row, ["Giờ HC", "HC", "hc_hours", "Giờ hành chính"])),
        ot_hours: parseNumber(pick(row, ["Giờ TC", "TC", "ot_hours", "Giờ tăng ca"])),
      };
    })
    .filter((row) => row.employeeCode && row.company && (row.date || hasRateValues(row.rates)));
}

async function readSalaryExcel(file: File): Promise<ParsedSalaryRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  return rawRows
    .map((row) => {
      const employeeCode = String(pick(row, ["Mã NV", "Ma NV", "employee_code"])).trim();
      const company = String(pick(row, ["Nhà máy", "Công ty", "company", "factory"])).trim();
      const wageLine = {
        rate: formatSalaryRate(pick(row, ["Hệ số", "He so", "rate", "coefficient"])),
        hours: parseNumber(pick(row, ["Số giờ", "So gio", "hours"])),
        amount: parseNumber(pick(row, ["Thành tiền", "Thanh tien", "Tiền lương", "wage_amount"])),
      };
      const allowanceLine = {
        label: String(
          pick(row, ["Loại phụ cấp", "Loai phu cap", "Phụ cấp", "allowance_type"]),
        ).trim(),
        amount: parseNumber(
          pick(row, ["Tiền phụ cấp", "Tien phu cap", "Số tiền phụ cấp", "allowance_amount"]),
        ),
      };
      const deductionLine = {
        label: String(
          pick(row, ["Loại khấu trừ", "Loai khau tru", "Khấu trừ", "deduction_type"]),
        ).trim(),
        amount: parseNumber(
          pick(row, ["Tiền khấu trừ", "Tien khau tru", "Số tiền khấu trừ", "deduction_amount"]),
        ),
      };
      return {
        employeeCode,
        company,
        personal: {
          employee_code: employeeCode,
          company,
          start_date: parseExcelDate(pick(row, ["Ngày vào làm", "Ngay vao lam", "start_date"])),
          end_date: parseExcelDate(pick(row, ["Ngày nghỉ", "Ngay nghi", "end_date"])),
          base_salary: parseNumber(pick(row, ["Lương cơ bản", "Luong co ban", "base_salary"])),
          standard_workdays: parseNumber(
            pick(row, ["Số công HC", "So cong HC", "standard_workdays"]),
          ),
        },
        wageLine: wageLine.rate || wageLine.hours || wageLine.amount ? wageLine : undefined,
        allowanceLine: allowanceLine.label || allowanceLine.amount ? allowanceLine : undefined,
        deductionLine: deductionLine.label || deductionLine.amount ? deductionLine : undefined,
      };
    })
    .filter(
      (row) =>
        row.employeeCode && row.company && (row.wageLine || row.allowanceLine || row.deductionLine),
    );
}

function employeeCompanyKey(employeeCode?: string, company?: string) {
  const code = normalize(employeeCode);
  const factory = normalize(company);
  return code && factory ? `${code}::${factory}` : "";
}

function CheckAttendancePage() {
  const { isAdmin } = useAuth();
  return isAdmin ? <AdminCheckAttendance /> : <UserCheckAttendance />;
}

function AdminCheckAttendance() {
  const [month, setMonth] = useState(todayMonth());
  const [note, setNote] = useState("");
  const [salaryMonth, setSalaryMonth] = useState(todayMonth());
  const [salaryNote, setSalaryNote] = useState("");
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [salaryBatches, setSalaryBatches] = useState<BatchRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [uploading, setUploading] = useState(false);
  const [salaryUploading, setSalaryUploading] = useState(false);

  const load = async () => {
    const [batchRes, userRes] = await Promise.all([
      pb.collection("check_attendance_batches").getFullList({ sort: "-created" }),
      pb.collection("users").getFullList({ sort: "full_name" }),
    ]);
    setBatches(batchRes as unknown as BatchRecord[]);
    setUsers(userRes as unknown as UserRecord[]);
    try {
      const salaryBatchRes = await pb
        .collection("check_salary_batches")
        .getFullList({ sort: "-created" });
      setSalaryBatches(salaryBatchRes as unknown as BatchRecord[]);
    } catch {
      setSalaryBatches([]);
    }
  };

  useEffect(() => {
    load().catch((error) => toast.error(error?.message || "Không tải được dữ liệu check công"));
  }, []);

  const monthBatches = batches.filter((batch) => batch.month === month);
  const nextRound =
    monthBatches.reduce((max, batch) => Math.max(max, Number(batch.round_no) || 0), 0) + 1;
  const salaryMonthBatches = salaryBatches.filter((batch) => batch.month === salaryMonth);
  const nextSalaryRound =
    salaryMonthBatches.reduce((max, batch) => Math.max(max, Number(batch.round_no) || 0), 0) + 1;

  const downloadTemplate = () => {
    const sampleUser = users[0];
    exportToExcel(`mau_check_cong_${month}`, {
      "Check công": [
        {
          "Mã NV": sampleUser?.employee_code || "NV001",
          "Nhà máy": sampleUser?.company || "Nhà máy A",
          SĐT: sampleUser?.phone || "0900000000",
          "Họ tên": sampleUser?.full_name || "Nguyễn Văn A",
          Ngày: formatTemplateDate(month, 1),
          Ca: "Ngày",
          Lễ: "",
          "Giờ HC": 8,
          "Giờ TC": 2,
          "100%": 10,
          "130%": 6,
          "150%": 2,
          "200%": 0,
          "270%": 0,
          "300%": 8,
          "390%": 0,
        },
        {
          "Mã NV": sampleUser?.employee_code || "NV001",
          "Nhà máy": sampleUser?.company || "Nhà máy A",
          SĐT: sampleUser?.phone || "0900000000",
          "Họ tên": sampleUser?.full_name || "Nguyễn Văn A",
          Ngày: formatTemplateDate(month, 2),
          Ca: "Đêm",
          Lễ: "",
          "Giờ HC": 8,
          "Giờ TC": 1,
          "100%": "",
          "130%": "",
          "150%": "",
          "200%": "",
          "270%": "",
          "300%": "",
          "390%": "",
        },
        {
          "Mã NV": sampleUser?.employee_code || "NV001",
          "Nhà máy": sampleUser?.company || "Nhà máy A",
          SĐT: sampleUser?.phone || "0900000000",
          "Họ tên": sampleUser?.full_name || "Nguyễn Văn A",
          Ngày: formatTemplateDate(month, 3),
          Ca: "Ngày",
          Lễ: "x",
          "Giờ HC": 8,
          "Giờ TC": 0,
          "100%": "",
          "130%": "",
          "150%": "",
          "200%": "",
          "270%": "",
          "300%": "",
          "390%": "",
        },
      ],
    });
  };

  const onUpload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const parsedRows = await readAttendanceExcel(file);
      if (!parsedRows.length) {
        toast.error("File không có dòng công hợp lệ");
        return;
      }

      const employeeMap = new Map<string, UserRecord>();
      for (const user of users) {
        const employeeKey = employeeCompanyKey(user.employee_code, user.company);
        if (employeeKey) employeeMap.set(employeeKey, user);
      }

      const grouped = new Map<
        string,
        { user: UserRecord; rows: CheckAttendanceRow[]; summary: RateBuckets }
      >();
      const unmatched = new Set<string>();

      for (const row of parsedRows) {
        const user = employeeMap.get(employeeCompanyKey(row.employeeCode, row.company));
        if (!user) {
          unmatched.add(`${row.employeeCode} - ${row.company}`);
          continue;
        }
        const current = grouped.get(user.id) || { user, rows: [], summary: EMPTY_CHECK_BUCKETS() };
        if (!hasRateValues(current.summary) && hasRateValues(row.rates)) {
          current.summary = row.rates;
        }
        if (row.date) {
          current.rows.push({
            date: row.date,
            shift: row.shift,
            is_holiday: row.is_holiday,
            hc_hours: row.hc_hours,
            ot_hours: row.ot_hours,
          });
        }
        grouped.set(user.id, current);
      }

      if (!grouped.size) {
        toast.error("Không khớp được nhân sự nào từ file Excel");
        return;
      }

      const formData = new FormData();
      formData.append("month", month);
      formData.append("round_no", String(nextRound));
      formData.append("note", note);
      formData.append("total_users", String(grouped.size));
      formData.append("total_rows", String(parsedRows.length));
      formData.append("source_file", file);

      const batch = (await pb
        .collection("check_attendance_batches")
        .create(formData)) as unknown as BatchRecord;

      for (const { user, rows, summary } of grouped.values()) {
        rows.sort((a, b) => a.date.localeCompare(b.date));
        await pb.collection("check_attendance_items").create({
          batch: batch.id,
          user: user.id,
          month,
          round_no: nextRound,
          rows,
          summary,
        });
      }

      toast.success(
        `Đã gửi check công lần ${nextRound} cho ${grouped.size} nhân sự${
          unmatched.size ? `, ${unmatched.size} dòng chưa khớp` : ""
        }`,
      );
      setNote("");
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Không nhập được file check công");
    } finally {
      setUploading(false);
    }
  };

  const downloadSalaryTemplate = () => {
    const sampleUser = users[0];
    exportToExcel(`mau_check_luong_${salaryMonth}`, {
      "Check lương": [
        {
          "Mã NV": sampleUser?.employee_code || "NV001",
          "Nhà máy": sampleUser?.company || "Nhà máy A",
          "Họ tên": sampleUser?.full_name || "Nguyễn Văn A",
          "Ngày vào làm": formatTemplateDate(salaryMonth, 1),
          "Ngày nghỉ": "",
          "Lương cơ bản": 5000000,
          "Số công HC": 26,
          "Hệ số": "100%",
          "Số giờ": 208,
          "Thành tiền": 5000000,
          "Loại phụ cấp": "Chuyên cần",
          "Tiền phụ cấp": 500000,
          "Loại khấu trừ": "BHXH",
          "Tiền khấu trừ": 525000,
        },
        {
          "Mã NV": sampleUser?.employee_code || "NV001",
          "Nhà máy": sampleUser?.company || "Nhà máy A",
          "Họ tên": sampleUser?.full_name || "Nguyễn Văn A",
          "Ngày vào làm": "",
          "Ngày nghỉ": "",
          "Lương cơ bản": "",
          "Số công HC": "",
          "Hệ số": "150%",
          "Số giờ": 10,
          "Thành tiền": 360577,
          "Loại phụ cấp": "Đời sống",
          "Tiền phụ cấp": 300000,
          "Loại khấu trừ": "Tạm ứng",
          "Tiền khấu trừ": 200000,
        },
      ],
    });
  };

  const onSalaryUpload = async (file?: File) => {
    if (!file) return;
    setSalaryUploading(true);
    try {
      const parsedRows = await readSalaryExcel(file);
      if (!parsedRows.length) {
        toast.error("File không có dòng lương hợp lệ");
        return;
      }

      const employeeMap = new Map<string, UserRecord>();
      for (const user of users) {
        const employeeKey = employeeCompanyKey(user.employee_code, user.company);
        if (employeeKey) employeeMap.set(employeeKey, user);
      }

      const grouped = new Map<
        string,
        {
          user: UserRecord;
          personal: SalaryPersonalInfo;
          wageLines: SalaryWageLine[];
          allowanceLines: SalaryMoneyLine[];
          deductionLines: SalaryMoneyLine[];
        }
      >();
      const unmatched = new Set<string>();

      for (const row of parsedRows) {
        const user = employeeMap.get(employeeCompanyKey(row.employeeCode, row.company));
        if (!user) {
          unmatched.add(`${row.employeeCode} - ${row.company}`);
          continue;
        }
        const current =
          grouped.get(user.id) ||
          ({
            user,
            personal: row.personal,
            wageLines: [],
            allowanceLines: [],
            deductionLines: [],
          } satisfies {
            user: UserRecord;
            personal: SalaryPersonalInfo;
            wageLines: SalaryWageLine[];
            allowanceLines: SalaryMoneyLine[];
            deductionLines: SalaryMoneyLine[];
          });

        current.personal = {
          employee_code: current.personal.employee_code || row.personal.employee_code,
          company: current.personal.company || row.personal.company,
          start_date: current.personal.start_date || row.personal.start_date,
          end_date: current.personal.end_date || row.personal.end_date,
          base_salary: current.personal.base_salary || row.personal.base_salary,
          standard_workdays: current.personal.standard_workdays || row.personal.standard_workdays,
        };
        if (row.wageLine) current.wageLines.push(row.wageLine);
        if (row.allowanceLine) current.allowanceLines.push(row.allowanceLine);
        if (row.deductionLine) current.deductionLines.push(row.deductionLine);
        grouped.set(user.id, current);
      }

      if (!grouped.size) {
        toast.error("Không khớp được nhân sự nào từ file Excel lương");
        return;
      }

      const formData = new FormData();
      formData.append("month", salaryMonth);
      formData.append("round_no", String(nextSalaryRound));
      formData.append("note", salaryNote);
      formData.append("total_users", String(grouped.size));
      formData.append("total_rows", String(parsedRows.length));
      formData.append("source_file", file);

      const batch = (await pb
        .collection("check_salary_batches")
        .create(formData)) as unknown as BatchRecord;

      for (const item of grouped.values()) {
        const totals = calculateSalaryTotals({
          wageLines: item.wageLines,
          allowanceLines: item.allowanceLines,
          deductionLines: item.deductionLines,
        });
        await pb.collection("check_salary_items").create({
          batch: batch.id,
          user: item.user.id,
          month: salaryMonth,
          round_no: nextSalaryRound,
          personal: item.personal,
          wage_lines: item.wageLines,
          allowance_lines: item.allowanceLines,
          deduction_lines: item.deductionLines,
          totals,
        });
      }

      toast.success(
        `Đã gửi check lương lần ${nextSalaryRound} cho ${grouped.size} nhân sự${
          unmatched.size ? `, ${unmatched.size} dòng chưa khớp` : ""
        }`,
      );
      setSalaryNote("");
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Không nhập được file check lương");
    } finally {
      setSalaryUploading(false);
    }
  };

  return (
    <div>
      <AppHeader title="Check công/lương" subtitle="Gửi bảng check công từ Excel" back />
      <div className="p-4">
        <Tabs defaultValue="attendance" className="space-y-4">
          <TabsList className="grid h-10 w-full grid-cols-2 rounded-xl">
            <TabsTrigger value="attendance" className="rounded-lg text-xs">
              Check công
            </TabsTrigger>
            <TabsTrigger value="salary" className="rounded-lg text-xs">
              Check lương
            </TabsTrigger>
          </TabsList>

          <TabsContent value="attendance" className="mt-0 space-y-4">
            <Card className="space-y-3 p-4">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">Gửi check công</div>
                  <div className="text-[11px] text-muted-foreground">
                    Tháng {month} · lần gửi tiếp theo: {nextRound}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Tháng</Label>
                  <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Ghi chú</Label>
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Tuỳ chọn"
                  />
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <label className="block">
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    disabled={uploading}
                    onChange={(event) => {
                      onUpload(event.target.files?.[0]);
                      event.currentTarget.value = "";
                    }}
                  />
                  <span className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground shadow active:scale-[0.98]">
                    <Upload className="h-4 w-4" />
                    {uploading ? "Đang gửi..." : "Chọn file Excel và gửi"}
                  </span>
                </label>
                <Button type="button" variant="outline" onClick={downloadTemplate}>
                  <FileDown className="h-4 w-4" />
                  Tải mẫu
                </Button>
              </div>
            </Card>

            <AdminBatchHistory
              batches={batches}
              icon={CalendarCheck}
              title="Lịch sử gửi"
              emptyTitle="Chưa có lần gửi check công"
              emptyDescription="Sau khi admin nhập Excel, lịch sử gửi sẽ hiển thị tại đây."
            />
          </TabsContent>

          <TabsContent value="salary" className="mt-0 space-y-4">
            <Card className="space-y-3 p-4">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Wallet className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">Gửi check lương</div>
                  <div className="text-[11px] text-muted-foreground">
                    Tháng {salaryMonth} · lần gửi tiếp theo: {nextSalaryRound}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Tháng</Label>
                  <Input
                    type="month"
                    value={salaryMonth}
                    onChange={(e) => setSalaryMonth(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Ghi chú</Label>
                  <Input
                    value={salaryNote}
                    onChange={(e) => setSalaryNote(e.target.value)}
                    placeholder="Tuỳ chọn"
                  />
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <label className="block">
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    disabled={salaryUploading}
                    onChange={(event) => {
                      onSalaryUpload(event.target.files?.[0]);
                      event.currentTarget.value = "";
                    }}
                  />
                  <span className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground shadow active:scale-[0.98]">
                    <Upload className="h-4 w-4" />
                    {salaryUploading ? "Đang gửi..." : "Chọn file Excel và gửi"}
                  </span>
                </label>
                <Button type="button" variant="outline" onClick={downloadSalaryTemplate}>
                  <FileDown className="h-4 w-4" />
                  Tải mẫu
                </Button>
              </div>
            </Card>

            <div className="hidden">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Lịch sử gửi
              </div>
              {batches.length === 0 ? (
                <EmptyState
                  icon={CalendarCheck}
                  title="Chưa có lần gửi check công"
                  description="Sau khi admin nhập Excel, lịch sử gửi sẽ hiển thị tại đây."
                />
              ) : (
                batches.map((batch) => (
                  <Card key={batch.id} className="p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-secondary text-primary">
                        <Send className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold">
                            {batch.month} · Lần {batch.round_no}
                          </div>
                          <span className="chip chip-info">{batch.total_users || 0} người</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <span className="chip chip-neutral">{batch.total_rows || 0} dòng</span>
                          {batch.created && (
                            <span className="chip chip-neutral">
                              {new Date(batch.created).toLocaleDateString("vi-VN")}
                            </span>
                          )}
                          {batch.source_file && (
                            <a
                              href={fileUrl(batch, batch.source_file)}
                              target="_blank"
                              rel="noreferrer"
                              className="chip chip-info"
                              onClick={(event) => event.stopPropagation()}
                            >
                              File Excel
                            </a>
                          )}
                        </div>
                        {batch.note && (
                          <div className="mt-1 text-[11px] text-muted-foreground">{batch.note}</div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Lịch sử gửi lương
              </div>
              {salaryBatches.length === 0 ? (
                <EmptyState
                  icon={Wallet}
                  title="Chưa có lần gửi check lương"
                  description="Sau khi admin nhập Excel lương, lịch sử gửi sẽ hiển thị tại đây."
                />
              ) : (
                salaryBatches.map((batch) => (
                  <Card key={batch.id} className="p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-secondary text-primary">
                        <Send className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold">
                            {batch.month} · Lần {batch.round_no}
                          </div>
                          <span className="chip chip-info">{batch.total_users || 0} người</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <span className="chip chip-neutral">{batch.total_rows || 0} dòng</span>
                          {batch.created && (
                            <span className="chip chip-neutral">
                              {new Date(batch.created).toLocaleDateString("vi-VN")}
                            </span>
                          )}
                          {batch.source_file && (
                            <a
                              href={fileUrl(batch, batch.source_file)}
                              target="_blank"
                              rel="noreferrer"
                              className="chip chip-info"
                              onClick={(event) => event.stopPropagation()}
                            >
                              File Excel
                            </a>
                          )}
                        </div>
                        {batch.note && (
                          <div className="mt-1 text-[11px] text-muted-foreground">{batch.note}</div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function AdminBatchHistory({
  batches,
  icon: Icon,
  title,
  emptyTitle,
  emptyDescription,
}: {
  batches: BatchRecord[];
  icon: typeof CalendarCheck;
  title: string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const displayTitle = Icon === Wallet ? "Lịch sử gửi lương" : "Lịch sử gửi";
  const displayEmptyTitle =
    Icon === Wallet ? "Chưa có lần gửi check lương" : "Chưa có lần gửi check công";
  const displayEmptyDescription =
    Icon === Wallet
      ? "Sau khi admin nhập Excel lương, lịch sử gửi sẽ hiển thị tại đây."
      : "Sau khi admin nhập Excel, lịch sử gửi sẽ hiển thị tại đây.";

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {displayTitle || title}
      </div>
      {batches.length === 0 ? (
        <EmptyState
          icon={Icon}
          title={displayEmptyTitle || emptyTitle}
          description={displayEmptyDescription || emptyDescription}
        />
      ) : (
        batches.map((batch) => (
          <Card key={batch.id} className="p-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-secondary text-primary">
                <Send className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold">
                    {batch.month} · Lần {batch.round_no}
                  </div>
                  <span className="chip chip-info">{batch.total_users || 0} người</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  <span className="chip chip-neutral">{batch.total_rows || 0} dòng</span>
                  {batch.created && (
                    <span className="chip chip-neutral">
                      {new Date(batch.created).toLocaleDateString("vi-VN")}
                    </span>
                  )}
                  {batch.source_file && (
                    <a
                      href={fileUrl(batch, batch.source_file)}
                      target="_blank"
                      rel="noreferrer"
                      className="chip chip-info"
                      onClick={(event) => event.stopPropagation()}
                    >
                      File Excel
                    </a>
                  )}
                </div>
                {batch.note && (
                  <div className="mt-1 text-[11px] text-muted-foreground">{batch.note}</div>
                )}
              </div>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

function UserCheckAttendance() {
  const { user } = useAuth();
  const [items, setItems] = useState<CheckItemRecord[]>([]);
  const [selected, setSelected] = useState<CheckItemRecord | null>(null);
  const [salaryItems, setSalaryItems] = useState<SalaryItemRecord[]>([]);
  const [selectedSalary, setSelectedSalary] = useState<SalaryItemRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [factoryCutoffDay, setFactoryCutoffDay] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await pb.collection("check_attendance_items").getFullList({
        filter: `user="${escapePb(user.id)}"`,
        sort: "-created",
        expand: "batch",
      });
      let salaryRes: unknown[] = [];
      try {
        salaryRes = await pb.collection("check_salary_items").getFullList({
          filter: `user="${escapePb(user.id)}"`,
          sort: "-created",
          expand: "batch",
        });
      } catch {
        salaryRes = [];
      }
      const normalized = (res as unknown as CheckItemRecord[]).map((item) => ({
        ...item,
        rows: Array.isArray(item.rows) ? item.rows : [],
      }));
      const normalizedSalary = (salaryRes as unknown as SalaryItemRecord[]).map((item) => ({
        ...item,
        wage_lines: Array.isArray(item.wage_lines) ? item.wage_lines : [],
        allowance_lines: Array.isArray(item.allowance_lines) ? item.allowance_lines : [],
        deduction_lines: Array.isArray(item.deduction_lines) ? item.deduction_lines : [],
        totals: item.totals || { wage: 0, allowance: 0, deduction: 0, net: 0 },
      }));
      setItems(normalized);
      setSalaryItems(normalizedSalary);
      setSelected(normalized.find((item) => item.user === user.id) || null);
      setSelectedSalary(normalizedSalary.find((item) => item.user === user.id) || null);
      const latest = [...normalized, ...normalizedSalary].reduce(
        (max, item) => Math.max(max, item.created ? new Date(item.created).getTime() : 0),
        0,
      );
      markSeen("check-attendance", user.id, latest || Date.now());
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Không tải được check công");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const activeItems = useMemo(
    () => items.filter((item) => item.user === user?.id),
    [items, user?.id],
  );
  const activeSalaryItems = useMemo(
    () => salaryItems.filter((item) => item.user === user?.id),
    [salaryItems, user?.id],
  );
  const activeCheckUser = user as UserRecord | null;

  useEffect(() => {
    let cancelled = false;
    fetchFactoryAttendanceCutoffDay(activeCheckUser?.company).then((day) => {
      if (!cancelled) setFactoryCutoffDay(day);
    });
    return () => {
      cancelled = true;
    };
  }, [activeCheckUser?.company]);

  useEffect(() => {
    setSelected(activeItems[0] || null);
    setSelectedSalary(activeSalaryItems[0] || null);
  }, [activeItems, activeSalaryItems]);

  const buckets = useMemo(() => normalizeBuckets(selected?.summary), [selected]);
  const visibleRateCells = useMemo(
    () =>
      [
        { label: "100%", hours: buckets.r100 },
        { label: "130%", hours: buckets.r130 },
        { label: "150%", hours: buckets.r150 },
        { label: "200%", hours: buckets.r200 },
        { label: "270%", hours: buckets.r270 },
        { label: "300%", hours: buckets.r300 },
        { label: "390%", hours: buckets.r390 },
      ].filter((cell) => cell.hours > 0),
    [buckets],
  );
  const selectedPeriod = useMemo(
    () => getPayrollPeriod(monthStringToDate(selected?.month || todayMonth()), factoryCutoffDay),
    [selected?.month, factoryCutoffDay],
  );

  return (
    <div>
      <AppHeader title="Check công/lương" subtitle="Bảng check công admin gửi" back />
      <div className="space-y-4 p-4">
        {loading && <div className="p-4 text-sm text-muted-foreground">Đang tải...</div>}

        <Tabs defaultValue="attendance" className="space-y-4">
          <TabsList className="grid h-10 w-full grid-cols-2 rounded-xl">
            <TabsTrigger value="attendance" className="rounded-lg text-xs">
              Check công
            </TabsTrigger>
            <TabsTrigger value="salary" className="rounded-lg text-xs">
              Check lương
            </TabsTrigger>
          </TabsList>

          <TabsContent value="attendance" className="mt-0 space-y-4">
            {activeItems.length === 0 && !loading ? (
              <EmptyState
                icon={CalendarCheck}
                title="Chưa có bảng check công"
                description="Khi admin gửi bảng check công, bạn sẽ xem được từng lần gửi tại đây."
              />
            ) : (
              <>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {activeItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelected(item)}
                      className={cn(
                        "flex-none rounded-full border px-3 py-1.5 text-xs font-medium transition",
                        selected?.id === item.id
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-muted-foreground",
                      )}
                    >
                      {item.month} · Lần {item.round_no}
                    </button>
                  ))}
                </div>

                {selected && (
                  <>
                    <Card className="overflow-hidden">
                      <div className="gradient-accent p-4 text-accent-foreground">
                        <div className="text-xs uppercase opacity-80">Bảng check công</div>
                        <div className="mt-0.5 text-xl font-bold">
                          {selected.month} · Lần {selected.round_no}
                        </div>
                        {selected.expand?.batch?.note && (
                          <div className="mt-1 text-xs opacity-80">
                            {selected.expand.batch.note}
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-4 gap-1.5 bg-card p-3 text-[10px] sm:gap-2 sm:text-sm">
                        {visibleRateCells.map((cell) => (
                          <RateCell key={cell.label} label={cell.label} hours={cell.hours} />
                        ))}
                        <RateCell label={"Ngày"} hours={selected.rows.length} suffix="" />
                      </div>
                    </Card>

                    <CheckMonthCalendar rows={selected.rows} period={selectedPeriod} />
                  </>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="salary" className="mt-0">
            <SalaryCheckPanel
              items={activeSalaryItems}
              selected={selectedSalary}
              onSelect={setSelectedSalary}
              loading={loading}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function SalaryCheckPanel({
  items,
  selected,
  onSelect,
  loading,
}: {
  items: SalaryItemRecord[];
  selected: SalaryItemRecord | null;
  onSelect: (item: SalaryItemRecord) => void;
  loading: boolean;
}) {
  if (items.length === 0 && !loading) {
    return (
      <EmptyState
        icon={Wallet}
        title="Chưa có bảng check lương"
        description="Khi admin gửi bảng check lương, bạn sẽ xem được từng lần gửi tại đây."
      />
    );
  }

  const selectedTotals = selected
    ? calculateSalaryTotals({
        wageLines: selected.wage_lines,
        allowanceLines: selected.allowance_lines,
        deductionLines: selected.deduction_lines,
      })
    : null;

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Check lương
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item)}
            className={cn(
              "flex-none rounded-full border px-3 py-1.5 text-xs font-medium transition",
              selected?.id === item.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground",
            )}
          >
            {item.month} · Lần {item.round_no}
          </button>
        ))}
      </div>

      {selected && (
        <Card className="overflow-hidden">
          <div className="gradient-accent p-4 text-accent-foreground">
            <div className="text-xs uppercase opacity-80">Bảng check lương</div>
            <div className="mt-0.5 text-xl font-bold">{formatVND(selectedTotals?.net || 0)}</div>
            <div className="mt-1 text-xs opacity-80">
              {selected.month} · Lần {selected.round_no}
            </div>
            {selected.expand?.batch?.note && (
              <div className="mt-1 text-xs opacity-80">{selected.expand.batch.note}</div>
            )}
          </div>

          <div className="space-y-4 p-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <InfoCell label="Mã NV" value={selected.personal.employee_code || "—"} />
              <InfoCell label="Nhà máy" value={selected.personal.company || "—"} />
              <InfoCell
                label="Ngày vào làm"
                value={formatDisplayDate(selected.personal.start_date)}
              />
              <InfoCell label="Ngày nghỉ" value={formatDisplayDate(selected.personal.end_date)} />
              <InfoCell label="Lương cơ bản" value={formatVND(selected.personal.base_salary)} />
              <InfoCell label="Số công HC" value={`${selected.personal.standard_workdays || 0}`} />
            </div>

            <SalaryWageSection lines={selected.wage_lines} total={selectedTotals?.wage || 0} />
            <SalaryMoneySection
              title="Phụ cấp"
              lines={selected.allowance_lines}
              total={selectedTotals?.allowance || 0}
            />
            <SalaryMoneySection
              title="Khấu trừ"
              lines={selected.deduction_lines}
              total={selectedTotals?.deduction || 0}
            />

            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
              <div className="text-[11px] uppercase text-muted-foreground">Thực nhận</div>
              <div className="mt-1 text-xl font-bold text-primary">
                {formatVND(selectedTotals?.net || 0)}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function SalaryWageSection({ lines, total }: { lines: SalaryWageLine[]; total: number }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Thông tin lương
      </div>
      <div className="space-y-2">
        {lines.length === 0 ? (
          <div className="rounded-xl border bg-card p-3 text-sm text-muted-foreground">
            Chưa có dòng lương
          </div>
        ) : (
          lines.map((line, index) => (
            <div
              key={`${line.rate}-${index}`}
              className="grid grid-cols-3 gap-2 rounded-xl border bg-card p-3 text-sm"
            >
              <div>
                <div className="text-[11px] text-muted-foreground">Hệ số</div>
                <div className="font-semibold">{line.rate || "—"}</div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">Số giờ</div>
                <div className="font-semibold">{line.hours || 0}h</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-muted-foreground">Thành tiền</div>
                <div className="font-semibold">{formatVND(line.amount)}</div>
              </div>
            </div>
          ))
        )}
      </div>
      <TotalRow label="Tổng lương" value={total} />
    </div>
  );
}

function SalaryMoneySection({
  title,
  lines,
  total,
}: {
  title: string;
  lines: SalaryMoneyLine[];
  total: number;
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="space-y-2">
        {lines.length === 0 ? (
          <div className="rounded-xl border bg-card p-3 text-sm text-muted-foreground">
            Chưa có dữ liệu
          </div>
        ) : (
          lines.map((line, index) => (
            <div
              key={`${line.label}-${index}`}
              className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3 text-sm"
            >
              <div className="font-medium">{line.label || "—"}</div>
              <div className="font-semibold">{formatVND(line.amount)}</div>
            </div>
          ))
        )}
      </div>
      <TotalRow label={`Tổng ${title.toLowerCase()}`} value={total} />
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-xl border bg-secondary/40 p-3 text-sm">
      <div className="font-medium">{label}</div>
      <div className="font-bold">{formatVND(value)}</div>
    </div>
  );
}

function CheckMonthCalendar({
  rows,
  period,
}: {
  rows: CheckAttendanceRow[];
  period: PayrollPeriod;
}) {
  const [detail, setDetail] = useState<CheckAttendanceRow | null>(null);
  const map = useMemo(() => {
    const result = new Map<string, CheckAttendanceRow>();
    for (const row of rows) result.set(row.date, row);
    return result;
  }, [rows]);

  const cells = buildPayrollCalendarCells(period);

  return (
    <>
      <Card className="overflow-hidden rounded-2xl p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold">{period.title}</div>
          <span className="chip chip-info">{rows.length} ngày</span>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase text-muted-foreground">
          {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((d, i) => (
            <div key={d} className={i === 6 ? "text-[color:var(--status-danger)]" : ""}>
              {d}
            </div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((cell, idx) => {
            if (!cell) return <div key={`empty-${idx}`} className="aspect-square" />;
            const row = map.get(cell.key);
            const isSun = idx % 7 === 6;
            const total = row ? row.hc_hours + row.ot_hours : 0;
            return (
              <button
                key={cell.key}
                type="button"
                onClick={() => row && setDetail(row)}
                className={cn(
                  "relative flex aspect-square flex-col items-center justify-start rounded-lg border p-1 text-left transition active:scale-95",
                  row
                    ? row.is_holiday
                      ? "border-[color:var(--status-danger)]/40 bg-[color:var(--status-danger-bg)]"
                      : row.shift === "day"
                        ? "border-[color:var(--status-warning)]/40 bg-[color:var(--status-warning-bg)]"
                        : "border-primary/40 bg-primary/10"
                    : "border-border bg-card",
                )}
              >
                <div
                  className={`text-[11px] font-semibold leading-none ${
                    isSun ? "text-[color:var(--status-danger)]" : ""
                  }`}
                >
                  {cell.day}
                </div>
                {row && (
                  <div className="mt-0.5 flex flex-1 flex-col items-center justify-center gap-0.5">
                    {row.shift === "day" ? (
                      <Sun className="h-3 w-3 text-[color:var(--status-warning-fg)]" />
                    ) : (
                      <Moon className="h-3 w-3 text-primary" />
                    )}
                    <div className="text-[9px] font-semibold leading-none">{total}h</div>
                    {row.is_holiday && (
                      <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-[color:var(--status-danger)]" />
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detail?.date}</DialogTitle>
            <DialogDescription className="sr-only">
              Chi tiết giờ công của ngày trong bảng check công.
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <InfoCell label="Ca" value={detail.shift === "day" ? "Ngày" : "Đêm"} />
              <InfoCell label="Ngày lễ" value={detail.is_holiday ? "Có" : "Không"} />
              <InfoCell label="Giờ HC" value={`${detail.hc_hours}h`} />
              <InfoCell label="Giờ TC" value={`${detail.ot_hours}h`} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  );
}

function RateCell({
  label,
  hours,
  suffix = "h",
}: {
  label: string;
  hours: number;
  suffix?: string;
}) {
  return (
    <div className="rounded-lg border border-border/80 bg-background p-2 text-center shadow-sm">
      <div className="text-[9px] uppercase text-muted-foreground">{label}</div>
      <div className="text-xs font-semibold sm:text-sm">
        {hours}
        {suffix}
      </div>
    </div>
  );
}
