import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarRange,
  CheckCircle2,
  Clock3,
  Download,
  Landmark,
  NotebookPen,
  Pencil,
  Plus,
  UserSquare2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { exportToExcel } from "@/lib/excel";
import {
  createEmploymentHistory,
  fetchEmploymentHistories,
  findActiveEmploymentByUser,
  getLatestEmploymentHistory,
  maskCccd,
  syncLegacyUserWorkFields,
  updateEmploymentHistory,
  type EmploymentHistoryRecord,
} from "@/lib/employment";
import {
  fetchFactories,
  fetchFactoryManagers,
  isFactoryAssignmentActive,
  type FactoryRecord,
} from "@/lib/factories";
import { fetchMainHouses, type MainHouseRecord } from "@/lib/main-houses";
import { createStaffActionLog } from "@/lib/staff-log";
import { CccdManager } from "@/components/cccd/CccdManager";
import {
  canAccessStaffWorkspace,
  canReportAdvance,
  canReportJoin,
  canReportLeave,
  canViewPayroll,
  getStaffReasonsForHistory,
  isRecentRecruiter,
} from "@/lib/staff-permissions";
import { pb, type UserRecord } from "@/lib/pocketbase";
import { VN_BANKS } from "@/lib/vn-banks";

export const Route = createFileRoute("/_authenticated/staff/workers/$workerId")({
  component: StaffWorkerDetailPage,
});

type SalaryItem = {
  id: string;
  month?: string;
  round_no?: number;
  totals?: {
    net?: number;
  };
  created?: string;
};

type AttendanceItem = {
  id: string;
  month?: string;
  round_no?: number;
  created?: string;
};

type AdvanceItem = {
  id: string;
  amount?: number;
  reason?: string;
  status?: string;
  recovery_status?: string;
  created?: string;
};

function StaffWorkerDetailPage() {
  const { workerId } = Route.useParams();
  const { user: viewer } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [workerUser, setWorkerUser] = useState<UserRecord | null>(null);
  const [histories, setHistories] = useState<EmploymentHistoryRecord[]>([]);
  const [factories, setFactories] = useState<FactoryRecord[]>([]);
  const [managedFactoryIds, setManagedFactoryIds] = useState<Set<string>>(new Set());
  const [staffUsers, setStaffUsers] = useState<UserRecord[]>([]);
  const [attendanceItems, setAttendanceItems] = useState<AttendanceItem[]>([]);
  const [salaryItems, setSalaryItems] = useState<SalaryItem[]>([]);
  const [advances, setAdvances] = useState<AdvanceItem[]>([]);

  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [payrollOpen, setPayrollOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [editingHistory, setEditingHistory] = useState<EmploymentHistoryRecord | null>(null);

  const [amountText, setAmountText] = useState("");
  const [advanceReason, setAdvanceReason] = useState("");
  const [leaveDate, setLeaveDate] = useState(todayDate());
  const [leaveNote, setLeaveNote] = useState("");
  const [joinForm, setJoinForm] = useState({
    factory: "",
    main_house: "",
    employee_code: "",
    worker_name_snapshot: "",
    worker_cccd_snapshot: "",
    recruiter_staff: "",
    join_date: todayDate(),
    note: "",
  });
  const [bankForm, setBankForm] = useState({
    bank_name: "",
    bank_account_number: "",
    bank_account_name: "",
  });
  const [historyForm, setHistoryForm] = useState({
    employee_code: "",
    worker_name_snapshot: "",
    worker_cccd_snapshot: "",
    recruiter_staff: "",
    main_house: "",
    join_date: "",
    leave_date: "",
    status: "working",
    note: "",
  });
  const [mainHouses, setMainHouses] = useState<MainHouseRecord[]>([]);

  useEffect(() => {
    if (!viewer?.id || !canAccessStaffWorkspace(viewer)) return;

    let alive = true;
    setLoading(true);

    Promise.all([
      fetchEmploymentHistories([workerId]),
      fetchFactories(),
      fetchFactoryManagers(viewer.id),
      pb
        .collection("users")
        .getOne(workerId)
        .catch(() => null),
      pb
        .collection("users")
        .getList(1, 200, {
          filter: `role="staff" || role="admin"`,
          sort: "full_name,username",
        })
        .then((res) => res.items)
        .catch(() => []),
      pb
        .collection("advances")
        .getList(1, 50, {
          filter: `user="${workerId}"`,
          sort: "-created",
        })
        .then((res) => res.items)
        .catch(() => []),
      fetchMainHouses().catch(() => [] as MainHouseRecord[]),
    ])
      .then(
        ([
          historyRows,
          factoryRows,
          managerRows,
          rawUser,
          staffRows,
          advanceRows,
          mainHouseRows,
        ]) => {
          if (!alive) return;

          const managedFactoryIds = new Set(
            managerRows
              .filter((item) => isFactoryAssignmentActive(item))
              .map((item) => item.factory),
          );
          const canAccessWorker =
            viewer.role === "admin" ||
            isRecentRecruiter(viewer, historyRows) ||
            historyRows.some(
              (history) =>
                getStaffReasonsForHistory(viewer.id, history, managedFactoryIds).length > 0,
            );

          if (!canAccessWorker) {
            setLoading(false);
            return;
          }

          const historyUser = historyRows[0]?.expand?.user;
          const userRecord = (historyUser || rawUser) as UserRecord | null;
          const latest = getLatestEmploymentHistory(historyRows);

          setWorkerUser(userRecord);
          setHistories(historyRows);
          setManagedFactoryIds(managedFactoryIds);
          setFactories(factoryRows);
          setMainHouses(mainHouseRows);
          setStaffUsers(staffRows as UserRecord[]);
          setAdvances(advanceRows as AdvanceItem[]);
          setJoinForm((prev) => ({
            ...prev,
            employee_code: latest?.employee_code || userRecord?.employee_code || "",
            worker_name_snapshot: latest?.worker_name_snapshot || userRecord?.full_name || "",
            worker_cccd_snapshot: latest?.worker_cccd_snapshot || userRecord?.cccd || "",
            recruiter_staff: latest?.recruiter_staff || viewer.id,
            main_house: latest?.main_house || "",
          }));
          setBankForm({
            bank_name: userRecord?.bank_name || "",
            bank_account_number: userRecord?.bank_account_number || "",
            bank_account_name: userRecord?.bank_account_name || "",
          });
        },
      )
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [navigate, viewer, workerId]);

  useEffect(() => {
    if (!payrollOpen || !workerUser?.id || !viewer?.id) return;
    if (!canViewPayroll(viewer, histories)) return;

    let alive = true;

    Promise.all([
      pb
        .collection("check_attendance_items")
        .getList(1, 20, {
          filter: `user="${workerUser.id}"`,
          sort: "-created",
        })
        .then((res) => res.items)
        .catch(() => []),
      pb
        .collection("check_salary_items")
        .getList(1, 20, {
          filter: `user="${workerUser.id}"`,
          sort: "-created",
        })
        .then((res) => res.items)
        .catch(() => []),
    ]).then(([attendanceRows, salaryRows]) => {
      if (!alive) return;
      setAttendanceItems(attendanceRows as AttendanceItem[]);
      setSalaryItems(salaryRows as SalaryItem[]);
    });

    return () => {
      alive = false;
    };
  }, [histories, payrollOpen, viewer, workerUser?.id]);

  const latestHistory = useMemo(() => getLatestEmploymentHistory(histories), [histories]);
  const activeHistory = useMemo(
    () => histories.find((item) => item.status === "working" && !item.leave_date) || null,
    [histories],
  );
  const recentRecruiter = isRecentRecruiter(viewer, histories);
  const canReportAdvanceForWorker = canReportAdvance(viewer, histories);
  const canViewPayrollForWorker = canViewPayroll(viewer, histories);
  const canReportLeaveForWorker = canReportLeave(
    viewer,
    activeHistory,
    histories,
    managedFactoryIds,
  );
  const canSubmitJoinForWorker = canReportJoin(
    viewer,
    histories,
    managedFactoryIds,
    joinForm.factory,
  );
  const canOpenJoinForm = canReportJoin(viewer, histories, managedFactoryIds);
  const canUpdateBankForWorker = canReportAdvanceForWorker;
  const canDoAnyAction =
    canReportAdvanceForWorker ||
    canViewPayrollForWorker ||
    canReportLeaveForWorker ||
    canOpenJoinForm ||
    canUpdateBankForWorker;
  const joinableFactories = useMemo(() => {
    if (viewer?.role === "admin" || recentRecruiter) return factories;
    return factories.filter((factory) => managedFactoryIds.has(factory.id));
  }, [factories, managedFactoryIds, recentRecruiter, viewer?.role]);

  const reloadHistories = async () => {
    const nextRows = await fetchEmploymentHistories([workerId]);
    setHistories(nextRows);
    const nextLatest = getLatestEmploymentHistory(nextRows);
    await syncLegacyUserWorkFields(workerId, nextLatest);
  };

  const exportHistory = async () => {
    if (!histories.length) {
      toast.warning("Chưa có lịch sử để xuất");
      return;
    }

    exportToExcel(`lich_su_lao_dong_${workerId}_${Date.now()}`, {
      "Lịch sử đi làm": histories.map((history, index) => ({
        STT: index + 1,
        "Nhà máy": history.expand?.factory?.name || "",
        "Mã nhân viên": history.employee_code || "",
        "Họ tên tại nhà máy": history.worker_name_snapshot,
        CCCD: history.worker_cccd_snapshot,
        "Người tuyển":
          history.expand?.recruiter_staff?.full_name ||
          history.expand?.recruiter_staff?.username ||
          "",
        "Ngày vào": history.join_date || "",
        "Ngày nghỉ": history.leave_date || "",
        "Trạng thái": history.status === "working" ? "Đang làm" : "Đã nghỉ",
        "Ghi chú": history.note || "",
      })),
    });

    toast.success("Đã xuất Excel");
  };

  const submitAdvance = async () => {
    if (!workerUser || !latestHistory || !viewer?.id) return;
    if (!canReportAdvanceForWorker) {
      toast.error("Bạn không có quyền báo ứng cho hồ sơ này");
      return;
    }

    const amount = Number(amountText.replace(/\D/g, ""));
    if (!amount) {
      toast.warning("Nhập số tiền ứng");
      return;
    }
    if (!advanceReason.trim()) {
      toast.warning("Nhập lý do ứng");
      return;
    }

    const existingAdvances = await pb.collection("advances").getList(1, 100, {
      filter: `user="${workerUser.id}" && (status="pending" || (status="accepted" && recovery_status="none"))`,
    });
    const outstanding = existingAdvances.items.reduce(
      (sum: number, r: any) => sum + Number(r.amount || 0),
      0,
    );
    const settings = await (await import("@/lib/app-settings")).fetchAppSettings();
    const limit = Number(settings.advance_limit || 0);
    if (limit <= 0) {
      toast.error("Admin chưa cài hạn mức Ứng lương");
      return;
    }
    if (outstanding + amount > limit) {
      toast.error(
        `Vượt hạn mức ứng lương. Đang dùng ${outstanding.toLocaleString("vi-VN")} đ / ${limit.toLocaleString("vi-VN")} đ. Còn lại ${(limit - outstanding).toLocaleString("vi-VN")} đ`,
      );
      return;
    }

    const payload = {
      user: workerUser.id,
      requested_by: viewer.id,
      employee_code: latestHistory.employee_code || workerUser.employee_code || "",
      full_name: latestHistory.worker_name_snapshot || workerUser.full_name || "",
      company: latestHistory.expand?.factory?.name || workerUser.company || "",
      phone: workerUser.phone || "",
      bank_name: workerUser.bank_name || "",
      bank_account_number: workerUser.bank_account_number || "",
      bank_account_name: workerUser.bank_account_name || "",
      amount,
      reason: advanceReason.trim(),
      status: "pending",
      recovery_status: "none",
    };

    await pb.collection("advances").create(payload);
    await createStaffActionLog({
      actor: viewer,
      targetUserId: workerUser.id,
      targetCollection: "advances",
      action: "report_advance",
      after: payload,
      note: "Staff tạo yêu cầu ứng lương thay người lao động",
    });

    setAdvanceOpen(false);
    setAmountText("");
    setAdvanceReason("");
    toast.success("Đã gửi yêu cầu ứng lương");
  };

  const submitLeave = async () => {
    if (!canReportLeaveForWorker) {
      toast.error("Bạn không có quyền báo nghỉ cho hồ sơ này");
      return;
    }
    if (!activeHistory || !viewer?.id) {
      toast.warning("Không có bản ghi đang làm để báo nghỉ");
      return;
    }
    if (!leaveDate) {
      toast.warning("Chọn ngày nghỉ");
      return;
    }

    const before = { ...activeHistory };
    await updateEmploymentHistory(activeHistory.id, {
      leave_date: leaveDate,
      status: "left",
      note: leaveNote.trim(),
    });

    await reloadHistories();
    await createStaffActionLog({
      actor: viewer,
      targetUserId: workerId,
      targetCollection: "employment_histories",
      targetRecord: activeHistory.id,
      action: "report_leave",
      before,
      after: {
        leave_date: leaveDate,
        status: "left",
        note: leaveNote.trim(),
      },
      note: "Báo nghỉ cho người lao động",
    });

    setLeaveOpen(false);
    setLeaveNote("");
    setLeaveDate(todayDate());
    toast.success("Đã cập nhật ngày nghỉ");
  };

  const submitJoin = async () => {
    if (!viewer?.id || !workerUser) return;
    if (!joinForm.factory) return toast.warning("Chọn nhà máy");
    if (!joinForm.join_date) return toast.warning("Nhập ngày vào làm");
    if (!joinForm.recruiter_staff) return toast.warning("Chọn người tuyển");
    if (!joinForm.main_house) return toast.warning("Chọn nhà chính");
    if (!canSubmitJoinForWorker) {
      toast.error("Bạn không có quyền báo đi làm tại nhà máy đã chọn");
      return;
    }

    const active = await findActiveEmploymentByUser(workerUser.id);
    if (active) {
      toast.error("Người lao động vẫn đang ở nhà máy cũ, cần báo nghỉ trước");
      return;
    }

    const created = await createEmploymentHistory({
      user: workerUser.id,
      factory: joinForm.factory,
      main_house: joinForm.main_house,
      employee_code: joinForm.employee_code.trim(),
      worker_name_snapshot:
        joinForm.worker_name_snapshot.trim() || workerUser.full_name || workerUser.username || "",
      worker_cccd_snapshot: joinForm.worker_cccd_snapshot.trim() || workerUser.cccd || "",
      recruiter_staff: joinForm.recruiter_staff,
      join_date: joinForm.join_date,
      status: "working",
      note: joinForm.note.trim(),
    });

    await syncLegacyUserWorkFields(workerUser.id, created);
    await reloadHistories();
    await createStaffActionLog({
      actor: viewer,
      targetUserId: workerUser.id,
      targetCollection: "employment_histories",
      targetRecord: created.id,
      action: "report_join",
      after: created,
      note: "Báo đi làm nhà máy mới",
    });

    setJoinOpen(false);
    toast.success("Đã tạo bản ghi đi làm mới");
  };

  const submitBankUpdate = async () => {
    if (!workerUser || !viewer?.id) return;
    if (!canUpdateBankForWorker) {
      toast.error("Bạn không có quyền cập nhật ngân hàng cho hồ sơ này");
      return;
    }

    const before = {
      bank_name: workerUser.bank_name || "",
      bank_account_number: workerUser.bank_account_number || "",
      bank_account_name: workerUser.bank_account_name || "",
    };

    await pb.collection("users").update(workerUser.id, bankForm);
    await createStaffActionLog({
      actor: viewer,
      targetUserId: workerUser.id,
      targetCollection: "users",
      targetRecord: workerUser.id,
      action: "update_bank",
      before,
      after: bankForm,
      note: "Cập nhật tài khoản ngân hàng cho user",
    });

    setWorkerUser((current) => (current ? { ...current, ...bankForm } : current));
    setBankOpen(false);
    toast.success("Đã cập nhật tài khoản ngân hàng");
  };

  const openEditHistory = (history: EmploymentHistoryRecord) => {
    setEditingHistory(history);
    setHistoryForm({
      employee_code: history.employee_code || "",
      worker_name_snapshot: history.worker_name_snapshot || "",
      worker_cccd_snapshot: history.worker_cccd_snapshot || "",
      recruiter_staff: history.recruiter_staff || "",
      main_house: history.main_house || "",
      join_date: history.join_date?.slice(0, 10) || "",
      leave_date: history.leave_date?.slice(0, 10) || "",
      status: history.status || "working",
      note: history.note || "",
    });
  };

  const saveEditedHistory = async () => {
    if (!editingHistory || !viewer?.id) return;
    const before = { ...editingHistory };
    const updated = await updateEmploymentHistory(editingHistory.id, {
      employee_code: historyForm.employee_code.trim(),
      worker_name_snapshot: historyForm.worker_name_snapshot.trim(),
      worker_cccd_snapshot: historyForm.worker_cccd_snapshot.trim(),
      recruiter_staff: historyForm.recruiter_staff || undefined,
      main_house: historyForm.main_house || undefined,
      join_date: historyForm.join_date,
      leave_date: historyForm.leave_date || undefined,
      status: historyForm.status as "working" | "left",
      note: historyForm.note.trim(),
    });

    await reloadHistories();
    await createStaffActionLog({
      actor: viewer,
      targetUserId: workerId,
      targetCollection: "employment_histories",
      targetRecord: editingHistory.id,
      action: "update",
      before,
      after: updated,
      note: "Admin chỉnh sửa trực tiếp lịch sử đi làm",
    });

    setEditingHistory(null);
    toast.success("Đã lưu thay đổi lịch sử");
  };

  if (loading) {
    return (
      <PageContainer title="Chi tiết lao động" subtitle="Đang tải hồ sơ..." className="space-y-3">
        <div className="rounded-2xl border border-border/60 bg-card p-4 text-sm text-muted-foreground">
          Đang tải lịch sử đi làm và quyền thao tác...
        </div>
      </PageContainer>
    );
  }

  if (!workerUser) {
    return (
      <PageContainer title="Chi tiết lao động" subtitle="Không tìm thấy hồ sơ">
        <EmptyState
          icon={UserSquare2}
          title="Không tìm thấy user"
          description="Kiểm tra lại hồ sơ hoặc import lại dữ liệu trong phần admin."
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title={workerUser.full_name || workerUser.username || "Chi tiết lao động"}
      subtitle={latestHistory?.expand?.factory?.name || "Chưa có nhà máy gần nhất"}
      right={
        <button
          type="button"
          onClick={exportHistory}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground"
          aria-label="Xuất lịch sử"
        >
          <Download className="h-4 w-4" />
        </button>
      }
    >
      <Card className="space-y-3 rounded-2xl border-border/60 p-4 shadow-soft">
        <div className="flex flex-wrap items-center gap-2">
          {viewer?.role === "admin" ? (
            <StatusChip tone="info">Admin có toàn quyền sửa lịch sử</StatusChip>
          ) : recentRecruiter ? (
            <StatusChip tone="success">Bạn là người tuyển trong 3 lịch sử gần nhất</StatusChip>
          ) : canDoAnyAction ? (
            <StatusChip tone="info">Bạn có quyền theo nhà máy phụ trách</StatusChip>
          ) : (
            <StatusChip tone="neutral">Bạn chỉ có quyền xem</StatusChip>
          )}
          <StatusChip tone={latestHistory?.status === "working" ? "success" : "neutral"}>
            {latestHistory?.status === "working" ? "Đang làm" : "Đã nghỉ"}
          </StatusChip>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <InfoCell label="Họ tên gốc" value={workerUser.full_name || "Chưa có"} />
          <InfoCell label="CCCD gốc" value={workerUser.cccd || "Chưa có"} />
          <InfoCell label="Điện thoại" value={workerUser.phone || "Chưa có"} />
          <InfoCell
            label="Nhà máy gần nhất"
            value={latestHistory?.expand?.factory?.name || "Chưa có"}
          />
          <InfoCell label="Mã NV gần nhất" value={latestHistory?.employee_code || "Chưa có"} />
          <InfoCell
            label="Người tuyển gần nhất"
            value={
              latestHistory?.expand?.recruiter_staff?.full_name ||
              latestHistory?.expand?.recruiter_staff?.username ||
              "Chưa gán"
            }
          />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <ActionButton
          icon={Wallet}
          label="Báo ứng"
          disabled={!canReportAdvanceForWorker}
          onClick={() => setAdvanceOpen(true)}
        />
        <ActionButton
          icon={CalendarRange}
          label="Check công lương"
          disabled={!canViewPayrollForWorker}
          onClick={() => setPayrollOpen(true)}
        />
        <ActionButton
          icon={Clock3}
          label="Báo nghỉ"
          disabled={!canReportLeaveForWorker}
          onClick={() => setLeaveOpen(true)}
        />
        <ActionButton
          icon={Plus}
          label="Báo đi làm mới"
          disabled={!canOpenJoinForm}
          onClick={() => setJoinOpen(true)}
        />
        <ActionButton
          icon={Landmark}
          label="Cập nhật ngân hàng"
          disabled={!canUpdateBankForWorker}
          onClick={() => setBankOpen(true)}
        />
      </div>

      {workerUser && (
        <div className="space-y-2">
          <div className="text-sm font-semibold">Ảnh CCCD</div>
          <CccdManager
            targetUser={workerUser}
            actor={viewer as UserRecord}
            onUpdated={async () => {
              const refreshed = await pb
                .collection("users")
                .getOne<UserRecord>(workerId)
                .catch(() => null);
              if (refreshed) setWorkerUser(refreshed);
            }}
          />
        </div>
      )}

      {canReportAdvanceForWorker && advances.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold">Tình trạng báo ứng</div>
          {advances.slice(0, 10).map((adv) => (
            <Card key={adv.id} className="space-y-1 rounded-2xl border-border/60 p-4 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{formatMoney(adv.amount || 0)}</div>
                  {adv.reason && (
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{adv.reason}</div>
                  )}
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {formatDate(adv.created)}
                  </div>
                </div>
                <AdvanceStatusChip status={adv.status} recoveryStatus={adv.recovery_status} />
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <div className="text-sm font-semibold">Lịch sử đi làm theo nhà máy</div>
        {histories.length === 0 ? (
          <EmptyState
            icon={NotebookPen}
            title="Chưa có lịch sử đi làm"
            description="Admin có thể import Excel hoặc staff có quyền có thể báo đi làm nhà máy mới."
          />
        ) : (
          histories.map((history) => (
            <Card
              key={history.id}
              className="space-y-3 rounded-2xl border-border/60 p-4 shadow-soft"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    {history.expand?.factory?.name || "Nhà máy"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {history.worker_name_snapshot} · CCCD: {maskCccd(history.worker_cccd_snapshot)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    Mã NV: {history.employee_code || "Chưa có"} · Người tuyển:{" "}
                    {history.expand?.recruiter_staff?.full_name ||
                      history.expand?.recruiter_staff?.username ||
                      "Chưa gán"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    Nhà chính: {history.expand?.main_house?.name || "Chưa gán"}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <StatusChip tone={history.status === "working" ? "success" : "neutral"}>
                    {history.status === "working" ? "Đang làm" : "Đã nghỉ"}
                  </StatusChip>
                  {viewer?.role === "admin" && (
                    <button
                      type="button"
                      onClick={() => openEditHistory(history)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 text-muted-foreground"
                      aria-label="Sửa lịch sử"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <InfoCell label="Ngày vào" value={formatDate(history.join_date)} />
                <InfoCell label="Ngày nghỉ" value={formatDate(history.leave_date)} />
              </div>

              {history.note && (
                <div className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">
                  {history.note}
                </div>
              )}
            </Card>
          ))
        )}
      </div>

      <Dialog open={advanceOpen} onOpenChange={setAdvanceOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Báo ứng lương</DialogTitle>
            <DialogDescription>
              Tạo yêu cầu ứng lương cho người lao động từ hồ sơ gần nhất.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <FormField label="Số tiền">
              <Input
                value={amountText}
                onChange={(event) => setAmountText(event.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                placeholder="Nhập số tiền"
                className="rounded-xl"
              />
            </FormField>
            <FormField label="Lý do">
              <Textarea
                value={advanceReason}
                onChange={(event) => setAdvanceReason(event.target.value)}
                rows={4}
                className="rounded-xl"
                placeholder="Ví dụ: ứng tiền sinh hoạt, ứng trước kỳ lương..."
              />
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdvanceOpen(false)} className="rounded-xl">
              Đóng
            </Button>
            <Button onClick={submitAdvance} className="rounded-xl">
              Gửi yêu cầu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Drawer open={payrollOpen} onOpenChange={setPayrollOpen}>
        <DrawerContent className="max-h-[88dvh]">
          <DrawerHeader>
            <DrawerTitle>Check công / lương gần nhất</DrawerTitle>
            <DrawerDescription>
              Xem nhanh các kỳ gần đây đã được admin gửi cho người lao động.
            </DrawerDescription>
          </DrawerHeader>
          <div className="space-y-4 overflow-y-auto px-4 pb-4">
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Check công
              </div>
              <div className="space-y-2">
                {attendanceItems.length === 0 ? (
                  <Card className="rounded-2xl p-3 text-sm text-muted-foreground">
                    Chưa có bản ghi check công.
                  </Card>
                ) : (
                  attendanceItems.slice(0, 6).map((item) => (
                    <Card key={item.id} className="rounded-2xl p-3 text-sm">
                      <div className="font-semibold">
                        {item.month || "Không rõ tháng"} · Lần {item.round_no || 1}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        Tạo lúc {formatDate(item.created)}
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Check lương
              </div>
              <div className="space-y-2">
                {salaryItems.length === 0 ? (
                  <Card className="rounded-2xl p-3 text-sm text-muted-foreground">
                    Chưa có bản ghi check lương.
                  </Card>
                ) : (
                  salaryItems.slice(0, 6).map((item) => (
                    <Card key={item.id} className="rounded-2xl p-3 text-sm">
                      <div className="font-semibold">
                        {item.month || "Không rõ tháng"} · Lần {item.round_no || 1}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        Thực nhận: {formatMoney(item.totals?.net || 0)}
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </div>
          </div>
          <DrawerFooter>
            <Button variant="outline" onClick={() => setPayrollOpen(false)} className="rounded-xl">
              Đóng
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Drawer open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DrawerContent className="max-h-[88dvh]">
          <DrawerHeader>
            <DrawerTitle>Báo nghỉ nhà máy hiện tại</DrawerTitle>
            <DrawerDescription>
              Chỉ áp dụng với bản ghi đang làm hiện tại của người lao động.
            </DrawerDescription>
          </DrawerHeader>
          <div className="space-y-3 overflow-y-auto px-4 pb-4">
            <FormField label="Ngày nghỉ">
              <Input
                type="date"
                value={leaveDate}
                onChange={(event) => setLeaveDate(event.target.value)}
                className="rounded-xl"
              />
            </FormField>
            <FormField label="Ghi chú">
              <Textarea
                value={leaveNote}
                onChange={(event) => setLeaveNote(event.target.value)}
                rows={4}
                className="rounded-xl"
                placeholder="Ví dụ: nghỉ việc, chuyển nhà máy, nghỉ tạm thời..."
              />
            </FormField>
          </div>
          <DrawerFooter>
            <Button variant="outline" onClick={() => setLeaveOpen(false)} className="rounded-xl">
              Đóng
            </Button>
            <Button onClick={submitLeave} className="rounded-xl">
              Cập nhật ngày nghỉ
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Drawer open={joinOpen} onOpenChange={setJoinOpen}>
        <DrawerContent className="max-h-[90dvh]">
          <DrawerHeader>
            <DrawerTitle>Báo đi làm nhà máy mới</DrawerTitle>
            <DrawerDescription>
              Hồ sơ cũ phải kết thúc trước khi tạo bản ghi đi làm mới.
            </DrawerDescription>
          </DrawerHeader>
          <div className="space-y-3 overflow-y-auto px-4 pb-4">
            <FormField label="Nhà máy">
              <Select
                value={joinForm.factory}
                onValueChange={(value) =>
                  setJoinForm((current) => ({ ...current, factory: value }))
                }
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Chọn nhà máy" />
                </SelectTrigger>
                <SelectContent>
                  {joinableFactories.map((factory) => (
                    <SelectItem key={factory.id} value={factory.id}>
                      {factory.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Nhà chính">
              <Select
                value={joinForm.main_house}
                onValueChange={(value) =>
                  setJoinForm((current) => ({
                    ...current,
                    main_house: value,
                  }))
                }
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Chọn nhà chính" />
                </SelectTrigger>
                <SelectContent>
                  {mainHouses.map((house) => (
                    <SelectItem key={house.id} value={house.id}>
                      {house.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Mã NV">
              <Input
                value={joinForm.employee_code}
                onChange={(event) =>
                  setJoinForm((current) => ({ ...current, employee_code: event.target.value }))
                }
                className="rounded-xl"
              />
            </FormField>
            <FormField label="Họ tên dùng tại nhà máy">
              <Input
                value={joinForm.worker_name_snapshot}
                onChange={(event) =>
                  setJoinForm((current) => ({
                    ...current,
                    worker_name_snapshot: event.target.value,
                  }))
                }
                className="rounded-xl"
              />
            </FormField>
            <FormField label="CCCD dùng tại nhà máy">
              <Input
                value={joinForm.worker_cccd_snapshot}
                onChange={(event) =>
                  setJoinForm((current) => ({
                    ...current,
                    worker_cccd_snapshot: event.target.value,
                  }))
                }
                className="rounded-xl"
              />
            </FormField>
            <FormField label="Ngày vào">
              <Input
                type="date"
                value={joinForm.join_date}
                onChange={(event) =>
                  setJoinForm((current) => ({ ...current, join_date: event.target.value }))
                }
                className="rounded-xl"
              />
            </FormField>
            <FormField label="Người tuyển">
              <Select
                value={joinForm.recruiter_staff}
                onValueChange={(value) =>
                  setJoinForm((current) => ({ ...current, recruiter_staff: value }))
                }
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Chọn người tuyển" />
                </SelectTrigger>
                <SelectContent>
                  {staffUsers.map((staffUser) => (
                    <SelectItem key={staffUser.id} value={staffUser.id}>
                      {staffUser.full_name || staffUser.username || staffUser.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Ghi chú">
              <Textarea
                value={joinForm.note}
                onChange={(event) =>
                  setJoinForm((current) => ({ ...current, note: event.target.value }))
                }
                rows={4}
                className="rounded-xl"
              />
            </FormField>
          </div>
          <DrawerFooter>
            <Button variant="outline" onClick={() => setJoinOpen(false)} className="rounded-xl">
              Đóng
            </Button>
            <Button onClick={submitJoin} disabled={!canSubmitJoinForWorker} className="rounded-xl">
              Tạo bản ghi đi làm
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Dialog open={bankOpen} onOpenChange={setBankOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Cập nhật tài khoản ngân hàng</DialogTitle>
            <DialogDescription>
              Cập nhật trực tiếp thông tin ngân hàng của user gốc.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <FormField label="Ngân hàng">
              <Select
                value={bankForm.bank_name}
                onValueChange={(value) =>
                  setBankForm((current) => ({ ...current, bank_name: value }))
                }
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Chọn ngân hàng" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {VN_BANKS.map((bank) => (
                    <SelectItem key={bank.code} value={bank.name}>
                      {bank.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Số tài khoản">
              <Input
                value={bankForm.bank_account_number}
                onChange={(event) =>
                  setBankForm((current) => ({
                    ...current,
                    bank_account_number: event.target.value.replace(/\D/g, ""),
                  }))
                }
                className="rounded-xl"
              />
            </FormField>
            <FormField label="Tên chủ tài khoản">
              <Input
                value={bankForm.bank_account_name}
                onChange={(event) =>
                  setBankForm((current) => ({ ...current, bank_account_name: event.target.value }))
                }
                className="rounded-xl"
              />
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBankOpen(false)} className="rounded-xl">
              Đóng
            </Button>
            <Button onClick={submitBankUpdate} className="rounded-xl">
              Lưu tài khoản
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingHistory} onOpenChange={(open) => !open && setEditingHistory(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>Sửa lịch sử đi làm</DialogTitle>
            <DialogDescription>
              Chỉ admin mới được chỉnh trực tiếp lịch sử đi làm của user.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <FormField label="Mã NV">
              <Input
                value={historyForm.employee_code}
                onChange={(event) =>
                  setHistoryForm((current) => ({ ...current, employee_code: event.target.value }))
                }
                className="rounded-xl"
              />
            </FormField>
            <FormField label="Họ tên tại nhà máy">
              <Input
                value={historyForm.worker_name_snapshot}
                onChange={(event) =>
                  setHistoryForm((current) => ({
                    ...current,
                    worker_name_snapshot: event.target.value,
                  }))
                }
                className="rounded-xl"
              />
            </FormField>
            <FormField label="CCCD tại nhà máy">
              <Input
                value={historyForm.worker_cccd_snapshot}
                onChange={(event) =>
                  setHistoryForm((current) => ({
                    ...current,
                    worker_cccd_snapshot: event.target.value,
                  }))
                }
                className="rounded-xl"
              />
            </FormField>
            <FormField label="Người tuyển">
              <Select
                value={historyForm.recruiter_staff}
                onValueChange={(value) =>
                  setHistoryForm((current) => ({ ...current, recruiter_staff: value }))
                }
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Chọn người tuyển" />
                </SelectTrigger>
                <SelectContent>
                  {staffUsers.map((staffUser) => (
                    <SelectItem key={staffUser.id} value={staffUser.id}>
                      {staffUser.full_name || staffUser.username || staffUser.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Nhà chính">
              <Select
                value={historyForm.main_house}
                onValueChange={(value) =>
                  setHistoryForm((current) => ({
                    ...current,
                    main_house: value,
                  }))
                }
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Chọn nhà chính" />
                </SelectTrigger>
                <SelectContent>
                  {mainHouses.map((house) => (
                    <SelectItem key={house.id} value={house.id}>
                      {house.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Ngày vào">
                <Input
                  type="date"
                  value={historyForm.join_date}
                  onChange={(event) =>
                    setHistoryForm((current) => ({ ...current, join_date: event.target.value }))
                  }
                  className="rounded-xl"
                />
              </FormField>
              <FormField label="Ngày nghỉ">
                <Input
                  type="date"
                  value={historyForm.leave_date}
                  onChange={(event) =>
                    setHistoryForm((current) => ({ ...current, leave_date: event.target.value }))
                  }
                  className="rounded-xl"
                />
              </FormField>
            </div>
            <FormField label="Trạng thái">
              <Select
                value={historyForm.status}
                onValueChange={(value) =>
                  setHistoryForm((current) => ({ ...current, status: value }))
                }
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Chọn trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="working">Đang làm</SelectItem>
                  <SelectItem value="left">Đã nghỉ</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Ghi chú">
              <Textarea
                value={historyForm.note}
                onChange={(event) =>
                  setHistoryForm((current) => ({ ...current, note: event.target.value }))
                }
                rows={4}
                className="rounded-xl"
              />
            </FormField>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingHistory(null)}
              className="rounded-xl"
            >
              Đóng
            </Button>
            <Button onClick={saveEditedHistory} className="rounded-xl">
              Lưu thay đổi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function ActionButton({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-[88px] flex-col items-start gap-2 rounded-2xl border border-border/60 bg-card p-4 text-left shadow-soft disabled:cursor-not-allowed disabled:opacity-45"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="text-sm font-semibold">{label}</div>
    </button>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-muted/35 p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function formatDate(value?: string) {
  if (!value) return "Chưa có";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("vi-VN");
}

function todayDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function AdvanceStatusChip({
  status,
  recoveryStatus,
}: {
  status?: string;
  recoveryStatus?: string;
}) {
  if (status === "rejected") return <StatusChip tone="danger">Từ chối</StatusChip>;
  if (status === "pending") return <StatusChip tone="warning">Chờ duyệt</StatusChip>;
  if (status === "accepted" && recoveryStatus === "recovered")
    return <StatusChip tone="success">Đã thu hồi</StatusChip>;
  if (status === "accepted" && recoveryStatus === "partial")
    return <StatusChip tone="info">Thu hồi 1 phần</StatusChip>;
  if (status === "accepted") return <StatusChip tone="success">Đã duyệt</StatusChip>;
  return <StatusChip tone="neutral">{status || "—"}</StatusChip>;
}
