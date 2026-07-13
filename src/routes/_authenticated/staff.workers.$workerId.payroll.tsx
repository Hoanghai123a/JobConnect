import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { pb } from "@/lib/pocketbase";
import { useAuth } from "@/lib/auth";
import { AppHeader } from "@/components/layout/BottomNav";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatVND, type AttendanceRow, type RateBuckets } from "@/lib/salary";
import { escapePb } from "@/lib/delegations";
import {
  buildPayrollCalendarCells,
  fetchFactoryAttendanceCutoffDay,
  getPayrollPeriod,
  type PayrollPeriod,
} from "@/lib/payroll-cycle";
import { cn } from "@/lib/utils";
import { CalendarCheck, Moon, Sun, Wallet } from "lucide-react";
import { toast } from "sonner";
import { fetchStaffWorkerWorkspace } from "@/lib/staff-permissions";
import type { UserRecord } from "@/lib/pocketbase";

export const Route = createFileRoute(
  "/_authenticated/staff/workers/$workerId/payroll",
)({
  component: StaffWorkerPayrollPage,
});

type BatchRecord = {
  id: string;
  month: string;
  round_no: number;
  note?: string;
  created?: string;
};

type CheckItemRecord = {
  id: string;
  batch: string;
  user: string;
  month: string;
  round_no: number;
  rows: AttendanceRow[];
  summary?: Partial<RateBuckets>;
  created?: string;
  expand?: { batch?: BatchRecord };
};

type SalaryWageLine = { rate: string; hours: number; amount: number };
type SalaryMoneyLine = { label: string; amount: number };
type SalaryTotals = { wage: number; allowance: number; deduction: number; net: number };
type SalaryPersonalInfo = {
  employee_code: string;
  company: string;
  start_date: string;
  end_date: string;
  base_salary: number;
  standard_workdays: number;
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

const EMPTY_BUCKETS = (): RateBuckets => ({
  r100: 0, r130: 0, r150: 0, r200: 0, r270: 0, r300: 0, r390: 0,
});

function normalizeBuckets(summary?: Partial<RateBuckets>) {
  return { ...EMPTY_BUCKETS(), ...(summary || {}) };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function todayMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function monthStringToDate(month: string) {
  const [year, m] = month.split("-").map(Number);
  return new Date(year || new Date().getFullYear(), (m || 1) - 1, 1);
}

function formatDisplayDate(value?: string) {
  if (!value) return "—";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
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
  return { wage, allowance, deduction, net: wage + allowance - deduction };
}

function StaffWorkerPayrollPage() {
  const { workerId } = useParams({ from: "/_authenticated/staff/workers/$workerId/payroll" });
  const { user } = useAuth();
  const navigate = useNavigate();
  const [workerName, setWorkerName] = useState("");
  const [workerCompany, setWorkerCompany] = useState("");
  const [items, setItems] = useState<CheckItemRecord[]>([]);
  const [selected, setSelected] = useState<CheckItemRecord | null>(null);
  const [salaryItems, setSalaryItems] = useState<SalaryItemRecord[]>([]);
  const [selectedSalary, setSelectedSalary] = useState<SalaryItemRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [factoryCutoffDay, setFactoryCutoffDay] = useState<number | null>(null);
  const [authorized, setAuthorized] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id || !workerId) return;
    setLoading(true);
    try {
      const workspace = await fetchStaffWorkerWorkspace(user as UserRecord, workerId);
      const worker = workspace.worker;
      if (!worker || !worker.canViewPayroll) {
        setAuthorized(false);
        return;
      }

      setAuthorized(true);
      const workerUser = worker.user;
      setWorkerName(workerUser.full_name || workerUser.username || "");
      setWorkerCompany(workerUser.company || "");

      const [attendanceRes, salaryRes] = await Promise.all([
        pb.collection("check_attendance_items").getList(1, 100, {
          filter: `user="${escapePb(workerId)}"`,
          sort: "-created",
          expand: "batch",
        }),
        pb.collection("check_salary_items").getList(1, 100, {
          filter: `user="${escapePb(workerId)}"`,
          sort: "-created",
          expand: "batch",
        }).catch(() => ({ items: [] })),
      ]);

      const normalized = (attendanceRes.items as unknown as CheckItemRecord[]).map((item) => ({
        ...item,
        rows: Array.isArray(item.rows) ? item.rows : [],
      }));
      const normalizedSalary = (salaryRes.items as unknown as SalaryItemRecord[]).map((item) => ({
        ...item,
        wage_lines: Array.isArray(item.wage_lines) ? item.wage_lines : [],
        allowance_lines: Array.isArray(item.allowance_lines) ? item.allowance_lines : [],
        deduction_lines: Array.isArray(item.deduction_lines) ? item.deduction_lines : [],
        totals: item.totals || { wage: 0, allowance: 0, deduction: 0, net: 0 },
      }));
      setItems(normalized);
      setSalaryItems(normalizedSalary);
      setSelected(normalized[0] || null);
      setSelectedSalary(normalizedSalary[0] || null);
    } catch (e: any) {
      toast.error(e?.message || "Không tải được check công/lương");
    } finally {
      setLoading(false);
    }
  }, [user, workerId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    fetchFactoryAttendanceCutoffDay(workerCompany).then((day) => {
      if (!cancelled) setFactoryCutoffDay(day);
    });
    return () => { cancelled = true; };
  }, [workerCompany]);

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

  if (!authorized) {
    return (
      <div>
        <AppHeader title="Check công/lương" back />
        <div className="p-4">
          <EmptyState
            icon={CalendarCheck}
            title="Không có quyền"
            description="Bạn không có quyền xem check công/lương của người lao động này."
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <AppHeader title="Check công/lương" subtitle={workerName} back />
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
            {items.length === 0 && !loading ? (
              <EmptyState
                icon={CalendarCheck}
                title="Chưa có bảng check công"
                description="Khi admin gửi bảng check công, dữ liệu sẽ hiển thị tại đây."
              />
            ) : (
              <>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {items.map((item) => (
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
                      {item.month} · {item.expand?.batch?.note || `Lần ${item.round_no}`}
                    </button>
                  ))}
                </div>

                {selected && (
                  <>
                    <Card className="overflow-hidden">
                      <div className="gradient-accent p-4 text-accent-foreground">
                        <div className="text-xs uppercase opacity-80">Bảng check công</div>
                        <div className="mt-0.5 text-xl font-bold">
                          {selected.month} · {selected.expand?.batch?.note || `Lần ${selected.round_no}`}
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5 bg-card p-3 text-[10px] sm:gap-2 sm:text-sm">
                        {visibleRateCells.map((cell) => (
                          <RateCell key={cell.label} label={cell.label} hours={cell.hours} />
                        ))}
                        <RateCell label="Ngày" hours={selected.rows.length} suffix="" />
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
              items={salaryItems}
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

/* ─── Salary Panel ─── */

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
        description="Khi admin gửi bảng check lương, dữ liệu sẽ hiển thị tại đây."
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
            {item.month} · {item.expand?.batch?.note || `Lần ${item.round_no}`}
          </button>
        ))}
      </div>

      {selected && (
        <Card className="overflow-hidden">
          <div className="gradient-accent p-4 text-accent-foreground">
            <div className="text-xs uppercase opacity-80">Bảng check lương</div>
            <div className="mt-0.5 text-xl font-bold">{formatVND(selectedTotals?.net || 0)}</div>
            <div className="mt-1 text-xs opacity-80">
              {selected.month} · {selected.expand?.batch?.note || `Lần ${selected.round_no}`}
            </div>
          </div>

          <div className="space-y-4 p-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <InfoCell label="Mã NV" value={selected.personal.employee_code || "—"} />
              <InfoCell label="Nhà máy" value={selected.personal.company || "—"} />
              <InfoCell label="Ngày vào làm" value={formatDisplayDate(selected.personal.start_date)} />
              <InfoCell label="Ngày nghỉ" value={formatDisplayDate(selected.personal.end_date)} />
              <InfoCell label="Lương cơ bản" value={formatVND(selected.personal.base_salary)} />
              <InfoCell label="Số công HC" value={`${selected.personal.standard_workdays || 0}`} />
            </div>

            <SalaryWageSection lines={selected.wage_lines} total={selectedTotals?.wage || 0} />
            <SalaryMoneySection title="Phụ cấp" lines={selected.allowance_lines} total={selectedTotals?.allowance || 0} />
            <SalaryMoneySection title="Khấu trừ" lines={selected.deduction_lines} total={selectedTotals?.deduction || 0} />

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

/* ─── Sub-components ─── */

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
  rows: AttendanceRow[];
  period: PayrollPeriod;
}) {
  const [detail, setDetail] = useState<AttendanceRow | null>(null);
  const map = useMemo(() => {
    const result = new Map<string, AttendanceRow>();
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
