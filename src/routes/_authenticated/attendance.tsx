import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { pb } from "@/lib/pocketbase";
import { useAuth } from "@/lib/auth";
import { AppHeader } from "@/components/layout/BottomNav";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FilterBar } from "@/components/ui/filter-bar";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { aggregate, calcSalary, formatVND, type AttendanceRow, type Shift } from "@/lib/salary";
import { exportToExcel } from "@/lib/excel";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus, Sun, Moon, Trash2, FileDown, Users, Clock, ClipboardList } from "lucide-react";

export const Route = createFileRoute("/_authenticated/attendance")({
  component: AttendancePage,
});

function ym(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
function pad(n: number) { return String(n).padStart(2, "0"); }
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function AttendancePage() {
  const { isAdmin } = useAuth();
  return isAdmin ? <AdminAttendance /> : <UserAttendance />;
}

/* ─────────────────────────── ADMIN ─────────────────────────── */

interface RowWithUser {
  id: string;
  user: string;
  date: string;
  shift: Shift;
  is_holiday: boolean;
  hc_hours: number;
  ot_hours: number;
  expand?: { user?: any };
}

function AdminAttendance() {
  const [monthDate, setMonthDate] = useState(() => {
    const d = new Date(); d.setDate(1); return d;
  });
  const [rows, setRows] = useState<RowWithUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [detailUser, setDetailUser] = useState<any | null>(null);

  const fetchMonth = async () => {
    setLoading(true);
    try {
      const first = ym(monthDate) + "-01";
      const next = new Date(monthDate); next.setMonth(next.getMonth() + 1);
      const last = ym(next) + "-01";
      const res = await pb.collection("attendance").getFullList({
        filter: `date>="${first}" && date<"${last}"`,
        sort: "date",
        expand: "user",
      });
      setRows(
        res.map((r: any) => ({
          id: r.id,
          user: r.user,
          date: (r.date as string).substring(0, 10),
          shift: r.shift,
          is_holiday: !!r.is_holiday,
          hc_hours: Number(r.hc_hours) || 0,
          ot_hours: Number(r.ot_hours) || 0,
          expand: r.expand,
        })),
      );
    } catch (e: any) {
      toast.error(e?.message || "Không tải được chấm công");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { fetchMonth(); /* eslint-disable-next-line */ }, [monthDate.getTime()]);

  /* Group by user */
  const grouped = useMemo(() => {
    const map = new Map<string, { user: any; rows: RowWithUser[] }>();
    for (const r of rows) {
      const u = r.expand?.user || { id: r.user, full_name: "(Không rõ)" };
      const entry = map.get(r.user) || { user: u, rows: [] };
      entry.rows.push(r);
      map.set(r.user, entry);
    }
    return Array.from(map.values()).sort((a, b) =>
      (a.user.full_name || a.user.username || "").localeCompare(b.user.full_name || b.user.username || ""),
    );
  }, [rows]);

  const filtered = useMemo(() => {
    if (!search) return grouped;
    const q = search.toLowerCase();
    return grouped.filter(({ user }) =>
      (user.full_name || "").toLowerCase().includes(q) ||
      (user.username || "").toLowerCase().includes(q) ||
      (user.company || "").toLowerCase().includes(q) ||
      (user.phone || "").toLowerCase().includes(q),
    );
  }, [grouped, search]);

  const totals = useMemo(() => {
    let hc = 0, ot = 0;
    for (const r of rows) { hc += r.hc_hours; ot += r.ot_hours; }
    return { users: grouped.length, hc, ot, entries: rows.length };
  }, [rows, grouped]);

  const exportMonth = () => {
    const detail = rows.map((r) => {
      const u = r.expand?.user || {};
      return {
        "Họ tên": u.full_name || "",
        "SĐT": u.phone || "",
        "Nhà máy": u.company || "",
        "Ngày": r.date,
        "Ca": r.shift === "day" ? "Ngày" : "Đêm",
        "Lễ": r.is_holiday ? "x" : "",
        "Giờ HC": r.hc_hours,
        "Giờ TC": r.ot_hours,
      };
    });
    const summary = grouped.map(({ user, rows: rs }) => {
      const b = aggregate(rs);
      const s = calcSalary(b, {
        lcb: user.lcb || 0,
        chuyen_can: user.chuyen_can || 0,
        doi_song: user.doi_song || 0,
        tham_nien: user.tham_nien || 0,
      });
      const hc = rs.reduce((a, r) => a + r.hc_hours, 0);
      const ot = rs.reduce((a, r) => a + r.ot_hours, 0);
      return {
        "Họ tên": user.full_name || "",
        "SĐT": user.phone || "",
        "Nhà máy": user.company || "",
        "Số ngày": rs.length,
        "Giờ HC": hc,
        "Giờ TC": ot,
        "Lương tạm tính": Math.round(s.total),
      };
    });
    exportToExcel(`cham_cong_${ym(monthDate)}`, { "Tổng hợp": summary, "Chi tiết": detail });
  };

  return (
    <PageContainer
      title="Chấm công"
      subtitle={`Tháng ${String(monthDate.getMonth() + 1).padStart(2, "0")}/${monthDate.getFullYear()}`}
      right={
        <button
          onClick={exportMonth}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-card text-muted-foreground border border-border hover:bg-muted"
          aria-label="Xuất Excel"
          disabled={!rows.length}
        >
          <FileDown className="h-4 w-4" />
        </button>
      }
    >
      <Card className="overflow-hidden rounded-2xl">
        <div className="gradient-primary flex items-center justify-between p-3 text-primary-foreground">
          <div className="text-sm font-semibold">Chọn tháng</div>
          <MonthSwitcher value={monthDate} onChange={setMonthDate} />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-2.5">
        <StatCard label="Nhân sự" value={totals.users} icon={Users} tone="primary" />
        <StatCard label="Bản ghi" value={totals.entries} icon={ClipboardList} tone="info" />
        <StatCard label="Giờ HC" value={totals.hc} icon={Sun} tone="warning" />
        <StatCard label="Giờ TC" value={totals.ot} icon={Moon} tone="info" />
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        placeholder="Tìm theo tên, SĐT, nhà máy…"
      />

      {loading && <div className="py-6 text-center text-sm text-muted-foreground">Đang tải…</div>}
      {!loading && filtered.length === 0 && (
        <EmptyState icon={Clock} title="Chưa có chấm công" description={search ? "Không có kết quả phù hợp." : "Tháng này chưa có ai chấm công."} />
      )}

      {filtered.map(({ user, rows: rs }) => {
        const hc = rs.reduce((a, r) => a + r.hc_hours, 0);
        const ot = rs.reduce((a, r) => a + r.ot_hours, 0);
        return (
          <button
            key={user.id}
            onClick={() => setDetailUser(user)}
            className="list-card border-l-[color:var(--status-info)] flex w-full items-center gap-3 text-left active:scale-[0.99] transition"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
              {(user.full_name || user.username || "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{user.full_name || user.username}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {user.company || "—"} · {user.phone || "—"}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                <span className="chip chip-info">{rs.length} ngày</span>
                <span className="chip chip-warning">HC {hc}h</span>
                <span className="chip chip-neutral">TC {ot}h</span>
              </div>
            </div>
          </button>
        );
      })}

      <Dialog open={!!detailUser} onOpenChange={(o) => !o && setDetailUser(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detailUser?.full_name || detailUser?.username}</DialogTitle>
          </DialogHeader>
          {detailUser && (
            <UserDetailMonth
              user={detailUser}
              rows={rows.filter((r) => r.user === detailUser.id)}
            />
          )}
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function UserDetailMonth({ user, rows }: { user: any; rows: RowWithUser[] }) {
  const buckets = aggregate(rows);
  const salary = calcSalary(buckets, {
    lcb: user.lcb || 0, chuyen_can: user.chuyen_can || 0,
    doi_song: user.doi_song || 0, tham_nien: user.tham_nien || 0,
  });
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-primary/10 p-3 text-primary">
        <div className="text-[11px] uppercase">Lương tạm tính</div>
        <div className="text-2xl font-bold">{formatVND(salary.total)}</div>
        <div className="text-[11px] opacity-80">Lương giờ {formatVND(salary.wage)} · Phụ cấp {formatVND(salary.allowance)}</div>
      </div>
      <div className="space-y-1.5">
        {rows.length === 0 && <div className="text-sm text-muted-foreground">Không có ngày nào.</div>}
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              {r.shift === "day" ? <Sun className="h-4 w-4 text-[color:var(--status-warning-fg)]" /> : <Moon className="h-4 w-4 text-primary" />}
              <span className="font-medium">{r.date}</span>
              {r.is_holiday && <span className="chip chip-danger">Lễ</span>}
            </div>
            <div className="text-xs text-muted-foreground">HC {r.hc_hours}h · TC {r.ot_hours}h</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────── USER ─────────────────────────── */

function UserAttendance() {
  const { user } = useAuth();
  const [monthDate, setMonthDate] = useState(() => {
    const d = new Date(); d.setDate(1); return d;
  });
  const [rows, setRows] = useState<(AttendanceRow & { id: string })[]>([]);
  const [loading, setLoading] = useState(false);

  const [date, setDate] = useState(todayStr());
  const [shift, setShift] = useState<Shift>("day");
  const [isHoliday, setIsHoliday] = useState(false);
  const [hcHours, setHcHours] = useState<number>(user?.default_hc_hours ?? 8);
  const [otHours, setOtHours] = useState<number>(user?.default_ot_hours ?? 0);

  useEffect(() => {
    setHcHours(user?.default_hc_hours ?? 8);
    setOtHours(user?.default_ot_hours ?? 0);
  }, [user?.id, user?.default_hc_hours, user?.default_ot_hours]);

  const fetchMonth = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const first = ym(monthDate) + "-01";
      const next = new Date(monthDate); next.setMonth(next.getMonth() + 1);
      const last = ym(next) + "-01";
      const res = await pb.collection("attendance").getFullList({
        filter: `user="${user.id}" && date>="${first}" && date<"${last}"`,
        sort: "date",
      });
      setRows(res.map((r: any) => ({
        id: r.id,
        date: (r.date as string).substring(0, 10),
        shift: r.shift,
        is_holiday: !!r.is_holiday,
        hc_hours: Number(r.hc_hours) || 0,
        ot_hours: Number(r.ot_hours) || 0,
      })));
    } catch (e: any) { toast.error(e?.message || "Lỗi"); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchMonth(); /* eslint-disable-next-line */ }, [user?.id, monthDate.getTime()]);

  const buckets = useMemo(() => aggregate(rows), [rows]);
  const salary = useMemo(
    () => calcSalary(buckets, {
      lcb: user?.lcb || 0, chuyen_can: user?.chuyen_can || 0,
      doi_song: user?.doi_song || 0, tham_nien: user?.tham_nien || 0,
    }),
    [buckets, user?.lcb, user?.chuyen_can, user?.doi_song, user?.tham_nien],
  );

  const submit = async () => {
    if (!user?.id) return;
    try {
      const existing = rows.find((r) => r.date === date);
      const payload = { user: user.id, date, shift, is_holiday: isHoliday, hc_hours: Number(hcHours) || 0, ot_hours: Number(otHours) || 0 };
      if (existing) await pb.collection("attendance").update(existing.id, payload);
      else await pb.collection("attendance").create(payload);
      toast.success("Đã lưu chấm công");
      fetchMonth();
    } catch (e: any) { toast.error(e?.message || "Lỗi"); }
  };

  const remove = async (id: string) => {
    try {
      await pb.collection("attendance").delete(id);
      setRows((r) => r.filter((x) => x.id !== id));
    } catch (e: any) { toast.error(e?.message || "Lỗi"); }
  };

  return (
    <div>
      <AppHeader title="Chấm công" />
      <div className="space-y-4 p-4">
        <Card className="overflow-hidden">
          <div className="gradient-accent p-4 text-accent-foreground">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase opacity-80">Bảng lương tạm tính</div>
                <div className="text-xl font-bold">{user?.company || "—"}</div>
              </div>
              <MonthSwitcher value={monthDate} onChange={setMonthDate} accent />
            </div>
            <div className="mt-3 text-3xl font-extrabold tracking-tight">{formatVND(salary.total)}</div>
            <div className="mt-0.5 text-xs opacity-80">
              Lương theo giờ: {formatVND(salary.wage)} • Phụ cấp: {formatVND(salary.allowance)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px bg-border text-xs sm:grid-cols-4">
            <RateCell label="100%" hours={buckets.r100} />
            <RateCell label="130%" hours={buckets.r130} />
            <RateCell label="150%" hours={buckets.r150} />
            <RateCell label="200%" hours={buckets.r200} />
            <RateCell label="270%" hours={buckets.r270} />
            <RateCell label="300%" hours={buckets.r300} />
            <RateCell label="390%" hours={buckets.r390} />
            <RateCell label="LCB" hours={user?.lcb || 0} suffix="₫" />
          </div>
        </Card>

        <Tabs defaultValue="calendar">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="calendar">Bảng tháng ({rows.length})</TabsTrigger>
            <TabsTrigger value="add">Nhập công</TabsTrigger>
          </TabsList>

          <TabsContent value="calendar" className="space-y-3">
            {loading && <div className="p-4 text-sm text-muted-foreground">Đang tải…</div>}
            <MonthCalendar
              monthDate={monthDate}
              rows={rows}
              onPickDate={(d) => { setDate(d); }}
              onDelete={remove}
            />
            <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Sun className="h-3 w-3 text-[color:var(--status-warning-fg)]" />Ngày</span>
              <span className="inline-flex items-center gap-1"><Moon className="h-3 w-3 text-primary" />Đêm</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[color:var(--status-danger)]" />Lễ</span>
              <span>· Chạm ngày để chỉnh sửa</span>
            </div>
          </TabsContent>

          <TabsContent value="add">
            <Card className="space-y-4 p-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Ngày</Label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Ca</Label>
                  <ShiftToggle value={shift} onChange={setShift} />
                </div>
              </div>

              <label className="flex items-center gap-3 rounded-lg border bg-secondary/50 p-3">
                <Checkbox checked={isHoliday} onCheckedChange={(c) => setIsHoliday(c === true)} />
                <div className="flex-1">
                  <div className="text-sm font-medium">Ngày lễ</div>
                  <div className="text-xs text-muted-foreground">Áp dụng hệ số 300% / 390%</div>
                </div>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Giờ hành chính</Label>
                  <Input type="number" step="0.5" value={hcHours} onChange={(e) => setHcHours(Number(e.target.value))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Giờ tăng ca</Label>
                  <Input type="number" step="0.5" value={otHours} onChange={(e) => setOtHours(Number(e.target.value))} />
                </div>
              </div>

              <Button onClick={submit} className="w-full">
                <Plus className="h-4 w-4" /> Lưu / Cập nhật ngày này
              </Button>
            </Card>
          </TabsContent>
        </Tabs>

      </div>
    </div>
  );
}

function MonthSwitcher({ value, onChange, accent }: { value: Date; onChange: (d: Date) => void; accent?: boolean }) {
  const cls = accent
    ? "flex items-center gap-1 rounded-full bg-white/25 px-1 py-0.5"
    : "flex items-center gap-1 rounded-full bg-primary-foreground/25 px-1 py-0.5";
  return (
    <div className={cls}>
      <Button size="icon" variant="ghost" className="h-7 w-7 hover:bg-white/20"
        onClick={() => { const d = new Date(value); d.setMonth(d.getMonth() - 1); onChange(d); }}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="min-w-[68px] text-center text-sm font-semibold">
        {String(value.getMonth() + 1).padStart(2, "0")}/{value.getFullYear()}
      </div>
      <Button size="icon" variant="ghost" className="h-7 w-7 hover:bg-white/20"
        onClick={() => { const d = new Date(value); d.setMonth(d.getMonth() + 1); onChange(d); }}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function MonthCalendar({
  monthDate,
  rows,
  onPickDate,
  onDelete,
}: {
  monthDate: Date;
  rows: (AttendanceRow & { id: string })[];
  onPickDate: (date: string) => void;
  onDelete: (id: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Monday-first: getDay() Sun=0..Sat=6 → offset
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
  const today = todayStr();

  const map = useMemo(() => {
    const m = new Map<string, AttendanceRow & { id: string }>();
    for (const r of rows) m.set(r.date, r);
    return m;
  }, [rows]);

  const cells: ({ d: number; key: string } | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ d, key: `${year}-${pad(month + 1)}-${pad(d)}` });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const dows = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
  const selectedRow = selected ? map.get(selected) : null;

  return (
    <Card className="overflow-hidden rounded-2xl p-3">
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase text-muted-foreground">
        {dows.map((d, i) => (
          <div key={d} className={i === 6 ? "text-[color:var(--status-danger)]" : ""}>{d}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((c, idx) => {
          if (!c) return <div key={`e-${idx}`} className="aspect-square" />;
          const r = map.get(c.key);
          const isSun = (idx % 7) === 6;
          const isToday = c.key === today;
          const isSelected = selected === c.key;
          const base =
            "relative flex aspect-square flex-col items-center justify-start rounded-lg border p-1 text-left transition active:scale-95";
          const stateCls = r
            ? r.is_holiday
              ? "border-[color:var(--status-danger)]/40 bg-[color:var(--status-danger-bg)]"
              : r.shift === "day"
              ? "border-[color:var(--status-warning)]/40 bg-[color:var(--status-warning-bg)]"
              : "border-primary/40 bg-primary/10"
            : "border-border bg-card hover:bg-muted/40";
          const ringCls = isSelected
            ? "ring-2 ring-primary"
            : isToday
            ? "ring-1 ring-primary/60"
            : "";
          const total = r ? (r.hc_hours + r.ot_hours) : 0;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => {
                setSelected(c.key);
                onPickDate(c.key);
              }}
              className={`${base} ${stateCls} ${ringCls}`}
            >
              <div className={`text-[11px] font-semibold leading-none ${isSun ? "text-[color:var(--status-danger)]" : ""}`}>
                {c.d}
              </div>
              {r ? (
                <div className="mt-0.5 flex flex-1 flex-col items-center justify-center gap-0.5">
                  {r.shift === "day" ? (
                    <Sun className="h-3 w-3 text-[color:var(--status-warning-fg)]" />
                  ) : (
                    <Moon className="h-3 w-3 text-primary" />
                  )}
                  <div className="text-[9px] font-semibold leading-none">{total}h</div>
                  {r.is_holiday && (
                    <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-[color:var(--status-danger)]" />
                  )}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>

      {selectedRow && (
        <div className="mt-3 flex items-center justify-between rounded-lg border bg-secondary/40 px-3 py-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              {selectedRow.shift === "day"
                ? <Sun className="h-3.5 w-3.5 text-[color:var(--status-warning-fg)]" />
                : <Moon className="h-3.5 w-3.5 text-primary" />}
              {selectedRow.date}
              {selectedRow.is_holiday && <span className="chip chip-danger">Lễ</span>}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              HC {selectedRow.hc_hours}h · TC {selectedRow.ot_hours}h
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => {
              onDelete(selectedRow.id);
              setSelected(null);
            }}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      )}
    </Card>
  );
}


function ShiftToggle({ value, onChange }: { value: Shift; onChange: (v: Shift) => void }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-background p-1">
      <button type="button" onClick={() => onChange("day")}
        className={`flex flex-1 items-center justify-center gap-1 rounded px-2 py-1.5 text-xs font-medium ${value === "day" ? "bg-warning/20 text-warning-foreground" : "text-muted-foreground"}`}>
        <Sun className="h-3.5 w-3.5" /> Ngày
      </button>
      <button type="button" onClick={() => onChange("night")}
        className={`flex flex-1 items-center justify-center gap-1 rounded px-2 py-1.5 text-xs font-medium ${value === "night" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
        <Moon className="h-3.5 w-3.5" /> Đêm
      </button>
    </div>
  );
}

function RateCell({ label, hours, suffix = "h" }: { label: string; hours: number; suffix?: string }) {
  return (
    <div className="bg-card p-2.5 text-center">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">
        {suffix === "₫" ? formatVND(hours) : `${hours}${suffix}`}
      </div>
    </div>
  );
}
