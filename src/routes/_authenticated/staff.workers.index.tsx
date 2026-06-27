import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange, ChevronRight, Clock3, Landmark, Plus, Search, ShieldCheck, UserRoundSearch, UserSquare2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusChip } from "@/components/ui/status-chip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { canReportJoin, fetchStaffWorkspace, isRecentRecruiter, type StaffWorkerRecord } from "@/lib/staff-permissions";
import { fetchFactoryManagers, isFactoryAssignmentActive } from "@/lib/factories";
import {
  createEmploymentHistory,
  fetchEmploymentHistories,
  findActiveEmploymentByUser,
  getLatestEmploymentHistory,
  maskCccd,
  syncLegacyUserWorkFields,
  updateEmploymentHistory,
} from "@/lib/employment";
import { fetchFactories, type FactoryRecord } from "@/lib/factories";
import { createStaffActionLog } from "@/lib/staff-log";
import { useAuth } from "@/lib/auth";
import { useAppSettings } from "@/lib/app-settings";
import { pb, type UserRecord } from "@/lib/pocketbase";

export const Route = createFileRoute("/_authenticated/staff/workers/")({
  component: StaffWorkersPage,
});

type WorkerScope = "all" | "qlnm" | "nvtd" | "working" | "left";

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function StaffWorkersPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [workers, setWorkers] = useState<StaffWorkerRecord[]>([]);
  const [factories, setFactories] = useState<FactoryRecord[]>([]);
  const [managedFactoryIds, setManagedFactoryIds] = useState<Set<string>>(new Set());
  const [staffUsers, setStaffUsers] = useState<UserRecord[]>([]);
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<WorkerScope>("all");
  const [selected, setSelected] = useState<StaffWorkerRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const openWorker = (w: StaffWorkerRecord) => {
    setSelected(w);
    setDrawerOpen(true);
  };
  const closeDrawer = () => {
    setDrawerOpen(false);
    setTimeout(() => setSelected(null), 300);
  };

  const loadWorkers = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [workspace, factoryList, staffList, managerRows] = await Promise.all([
        fetchStaffWorkspace(user as UserRecord),
        fetchFactories(),
        pb.collection("users").getFullList<UserRecord>({
          filter: `role="staff" || role="admin"`,
          sort: "full_name,username",
        }),
        fetchFactoryManagers(user.id),
      ]);
      setWorkers(workspace.workers);
      setFactories(factoryList);
      setStaffUsers(staffList);
      setManagedFactoryIds(
        new Set(managerRows.filter((item) => isFactoryAssignmentActive(item)).map((item) => item.factory)),
      );
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadWorkers();
  }, [loadWorkers]);

  const filteredWorkers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return workers.filter((worker) => {
      const latest = worker.latestHistory;
      const haystack = [
        worker.user.full_name,
        worker.user.username,
        worker.user.phone,
        worker.user.employee_code,
        worker.user.cccd,
        latest?.employee_code,
        latest?.worker_name_snapshot,
        latest?.worker_cccd_snapshot,
        latest?.expand?.factory?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (query && !haystack.includes(query)) return false;

      if (scope === "qlnm" && !worker.reasons.includes("qlnm")) return false;
      if (scope === "nvtd" && !worker.reasons.includes("nvtd")) return false;
      if (scope === "working" && latest?.status !== "working") return false;
      if (scope === "left" && latest?.status !== "left") return false;

      return true;
    });
  }, [scope, search, workers]);

  return (
    <PageContainer
      title="Lao động trong quyền"
      subtitle="Tìm theo mã NV, họ tên, CCCD và nhà máy gần nhất"
    >
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Tìm mã NV, họ tên, CCCD, nhà máy..."
          className="rounded-full pl-9"
        />
      </div>

      <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <ScopeChip label="Tất cả" active={scope === "all"} onClick={() => setScope("all")} />
        <ScopeChip label="Nhà máy tôi quản lý" active={scope === "qlnm"} onClick={() => setScope("qlnm")} />
        <ScopeChip label="Người tôi tuyển" active={scope === "nvtd"} onClick={() => setScope("nvtd")} />
        <ScopeChip label="Đang làm" active={scope === "working"} onClick={() => setScope("working")} />
        <ScopeChip label="Đã nghỉ" active={scope === "left"} onClick={() => setScope("left")} />
      </div>

      <div className="text-xs text-muted-foreground">
        Tổng {filteredWorkers.length} hồ sơ hiển thị trong phạm vi 90 ngày gần đây.
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border/60 bg-card p-4 text-sm text-muted-foreground">
          Đang tải danh sách lao động...
        </div>
      ) : filteredWorkers.length === 0 ? (
        <EmptyState
          icon={UserRoundSearch}
          title="Không có hồ sơ phù hợp"
          description="Thử đổi bộ lọc hoặc tìm theo mã NV, CCCD, tên nhà máy gần nhất."
        />
      ) : (
        filteredWorkers.map((worker) => {
          const latest = worker.latestHistory;
          const statusTone = latest?.status === "working" ? "success" : "neutral";

          return (
            <button
              key={worker.user.id}
              type="button"
              onClick={() => openWorker(worker)}
              className="list-card border-l-primary block w-full text-left"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    {worker.user.full_name || worker.user.username || "Người lao động"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    Mã NV: {latest?.employee_code || worker.user.employee_code || "Chưa có"} · CCCD:{" "}
                    {maskCccd(latest?.worker_cccd_snapshot || worker.user.cccd)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {latest?.expand?.factory?.name || "Chưa có nhà máy"} · Người tuyển:{" "}
                    {latest?.expand?.recruiter_staff?.full_name ||
                      latest?.expand?.recruiter_staff?.username ||
                      "Chưa gán"}
                  </div>
                </div>

                {user?.role === "admin" ? (
                  <StatusChip tone="info" icon={ShieldCheck}>
                    Admin
                  </StatusChip>
                ) : (
                  <StatusChip tone={statusTone}>{latest?.status === "working" ? "Đang làm" : "Đã nghỉ"}</StatusChip>
                )}
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {worker.reasons.includes("qlnm") && <StatusChip tone="info">Thuộc nhà máy phụ trách</StatusChip>}
                {worker.reasons.includes("nvtd") && <StatusChip tone="primary">Bạn là người tuyển</StatusChip>}
                {(worker.canReportAdvance || worker.canReportLeave || worker.canReportJoin) && (
                  <StatusChip tone="success">Có thể thao tác</StatusChip>
                )}
              </div>
            </button>
          );
        })
      )}

      <WorkerQuickDrawer
        worker={selected}
        open={drawerOpen}
        viewer={user as UserRecord}
        factories={factories}
        managedFactoryIds={managedFactoryIds}
        staffUsers={staffUsers}
        onClose={closeDrawer}
        onDataChanged={loadWorkers}
      />
    </PageContainer>
  );
}

type DrawerView = "summary" | "leave" | "join" | "advance" | "bank" | "payroll";

function WorkerQuickDrawer({
  worker,
  open,
  viewer,
  factories,
  managedFactoryIds,
  staffUsers,
  onClose,
  onDataChanged,
}: {
  worker: StaffWorkerRecord | null;
  open: boolean;
  viewer: UserRecord;
  factories: FactoryRecord[];
  managedFactoryIds: Set<string>;
  staffUsers: UserRecord[];
  onClose: () => void;
  onDataChanged: () => void;
}) {
  const navigate = useNavigate();
  const [view, setView] = useState<DrawerView>("summary");
  const [leaveDate, setLeaveDate] = useState(todayDate());
  const [leaveNote, setLeaveNote] = useState("");
  const [joinForm, setJoinForm] = useState({ factory: "", employee_code: "", worker_name_snapshot: "", worker_cccd_snapshot: "", recruiter_staff: "", join_date: todayDate(), note: "" });
  const [amountText, setAmountText] = useState("");
  const [advanceReason, setAdvanceReason] = useState("");
  const [bankChoice, setBankChoice] = useState<"worker" | "viewer">("worker");
  const [bankForm, setBankForm] = useState({ bank_name: "", bank_account_number: "", bank_account_name: "" });
  const [submitting, setSubmitting] = useState(false);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [attendanceItems, setAttendanceItems] = useState<Array<{ id: string; month?: string; round_no?: number; created?: string }>>([]);
  const [salaryItems, setSalaryItems] = useState<Array<{ id: string; month?: string; round_no?: number; totals?: { net?: number }; created?: string }>>([]);

  useEffect(() => {
    if (!worker) return;
    setView("summary");
    setLeaveDate(todayDate());
    setLeaveNote("");
    setAmountText("");
    setAdvanceReason("");
    const latest = worker.latestHistory;
    setJoinForm({
      factory: "",
      employee_code: latest?.employee_code || worker.user.employee_code || "",
      worker_name_snapshot: latest?.worker_name_snapshot || worker.user.full_name || "",
      worker_cccd_snapshot: latest?.worker_cccd_snapshot || worker.user.cccd || "",
      recruiter_staff: viewer?.id || "",
      join_date: todayDate(),
      note: "",
    });
    setBankForm({
      bank_name: worker.user.bank_name || "",
      bank_account_number: worker.user.bank_account_number || "",
      bank_account_name: worker.user.bank_account_name || "",
    });
  }, [worker, viewer?.id]);

  useEffect(() => {
    if (view !== "payroll" || !worker || !viewer?.id) return;
    let alive = true;
    setPayrollLoading(true);
    Promise.all([
      pb.collection("check_attendance_items").getFullList({ filter: `user="${worker.user.id}"`, sort: "-created" }).catch(() => []),
      pb.collection("check_salary_items").getFullList({ filter: `user="${worker.user.id}"`, sort: "-created" }).catch(() => []),
    ]).then(([attendanceRows, salaryRows]) => {
      if (!alive) return;
      setAttendanceItems(attendanceRows as typeof attendanceItems);
      setSalaryItems(salaryRows as typeof salaryItems);
    }).finally(() => { if (alive) setPayrollLoading(false); });
    return () => { alive = false; };
  }, [view, worker, viewer?.id]);

  const joinableFactories = useMemo(() => {
    if (viewer?.role === "admin") return factories;
    if (worker && isRecentRecruiter(viewer, worker.histories)) return factories;
    return factories.filter((factory) => managedFactoryIds.has(factory.id));
  }, [factories, managedFactoryIds, viewer, worker]);

  const latest = worker?.latestHistory ?? null;
  const isWorking = latest?.status === "working" && !latest.leave_date;
  const activeHistory = worker?.histories.find((h) => h.status === "working" && !h.leave_date) || null;

  const submitLeave = async () => {
    if (!worker || !activeHistory || !viewer?.id) return;
    if (!leaveDate) { toast.warning("Chọn ngày nghỉ"); return; }
    setSubmitting(true);
    try {
      await updateEmploymentHistory(activeHistory.id, { leave_date: leaveDate, status: "left", note: leaveNote.trim() });
      const updated = await fetchEmploymentHistories([worker.user.id]);
      const newLatest = getLatestEmploymentHistory(updated);
      await syncLegacyUserWorkFields(worker.user.id, newLatest);
      await createStaffActionLog({ actor: viewer, targetUserId: worker.user.id, targetCollection: "employment_histories", targetRecord: activeHistory.id, action: "report_leave", note: "Báo nghỉ từ danh sách lao động" });
      toast.success("Đã cập nhật ngày nghỉ");
      onClose();
      onDataChanged();
    } catch (e: any) { toast.error(e?.message || "Lỗi báo nghỉ"); } finally { setSubmitting(false); }
  };

  const submitJoin = async () => {
    if (!worker || !viewer?.id) return;
    if (!joinForm.factory || !joinForm.join_date || !joinForm.worker_name_snapshot || !joinForm.worker_cccd_snapshot) { toast.warning("Điền đủ thông tin"); return; }
    if (!canReportJoin(viewer, worker.histories, managedFactoryIds, joinForm.factory)) {
      toast.error("Bạn không có quyền báo đi làm tại nhà máy đã chọn");
      return;
    }
    setSubmitting(true);
    try {
      const active = await findActiveEmploymentByUser(worker.user.id);
      if (active) { toast.error("Cần báo nghỉ nhà máy cũ trước"); setSubmitting(false); return; }
      const created = await createEmploymentHistory({
        user: worker.user.id, factory: joinForm.factory, employee_code: joinForm.employee_code.trim(),
        worker_name_snapshot: joinForm.worker_name_snapshot.trim(), worker_cccd_snapshot: joinForm.worker_cccd_snapshot.trim(),
        recruiter_staff: joinForm.recruiter_staff || viewer.id, join_date: joinForm.join_date, status: "working", note: joinForm.note.trim(),
      });
      await syncLegacyUserWorkFields(worker.user.id, created);
      await createStaffActionLog({ actor: viewer, targetUserId: worker.user.id, targetCollection: "employment_histories", targetRecord: created.id, action: "report_join", note: "Báo đi làm mới từ danh sách" });
      toast.success("Đã tạo bản ghi đi làm mới");
      onClose();
      onDataChanged();
    } catch (e: any) { toast.error(e?.message || "Lỗi báo đi làm"); } finally { setSubmitting(false); }
  };

  const submitAdvance = async () => {
    if (!worker || !viewer?.id || !latest) return;
    const amount = Number(amountText.replace(/\D/g, ""));
    if (!amount) { toast.warning("Nhập số tiền"); return; }
    if (!advanceReason.trim()) { toast.warning("Nhập lý do"); return; }
    const bankSource = bankChoice === "viewer" ? viewer : worker.user;
    if (!bankSource.bank_account_number) { toast.warning("Tài khoản ngân hàng chưa có"); return; }
    setSubmitting(true);
    try {
      const existingAdvances = await pb.collection("advances").getFullList({
        filter: `user="${worker.user.id}" && (status="pending" || (status="accepted" && recovery_status="none"))`,
      });
      const outstanding = existingAdvances.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
      const settings = await (await import("@/lib/app-settings")).fetchAppSettings();
      const limit = Number(settings.advance_limit || 0);
      if (limit <= 0) {
        toast.error("Admin chưa cài hạn mức Ứng lương");
        setSubmitting(false);
        return;
      }
      if (outstanding + amount > limit) {
        toast.error(`Vượt hạn mức ứng lương. Đang dùng ${outstanding.toLocaleString("vi-VN")} đ / ${limit.toLocaleString("vi-VN")} đ. Còn lại ${(limit - outstanding).toLocaleString("vi-VN")} đ`);
        setSubmitting(false);
        return;
      }
      await pb.collection("advances").create({
        user: worker.user.id, requested_by: viewer.id,
        employee_code: latest.employee_code || worker.user.employee_code || "",
        full_name: latest.worker_name_snapshot || worker.user.full_name || "",
        company: latest.expand?.factory?.name || worker.user.company || "",
        phone: worker.user.phone || "",
        bank_name: bankSource.bank_name || "", bank_account_number: bankSource.bank_account_number || "", bank_account_name: bankSource.bank_account_name || "",
        amount, reason: advanceReason.trim(), status: "pending", recovery_status: "none",
      });
      await createStaffActionLog({ actor: viewer, targetUserId: worker.user.id, targetCollection: "advances", action: "report_advance", note: "Báo ứng từ danh sách" });
      toast.success("Đã gửi yêu cầu ứng lương");
      onClose();
      onDataChanged();
    } catch (e: any) { toast.error(e?.message || "Lỗi báo ứng"); } finally { setSubmitting(false); }
  };

  const submitBank = async () => {
    if (!worker || !viewer?.id) return;
    setSubmitting(true);
    try {
      await pb.collection("users").update(worker.user.id, bankForm);
      await createStaffActionLog({ actor: viewer, targetUserId: worker.user.id, targetCollection: "users", targetRecord: worker.user.id, action: "update_bank", note: "Cập nhật ngân hàng từ danh sách" });
      toast.success("Đã cập nhật ngân hàng");
      onClose();
      onDataChanged();
    } catch (e: any) { toast.error(e?.message || "Lỗi cập nhật"); } finally { setSubmitting(false); }
  };

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent className="max-h-[90dvh]">
        <DrawerHeader>
          <DrawerTitle>{worker?.user.full_name || worker?.user.username || "Người lao động"}</DrawerTitle>
          <DrawerDescription>
            {latest?.expand?.factory?.name || "Chưa có nhà máy"} · {isWorking ? "Đang đi làm" : "Đã nghỉ"}
          </DrawerDescription>
        </DrawerHeader>

        <div className="space-y-4 overflow-y-auto px-4 pb-6">
          {view === "summary" && worker && (
            <>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <InfoCell label="Họ tên (NM)" value={latest?.worker_name_snapshot || worker.user.full_name || "—"} />
                <InfoCell label="CCCD (NM)" value={maskCccd(latest?.worker_cccd_snapshot || worker.user.cccd)} />
                <InfoCell label="Mã NV" value={latest?.employee_code || worker.user.employee_code || "—"} />
                <InfoCell label="SĐT" value={worker.user.phone || "—"} />
                <InfoCell label="Nhà máy" value={latest?.expand?.factory?.name || "—"} />
                <InfoCell label="Người tuyển" value={latest?.expand?.recruiter_staff?.full_name || latest?.expand?.recruiter_staff?.username || "—"} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                {worker.canReportLeave && (
                  <ActionButton icon={Clock3} label="Báo nghỉ" onClick={() => setView("leave")} />
                )}
                {worker.canReportJoin && (
                  <ActionButton icon={Plus} label="Báo đi làm mới" onClick={() => setView("join")} />
                )}
                {worker.canReportAdvance && (
                  <ActionButton icon={Wallet} label="Báo ứng lương" onClick={() => setView("advance")} />
                )}
                {worker.canViewPayroll && (
                  <ActionButton icon={CalendarRange} label="Check công lương" onClick={() => setView("payroll")} />
                )}
                {worker.canReportAdvance && (
                  <ActionButton icon={Landmark} label="Cập nhật ngân hàng" onClick={() => setView("bank")} />
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  const id = worker.user.id;
                  onClose();
                  setTimeout(() => navigate({ to: "/staff/workers/$workerId", params: { workerId: id } }), 150);
                }}
                className="flex w-full items-center justify-between rounded-2xl border border-border/60 bg-card px-4 py-3 text-sm font-medium shadow-soft"
              >
                <div className="flex items-center gap-2">
                  <UserSquare2 className="h-4 w-4 text-primary" />
                  <span>Xem chi tiết đầy đủ</span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            </>
          )}

          {view === "leave" && (
            <div className="space-y-3">
              <div className="text-sm font-semibold">Báo nghỉ nhà máy hiện tại</div>
              {!activeHistory ? (
                <div className="rounded-xl border bg-card p-3 text-sm text-muted-foreground">Không có bản ghi đang làm để báo nghỉ.</div>
              ) : (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">Ngày nghỉ</Label>
                    <Input type="date" value={leaveDate} onChange={(e) => setLeaveDate(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Ghi chú</Label>
                    <Textarea rows={3} value={leaveNote} onChange={(e) => setLeaveNote(e.target.value)} placeholder="Ví dụ: nghỉ việc, chuyển nhà máy..." />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setView("summary")} className="flex-1">Quay lại</Button>
                    <Button onClick={submitLeave} disabled={submitting} className="flex-1">{submitting ? "Đang lưu..." : "Xác nhận nghỉ"}</Button>
                  </div>
                </>
              )}
            </div>
          )}

          {view === "join" && (
            <div className="space-y-3">
              <div className="text-sm font-semibold">Báo đi làm nhà máy mới</div>
              <div className="space-y-1">
                <Label className="text-xs">Nhà máy</Label>
                <Select value={joinForm.factory} onValueChange={(v) => setJoinForm((f) => ({ ...f, factory: v }))}>
                  <SelectTrigger><SelectValue placeholder="Chọn nhà máy" /></SelectTrigger>
                  <SelectContent>{joinableFactories.map((f) => (<SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Họ tên (NM)</Label>
                  <Input value={joinForm.worker_name_snapshot} onChange={(e) => setJoinForm((f) => ({ ...f, worker_name_snapshot: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">CCCD (NM)</Label>
                  <Input value={joinForm.worker_cccd_snapshot} onChange={(e) => setJoinForm((f) => ({ ...f, worker_cccd_snapshot: e.target.value.replace(/[^\d]/g, "") }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Mã NV</Label>
                  <Input value={joinForm.employee_code} onChange={(e) => setJoinForm((f) => ({ ...f, employee_code: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Ngày vào làm</Label>
                  <Input type="date" value={joinForm.join_date} onChange={(e) => setJoinForm((f) => ({ ...f, join_date: e.target.value }))} max={todayDate()} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Người tuyển</Label>
                <Select value={joinForm.recruiter_staff} onValueChange={(v) => setJoinForm((f) => ({ ...f, recruiter_staff: v }))}>
                  <SelectTrigger><SelectValue placeholder="Chọn người tuyển" /></SelectTrigger>
                  <SelectContent>{staffUsers.map((s) => (<SelectItem key={s.id} value={s.id}>{s.full_name || s.username || s.id}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Ghi chú</Label>
                <Textarea rows={2} value={joinForm.note} onChange={(e) => setJoinForm((f) => ({ ...f, note: e.target.value }))} placeholder="Tuỳ chọn" />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setView("summary")} className="flex-1">Quay lại</Button>
                <Button onClick={submitJoin} disabled={submitting} className="flex-1">{submitting ? "Đang lưu..." : "Tạo bản ghi"}</Button>
              </div>
            </div>
          )}

          {view === "advance" && worker && (
            <AdvanceForm
              worker={worker}
              viewer={viewer}
              amountText={amountText}
              setAmountText={setAmountText}
              advanceReason={advanceReason}
              setAdvanceReason={setAdvanceReason}
              bankChoice={bankChoice}
              setBankChoice={setBankChoice}
              submitting={submitting}
              onSubmit={submitAdvance}
              onBack={() => setView("summary")}
            />
          )}

          {view === "bank" && (
            <div className="space-y-3">
              <div className="text-sm font-semibold">Cập nhật tài khoản ngân hàng</div>
              <div className="space-y-1">
                <Label className="text-xs">Ngân hàng</Label>
                <Input value={bankForm.bank_name} onChange={(e) => setBankForm((f) => ({ ...f, bank_name: e.target.value }))} placeholder="Tên ngân hàng" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Số TK</Label>
                  <Input value={bankForm.bank_account_number} onChange={(e) => setBankForm((f) => ({ ...f, bank_account_number: e.target.value.replace(/\D/g, "") }))} inputMode="numeric" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tên TK</Label>
                  <Input value={bankForm.bank_account_name} onChange={(e) => setBankForm((f) => ({ ...f, bank_account_name: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setView("summary")} className="flex-1">Quay lại</Button>
                <Button onClick={submitBank} disabled={submitting} className="flex-1">{submitting ? "Đang lưu..." : "Lưu ngân hàng"}</Button>
              </div>
            </div>
          )}

          {view === "payroll" && (
            <div className="space-y-4">
              <div className="text-sm font-semibold">Check công / lương gần nhất</div>
              {payrollLoading ? (
                <div className="rounded-xl border bg-card p-3 text-sm text-muted-foreground">Đang tải dữ liệu...</div>
              ) : (
                <>
                  <div>
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Check công</div>
                    {attendanceItems.length === 0 ? (
                      <div className="rounded-xl border border-border/60 bg-card p-3 text-sm text-muted-foreground">Chưa có bản ghi check công.</div>
                    ) : (
                      <div className="space-y-2">
                        {attendanceItems.slice(0, 6).map((item) => (
                          <div key={item.id} className="rounded-xl border border-border/60 bg-card p-3 text-sm">
                            <div className="font-semibold">{item.month || "Không rõ tháng"} · Lần {item.round_no || 1}</div>
                            <div className="mt-0.5 text-[11px] text-muted-foreground">Tạo lúc {item.created ? new Date(item.created).toLocaleDateString("vi-VN") : "—"}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Check lương</div>
                    {salaryItems.length === 0 ? (
                      <div className="rounded-xl border border-border/60 bg-card p-3 text-sm text-muted-foreground">Chưa có bản ghi check lương.</div>
                    ) : (
                      <div className="space-y-2">
                        {salaryItems.slice(0, 6).map((item) => (
                          <div key={item.id} className="rounded-xl border border-border/60 bg-card p-3 text-sm">
                            <div className="font-semibold">{item.month || "Không rõ tháng"} · Lần {item.round_no || 1}</div>
                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                              Thực nhận: {new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(item.totals?.net || 0)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
              <Button variant="outline" onClick={() => setView("summary")} className="w-full">Quay lại</Button>
            </div>
          )}
        </div>

        <DrawerFooter>
          <Button variant="outline" onClick={onClose}>Đóng</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function ActionButton({ icon: Icon, label, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-[72px] flex-col items-start gap-1.5 rounded-2xl border border-border/60 bg-card p-3 text-left shadow-soft active:scale-[0.98]">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-xs font-semibold">{label}</div>
    </button>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/35 p-2.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  );
}

function ScopeChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-full bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
          : "rounded-full border border-border/60 bg-card px-3 py-2 text-xs font-medium text-muted-foreground"
      }
    >
      {label}
    </button>
  );
}

function formatMoneyDisplay(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("vi-VN");
}

function AdvanceForm({
  worker,
  viewer,
  amountText,
  setAmountText,
  advanceReason,
  setAdvanceReason,
  bankChoice,
  setBankChoice,
  submitting,
  onSubmit,
  onBack,
}: {
  worker: StaffWorkerRecord;
  viewer: UserRecord;
  amountText: string;
  setAmountText: (v: string) => void;
  advanceReason: string;
  setAdvanceReason: (v: string) => void;
  bankChoice: "worker" | "viewer";
  setBankChoice: (v: "worker" | "viewer") => void;
  submitting: boolean;
  onSubmit: () => void;
  onBack: () => void;
}) {
  const { data: settings } = useAppSettings();
  const limit = Number(settings.advance_limit || 0);

  const workerBank = worker.user.bank_account_number
    ? `${worker.user.bank_name || "NH"} · ${worker.user.bank_account_number} · ${worker.user.bank_account_name || ""}`
    : "";
  const viewerBank = viewer.bank_account_number
    ? `${viewer.bank_name || "NH"} · ${viewer.bank_account_number} · ${viewer.bank_account_name || ""}`
    : "";

  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold">Báo ứng lương</div>

      {limit > 0 && (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-2.5 text-xs text-muted-foreground">
          Hạn mức ứng lương: <span className="font-semibold text-foreground">{limit.toLocaleString("vi-VN")} đ</span>
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-xs">Số tiền</Label>
        <Input
          value={formatMoneyDisplay(amountText)}
          onChange={(e) => setAmountText(e.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
          placeholder="Nhập số tiền"
        />
        {amountText && (
          <div className="text-[11px] text-muted-foreground">
            = {Number(amountText).toLocaleString("vi-VN")} đ
          </div>
        )}
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Tài khoản nhận tiền</Label>
        <div className="space-y-1.5">
          {workerBank && (
            <button
              type="button"
              onClick={() => setBankChoice("worker")}
              className={`flex w-full items-start gap-2 rounded-xl border p-2.5 text-left text-xs transition ${bankChoice === "worker" ? "border-primary bg-primary/5" : "border-border bg-card"}`}
            >
              <div className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${bankChoice === "worker" ? "border-primary bg-primary" : "border-muted-foreground"}`} />
              <div>
                <div className="font-medium">STK của NLĐ</div>
                <div className="text-muted-foreground">{workerBank}</div>
              </div>
            </button>
          )}
          {viewerBank && (
            <button
              type="button"
              onClick={() => setBankChoice("viewer")}
              className={`flex w-full items-start gap-2 rounded-xl border p-2.5 text-left text-xs transition ${bankChoice === "viewer" ? "border-primary bg-primary/5" : "border-border bg-card"}`}
            >
              <div className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${bankChoice === "viewer" ? "border-primary bg-primary" : "border-muted-foreground"}`} />
              <div>
                <div className="font-medium">STK của tôi (Staff)</div>
                <div className="text-muted-foreground">{viewerBank}</div>
              </div>
            </button>
          )}
          {!workerBank && !viewerBank && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
              Chưa có STK nào. Cập nhật ngân hàng trước khi báo ứng.
            </div>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Lý do</Label>
        <Textarea rows={3} value={advanceReason} onChange={(e) => setAdvanceReason(e.target.value)} placeholder="Ví dụ: ứng tiền sinh hoạt..." />
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack} className="flex-1">Quay lại</Button>
        <Button onClick={onSubmit} disabled={submitting || (!workerBank && !viewerBank)} className="flex-1">
          {submitting ? "Đang gửi..." : "Gửi yêu cầu"}
        </Button>
      </div>
    </div>
  );
}
