import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CalendarRange,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock3,
  Hash,
  Landmark,
  Plus,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { StatusChip } from "@/components/ui/status-chip";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { pb, type UserRecord } from "@/lib/pocketbase";
import { useAppSettings } from "@/lib/app-settings";
import { formatMoneyInput, parseMoneyInput } from "@/lib/money";
import {
  createEmploymentHistory,
  deriveEmploymentStatus,
  fetchEmploymentHistories,
  findActiveEmploymentByUser,
  getLatestEmploymentHistory,
  isCurrentlyWorking,
  maskCccd,
  syncLegacyUserWorkFields,
  updateEmploymentHistory,
  updateUserAndCache,
  type EmploymentHistoryRecord,
} from "@/lib/employment";
import type { FactoryRecord } from "@/lib/factories";
import type { MainHouseRecord } from "@/lib/main-houses";
import { canReportJoin, isRecentRecruiter } from "@/lib/staff-permissions";
import { createStaffActionLog } from "@/lib/staff-log";
import { CccdManager } from "@/components/cccd/CccdManager";
import { VN_BANKS } from "@/lib/vn-banks";

export type WorkerEmploymentPermissions = {
  /** Cho phép sửa từng lịch sử đi làm (mở form edit khi click card). */
  canEditHistory: boolean;
  /** Cho phép bổ sung lịch sử cũ (nút "+"). Hiện chỉ admin. */
  canAddOldHistory: boolean;
  /** Cho phép báo ứng lương cho NLĐ đang đi làm. */
  canReportAdvance: boolean;
  /** Cho phép cập nhật STK ngân hàng của NLĐ. */
  canUpdateBank: boolean;
  /** Cho phép báo nghỉ nhà máy hiện tại. */
  canReportLeave: boolean;
  /** Cho phép báo đi làm nhà máy mới. */
  canReportJoin: boolean;
  /** Cho phép xem công lương của NLĐ. */
  canViewPayroll: boolean;
};

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatDate(value?: string) {
  if (!value) return "—";
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getPocketBaseFieldErrors(error: unknown) {
  const data =
    typeof error === "object" && error !== null && "data" in error
      ? (error.data as { data?: Record<string, unknown> }).data
      : undefined;
  if (!data) return "";
  return Object.entries(data)
    .map(([field, value]) => {
      const message =
        typeof value === "object" && value !== null && "message" in value
          ? String(value.message)
          : String(value);
      return `${field}: ${message}`;
    })
    .join("; ");
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[64px] min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-border/60 bg-card px-2 py-2 text-center shadow-soft active:scale-[0.98]"
    >
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="break-words text-[11px] font-medium leading-tight [overflow-wrap:anywhere]">
        {label}
      </div>
    </button>
  );
}

export function WorkerEmploymentDrawer({
  user,
  actor,
  histories,
  factories,
  mainHouses,
  users,
  managedFactoryIds,
  permissions,
  open,
  onClose,
  onDataChanged,
}: {
  user: UserRecord | null;
  actor: UserRecord | null;
  histories: EmploymentHistoryRecord[];
  factories: FactoryRecord[];
  mainHouses: MainHouseRecord[];
  users: UserRecord[];
  managedFactoryIds?: Set<string>;
  permissions: WorkerEmploymentPermissions;
  open: boolean;
  onClose: () => void;
  onDataChanged: () => void | Promise<void>;
}) {
  const navigate = useNavigate();
  const { data: settings } = useAppSettings();
  const [infoOpen, setInfoOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveDate, setLeaveDate] = useState(todayIso());
  const [leaveNote, setLeaveNote] = useState("");
  const [leaveSaving, setLeaveSaving] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinSaving, setJoinSaving] = useState(false);
  const [joinForm, setJoinForm] = useState({
    factory: "",
    main_house: "",
    employee_code: "",
    worker_name_snapshot: "",
    worker_cccd_snapshot: "",
    worker_tax_code_snapshot: "",
    recruiter_staff: "",
    join_date: todayIso(),
    note: "",
  });
  const [employeeCodeOpen, setEmployeeCodeOpen] = useState(false);
  const [employeeCodeForm, setEmployeeCodeForm] = useState("");
  const [employeeCodeSaving, setEmployeeCodeSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [oldHistoryOpen, setOldHistoryOpen] = useState(false);
  const [oldHistorySaving, setOldHistorySaving] = useState(false);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advanceReason, setAdvanceReason] = useState("");
  const [advanceOutstanding, setAdvanceOutstanding] = useState(0);
  const [advanceOutstandingLoading, setAdvanceOutstandingLoading] = useState(false);
  const [advanceBankChoice, setAdvanceBankChoice] = useState<"worker" | "actor">("worker");
  const [form, setForm] = useState({
    factory: "",
    address: "",
    employee_code: "",
    worker_name_snapshot: "",
    worker_cccd_snapshot: "",
    worker_tax_code_snapshot: "",
    recruiter_staff: "",
    main_house: "",
    join_date: "",
    leave_date: "",
    note: "",
  });
  const [oldHistoryForm, setOldHistoryForm] = useState({
    factory: "",
    main_house: "",
    employee_code: "",
    worker_name_snapshot: "",
    worker_cccd_snapshot: "",
    worker_tax_code_snapshot: "",
    recruiter_staff: "",
    join_date: "",
    leave_date: "",
    note: "",
  });
  const [saving, setSaving] = useState(false);
  const [submittingAdvance, setSubmittingAdvance] = useState(false);
  const [bankEditing, setBankEditing] = useState(false);
  useEffect(() => {
    if (!advanceOpen || !user?.id) return;

    let active = true;
    setAdvanceOutstandingLoading(true);
    pb.collection("advances")
      .getList(1, 500, {
        filter: `user="${user.id}" && (status="pending" || status="recruiter_approved" || (status="accepted" && (recovery_status="" || recovery_status="none")))`,
        fields: "amount",
      })
      .then((result) => {
        if (!active) return;
        setAdvanceOutstanding(
          result.items.reduce(
            (sum: number, item: { amount?: number }) => sum + Number(item.amount || 0),
            0,
          ),
        );
      })
      .catch(() => {
        if (active) setAdvanceOutstanding(0);
      })
      .finally(() => {
        if (active) setAdvanceOutstandingLoading(false);
      });

    return () => {
      active = false;
    };
  }, [advanceOpen, user?.id]);

  const [bankForm, setBankForm] = useState({
    bank_name: "",
    bank_account_number: "",
    bank_account_name: "",
  });
  const [bankSaving, setBankSaving] = useState(false);

  const staffUsers = useMemo(
    () => users.filter((u) => u.role === "staff" || u.role === "admin"),
    [users],
  );

  const managedIds = useMemo(() => managedFactoryIds ?? new Set<string>(), [managedFactoryIds]);

  const joinableFactories = useMemo(() => {
    if (actor?.role === "admin") return factories;
    if (isRecentRecruiter(actor, histories)) return factories;
    return factories.filter((factory) => managedIds.has(factory.id));
  }, [factories, managedIds, actor, histories]);

  useEffect(() => {
    if (user) {
      setBankEditing(false);
      setBankForm({
        bank_name: user.bank_name || "",
        bank_account_number: user.bank_account_number || "",
        bank_account_name: user.bank_account_name || "",
      });
      setLeaveOpen(false);
      setLeaveDate(todayIso());
      setLeaveNote("");
      setJoinOpen(false);
      setEmployeeCodeOpen(false);
      const latest = getLatestEmploymentHistory(histories);
      setJoinForm({
        factory: "",
        main_house: "",
        employee_code: "",
        worker_name_snapshot: latest?.worker_name_snapshot || user.full_name || user.username || "",
        worker_cccd_snapshot: latest?.worker_cccd_snapshot || user.cccd || "",
        worker_tax_code_snapshot: latest?.worker_tax_code_snapshot || "",
        recruiter_staff: actor?.id || "",
        join_date: todayIso(),
        note: "",
      });
      setEmployeeCodeForm(latest?.employee_code || user.employee_code || "");
    }
  }, [user?.id]);

  const startEdit = (h: EmploymentHistoryRecord) => {
    if (!permissions.canEditHistory) return;
    setEditingId(h.id);
    setForm({
      factory: h.factory || "",
      address: user?.address || h.expand?.user?.address || "",
      employee_code: h.employee_code || "",
      worker_name_snapshot: h.worker_name_snapshot || "",
      worker_cccd_snapshot: h.worker_cccd_snapshot || "",
      worker_tax_code_snapshot: h.worker_tax_code_snapshot || "",
      recruiter_staff: h.recruiter_staff || "",
      main_house: h.main_house || "",
      join_date: h.join_date?.slice(0, 10) || "",
      leave_date: h.leave_date?.slice(0, 10) || "",
      note: h.note || "",
    });
  };

  const submitLeave = async () => {
    if (!user || !actor) return;
    const active = histories.find((item) => isCurrentlyWorking(item));
    if (!active) {
      toast.error("Không có bản ghi đang làm để báo nghỉ");
      return;
    }
    if (!leaveDate) {
      toast.warning("Chọn ngày nghỉ");
      return;
    }
    setLeaveSaving(true);
    try {
      await updateEmploymentHistory(active.id, {
        leave_date: leaveDate,
        status: "left",
        note: leaveNote.trim(),
      });
      const updated = await fetchEmploymentHistories([user.id]);
      await syncLegacyUserWorkFields(user.id, getLatestEmploymentHistory(updated));
      await createStaffActionLog({
        actor,
        targetUserId: user.id,
        targetCollection: "employment_histories",
        targetRecord: active.id,
        action: "report_leave",
        note: "Báo nghỉ từ hồ sơ lao động",
      });
      toast.success("Đã cập nhật ngày nghỉ");
      setLeaveOpen(false);
      await onDataChanged();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Lỗi báo nghỉ"));
    } finally {
      setLeaveSaving(false);
    }
  };

  const submitJoin = async () => {
    if (!user || !actor) return;
    if (!joinForm.factory) return toast.warning("Chọn nhà máy");
    if (!joinForm.join_date) return toast.warning("Nhập ngày vào làm");
    if (!joinForm.recruiter_staff) return toast.warning("Chọn người tuyển");
    if (!joinForm.main_house) return toast.warning("Chọn nhà chính");
    if (!canReportJoin(actor, histories, managedFactoryIds ?? new Set(), joinForm.factory)) {
      toast.error("Bạn không có quyền báo đi làm tại nhà máy đã chọn");
      return;
    }
    setJoinSaving(true);
    try {
      const active = await findActiveEmploymentByUser(user.id);
      if (active) {
        toast.error("Cần báo nghỉ nhà máy cũ trước");
        return;
      }
      const created = await createEmploymentHistory({
        user: user.id,
        factory: joinForm.factory,
        main_house: joinForm.main_house,
        employee_code: joinForm.employee_code.trim(),
        worker_name_snapshot:
          joinForm.worker_name_snapshot.trim() || user.full_name || user.username || "",
        worker_cccd_snapshot: joinForm.worker_cccd_snapshot.trim() || user.cccd || "",
        worker_tax_code_snapshot: joinForm.worker_tax_code_snapshot.trim(),
        recruiter_staff: joinForm.recruiter_staff,
        join_date: joinForm.join_date,
        status: "working",
        note: joinForm.note.trim(),
      });
      await syncLegacyUserWorkFields(user.id, created);
      await createStaffActionLog({
        actor,
        targetUserId: user.id,
        targetCollection: "employment_histories",
        targetRecord: created.id,
        action: "report_join",
        note: "Báo đi làm mới từ hồ sơ lao động",
      });
      toast.success("Đã tạo bản ghi đi làm mới");
      setJoinOpen(false);
      await onDataChanged();
    } catch (error: unknown) {
      const fieldErrors = getPocketBaseFieldErrors(error);
      toast.error(fieldErrors || getErrorMessage(error, "Lỗi báo đi làm"));
    } finally {
      setJoinSaving(false);
    }
  };

  const submitEmployeeCode = async () => {
    if (!user || !actor) return;
    const code = employeeCodeForm.trim();
    if (!code) {
      toast.warning("Nhập mã nhân viên");
      return;
    }
    setEmployeeCodeSaving(true);
    try {
      await updateUserAndCache(user.id, { employee_code: code });
      const latest = getLatestEmploymentHistory(histories);
      if (latest) {
        await updateEmploymentHistory(latest.id, { employee_code: code });
      }
      await createStaffActionLog({
        actor,
        targetUserId: user.id,
        targetCollection: "employment_histories",
        targetRecord: latest?.id || user.id,
        action: "update",
        note: `Cập nhật mã NV: ${code}`,
      });
      toast.success("Đã cập nhật mã nhân viên");
      setEmployeeCodeOpen(false);
      await onDataChanged();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Lỗi cập nhật mã NV"));
    } finally {
      setEmployeeCodeSaving(false);
    }
  };

  const openOldHistory = () => {
    if (!user || !permissions.canAddOldHistory) return;
    const latest = getLatestEmploymentHistory(histories);
    setOldHistoryForm({
      factory: "",
      main_house: latest?.main_house || "",
      employee_code: latest?.employee_code || user.employee_code || "",
      worker_name_snapshot: latest?.worker_name_snapshot || user.full_name || user.username || "",
      worker_cccd_snapshot: latest?.worker_cccd_snapshot || user.cccd || "",
      worker_tax_code_snapshot: latest?.worker_tax_code_snapshot || "",
      recruiter_staff: latest?.recruiter_staff || actor?.id || "",
      join_date: "",
      leave_date: "",
      note: "",
    });
    setOldHistoryOpen(true);
  };

  const saveOldHistory = async () => {
    if (!user || !permissions.canAddOldHistory) {
      toast.error("Không có quyền bổ sung lịch sử cũ");
      return;
    }
    if (!oldHistoryForm.factory) return toast.warning("Chọn nhà máy");
    if (!oldHistoryForm.main_house) return toast.warning("Chọn nhà chính");
    if (!oldHistoryForm.recruiter_staff) return toast.warning("Chọn người tuyển");
    if (!oldHistoryForm.join_date) return toast.warning("Chọn ngày vào");
    if (!oldHistoryForm.leave_date) return toast.warning("Chọn ngày nghỉ");
    if (oldHistoryForm.leave_date < oldHistoryForm.join_date) {
      return toast.warning("Ngày nghỉ không được trước ngày vào");
    }
    if (oldHistoryForm.leave_date > todayIso()) {
      return toast.warning("Ngày nghỉ không được lớn hơn ngày hiện tại");
    }

    setOldHistorySaving(true);
    try {
      const latestRows = await fetchEmploymentHistories([user.id]);
      const overlaps = latestRows.some((history) => {
        const existingStart = history.join_date?.slice(0, 10);
        const existingEnd = history.leave_date?.slice(0, 10) || "9999-12-31";
        if (!existingStart) return false;
        return (
          oldHistoryForm.join_date <= existingEnd && oldHistoryForm.leave_date >= existingStart
        );
      });
      if (overlaps) {
        toast.error("Khoảng thời gian này bị trùng với một lịch sử đã có");
        return;
      }

      const created = await createEmploymentHistory({
        user: user.id,
        factory: oldHistoryForm.factory,
        main_house: oldHistoryForm.main_house,
        employee_code: oldHistoryForm.employee_code.trim(),
        worker_name_snapshot:
          oldHistoryForm.worker_name_snapshot.trim() || user.full_name || user.username || "",
        worker_cccd_snapshot: oldHistoryForm.worker_cccd_snapshot.trim() || user.cccd || "",
        worker_tax_code_snapshot: oldHistoryForm.worker_tax_code_snapshot.trim(),
        recruiter_staff: oldHistoryForm.recruiter_staff,
        join_date: oldHistoryForm.join_date,
        leave_date: oldHistoryForm.leave_date,
        status: deriveEmploymentStatus({ leave_date: oldHistoryForm.leave_date }),
        note: oldHistoryForm.note.trim(),
      });

      const updatedRows = await fetchEmploymentHistories([user.id]);
      await syncLegacyUserWorkFields(user.id, getLatestEmploymentHistory(updatedRows));
      await createStaffActionLog({
        actor,
        targetUserId: user.id,
        targetCollection: "employment_histories",
        targetRecord: created.id,
        action: "create",
        after: created,
        note: "Bổ sung lịch sử đi làm cũ",
      });
      setOldHistoryOpen(false);
      await onDataChanged();
      toast.success("Đã bổ sung lịch sử đi làm cũ");
    } catch (error: unknown) {
      const fieldErrors = getPocketBaseFieldErrors(error);
      toast.error(fieldErrors || getErrorMessage(error, "Không thể bổ sung lịch sử cũ"));
    } finally {
      setOldHistorySaving(false);
    }
  };

  const saveEdit = async () => {
    if (!editingId) return;
    if (!form.factory) {
      toast.warning("Chọn nhà máy");
      return;
    }
    setSaving(true);
    try {
      const before = histories.find((item) => item.id === editingId) || null;
      const updated = await updateEmploymentHistory(editingId, {
        factory: form.factory,
        employee_code: form.employee_code.trim(),
        worker_name_snapshot: form.worker_name_snapshot.trim(),
        worker_cccd_snapshot: form.worker_cccd_snapshot.trim(),
        worker_tax_code_snapshot: form.worker_tax_code_snapshot.trim(),
        recruiter_staff: form.recruiter_staff || undefined,
        main_house: form.main_house || undefined,
        join_date: form.join_date || undefined,
        leave_date: form.leave_date || undefined,
        status: deriveEmploymentStatus({ leave_date: form.leave_date }),
        note: form.note.trim(),
      });
      if (user) {
        await updateUserAndCache(user.id, { address: form.address.trim() });
        const updatedHistories = await fetchEmploymentHistories([user.id]);
        const latest = getLatestEmploymentHistory(updatedHistories);
        await syncLegacyUserWorkFields(user.id, latest);
      }
      await createStaffActionLog({
        actor,
        targetUserId: user?.id,
        targetCollection: "employment_histories",
        targetRecord: editingId,
        action: "update",
        before,
        after: updated,
        note: "Cập nhật lịch sử đi làm",
      });
      toast.success("Đã lưu thay đổi");
      setEditingId(null);
      onDataChanged();
    } catch (error: unknown) {
      const fieldErrors = getPocketBaseFieldErrors(error);
      if (fieldErrors) {
        toast.error(fieldErrors);
      } else {
        toast.error(getErrorMessage(error, "Lỗi lưu"));
      }
    } finally {
      setSaving(false);
    }
  };

  const submitAdvance = async () => {
    const activeHistory = histories.find((item) => isCurrentlyWorking(item));
    if (!user || !actor || !activeHistory) {
      toast.error("Chỉ báo ứng cho người lao động đang đi làm");
      return;
    }

    const amount = parseMoneyInput(advanceAmount);
    if (!amount) {
      toast.warning("Nhập số tiền ứng");
      return;
    }
    if (!advanceReason.trim()) {
      toast.warning("Nhập lý do ứng");
      return;
    }
    const bankSource = advanceBankChoice === "actor" ? actor : user;
    if (!bankSource.bank_account_number) {
      toast.warning(
        advanceBankChoice === "actor"
          ? "Tài khoản của người thao tác chưa có số tài khoản ngân hàng"
          : "Người lao động chưa có số tài khoản ngân hàng",
      );
      return;
    }

    setSubmittingAdvance(true);
    try {
      const existingAdvances = await pb.collection("advances").getList(1, 500, {
        filter: `user="${user.id}" && (status="pending" || status="recruiter_approved" || (status="accepted" && (recovery_status="" || recovery_status="none")))`,
        fields: "amount",
      });
      const outstanding = existingAdvances.items.reduce(
        (sum: number, item: { amount?: number }) => sum + Number(item.amount || 0),
        0,
      );
      const limit = Number(settings?.advance_limit || 0);
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

      const created = await pb.collection("advances").create({
        user: user.id,
        requested_by: actor.id,
        recruiter_id: activeHistory.recruiter_staff || "",
        employee_code: activeHistory.employee_code || user.employee_code || "",
        full_name: activeHistory.worker_name_snapshot || user.full_name || "",
        company: activeHistory.expand?.factory?.name || user.company || "",
        phone: user.phone || "",
        join_date: activeHistory.join_date || "",
        bank_name: bankSource.bank_name || "",
        bank_account_number: bankSource.bank_account_number || "",
        bank_account_name: bankSource.bank_account_name || "",
        amount,
        reason: advanceReason.trim(),
        status: "recruiter_approved",
        recovery_status: "none",
      });
      await createStaffActionLog({
        actor,
        targetUserId: user.id,
        targetCollection: "advances",
        targetRecord: created.id,
        action: "report_advance",
        after: created,
        note: "Báo ứng cho người lao động đang đi làm",
      });
      toast.success("Đã tạo yêu cầu ứng lương");
      setAdvanceAmount("");
      setAdvanceReason("");
      setAdvanceOpen(false);
      onDataChanged();
    } catch (error: unknown) {
      const fieldErrors = getPocketBaseFieldErrors(error);
      toast.error(fieldErrors || getErrorMessage(error, "Lỗi báo ứng"));
    } finally {
      setSubmittingAdvance(false);
    }
  };

  const saveBankInfo = async () => {
    if (!user || !actor) return;
    setBankSaving(true);
    try {
      await updateUserAndCache(user.id, bankForm);
      await createStaffActionLog({
        actor,
        targetUserId: user.id,
        targetCollection: "users",
        targetRecord: user.id,
        action: "update_bank",
        before: {
          bank_name: user.bank_name || "",
          bank_account_number: user.bank_account_number || "",
          bank_account_name: user.bank_account_name || "",
        },
        after: bankForm,
        note: "Cập nhật STK ngân hàng cho NLĐ",
      });
      setBankEditing(false);
      toast.success("Đã cập nhật STK ngân hàng");
      onDataChanged();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Không cập nhật được STK"));
    } finally {
      setBankSaving(false);
    }
  };

  if (!user) return null;

  const activeHistory = histories.find((item) => isCurrentlyWorking(item));
  const isWorking = Boolean(activeHistory);
  const advanceLimit = Number(settings?.advance_limit || 0);
  const workerBank = user.bank_account_number
    ? `${user.bank_name || "NH"} · ${user.bank_account_number} · ${user.bank_account_name || ""}`
    : "";
  const actorBank = actor?.bank_account_number
    ? `${actor.bank_name || "NH"} · ${actor.bank_account_number} · ${actor.bank_account_name || ""}`
    : "";
  const actorBankRoleLabel = actor?.role === "admin" ? "Admin" : "Staff";

  const openAdvanceDialog = () => {
    setAdvanceBankChoice(workerBank ? "worker" : actorBank ? "actor" : "worker");
    setAdvanceOpen(true);
  };

  const openLeaveDialog = () => {
    setLeaveDate(todayIso());
    setLeaveNote("");
    setLeaveOpen(true);
  };

  const openJoinDialog = () => {
    const latest = getLatestEmploymentHistory(histories);
    setJoinForm({
      factory: "",
      main_house: "",
      employee_code: "",
      worker_name_snapshot: latest?.worker_name_snapshot || user.full_name || user.username || "",
      worker_cccd_snapshot: latest?.worker_cccd_snapshot || user.cccd || "",
      worker_tax_code_snapshot: latest?.worker_tax_code_snapshot || "",
      recruiter_staff: actor?.id || "",
      join_date: todayIso(),
      note: "",
    });
    setJoinOpen(true);
  };

  const openEmployeeCodeDialog = () => {
    const latest = getLatestEmploymentHistory(histories);
    setEmployeeCodeForm(latest?.employee_code || user.employee_code || "");
    setEmployeeCodeOpen(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="flex max-h-[90dvh] min-w-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="min-w-0 shrink-0 border-b px-5 py-4 pr-14">
            <DialogTitle className="break-words [overflow-wrap:anywhere]">
              {user.full_name || user.username || "Người lao động"}
            </DialogTitle>
            <DialogDescription className="break-words [overflow-wrap:anywhere]">
              {isWorking ? "Đang đi làm" : "Đã nghỉ"}
            </DialogDescription>
          </DialogHeader>

          <div className="min-w-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {((isWorking && permissions.canReportLeave) ||
              permissions.canReportJoin ||
              (isWorking && permissions.canReportAdvance) ||
              permissions.canViewPayroll ||
              permissions.canUpdateBank ||
              permissions.canAddOldHistory) && (
              <div className="grid grid-cols-3 gap-2">
                {isWorking && permissions.canReportLeave && (
                  <ActionButton icon={Clock3} label="Báo nghỉ" onClick={openLeaveDialog} />
                )}
                {permissions.canReportJoin && (
                  <ActionButton icon={Plus} label="Báo đi làm mới" onClick={openJoinDialog} />
                )}
                {isWorking && permissions.canReportAdvance && (
                  <ActionButton icon={Wallet} label="Báo ứng lương" onClick={openAdvanceDialog} />
                )}
                {permissions.canViewPayroll && (
                  <ActionButton
                    icon={CalendarRange}
                    label="Check công lương"
                    onClick={() => {
                      const id = user.id;
                      onClose();
                      setTimeout(
                        () =>
                          navigate({
                            to: "/staff/workers/$workerId/payroll",
                            params: { workerId: id },
                          }),
                        150,
                      );
                    }}
                  />
                )}
                {permissions.canUpdateBank && (
                  <ActionButton
                    icon={Landmark}
                    label="Cập nhật ngân hàng"
                    onClick={() => {
                      setInfoOpen(true);
                      setBankEditing(true);
                    }}
                  />
                )}
                {isWorking && (permissions.canReportLeave || permissions.canReportAdvance) && (
                  <ActionButton
                    icon={Hash}
                    label="Cập nhật mã NV"
                    onClick={openEmployeeCodeDialog}
                  />
                )}
                {permissions.canAddOldHistory && (
                  <ActionButton icon={Plus} label="Bổ sung lịch sử" onClick={openOldHistory} />
                )}
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Thông tin</span>
              <button
                type="button"
                onClick={() => setInfoOpen((v) => !v)}
                className="flex items-center gap-1 rounded-full border border-border/60 bg-card px-3 py-1 text-xs font-medium text-foreground active:scale-[0.98]"
                aria-expanded={infoOpen}
              >
                {infoOpen ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
                {infoOpen ? "Thu gọn" : "Mở rộng"}
              </button>
            </div>

            {infoOpen && (
              <>
                <div className="grid min-w-0 grid-cols-2 gap-2 text-sm">
                  {user.uid && (
                    <div className="col-span-2 min-w-0 overflow-hidden rounded-xl bg-primary/10 p-2.5">
                      <div className="text-[10px] text-muted-foreground">Mã tài khoản</div>
                      <div className="mt-0.5 break-words text-sm font-semibold text-primary [overflow-wrap:anywhere]">
                        {user.uid}
                      </div>
                    </div>
                  )}
                  <div className="min-w-0 overflow-hidden rounded-xl bg-muted/35 p-2.5">
                    <div className="text-[10px] text-muted-foreground">Họ tên tài khoản</div>
                    <div className="mt-0.5 break-words text-sm font-semibold [overflow-wrap:anywhere]">
                      {user.full_name || "—"}
                    </div>
                  </div>
                  <div className="min-w-0 overflow-hidden rounded-xl bg-muted/35 p-2.5">
                    <div className="text-[10px] text-muted-foreground">CCCD tài khoản</div>
                    <div className="mt-0.5 break-words text-sm font-semibold [overflow-wrap:anywhere]">
                      {maskCccd(user.cccd)}
                    </div>
                  </div>
                  <div className="min-w-0 overflow-hidden rounded-xl bg-muted/35 p-2.5">
                    <div className="text-[10px] text-muted-foreground">SĐT</div>
                    <div className="mt-0.5 break-words text-sm font-semibold [overflow-wrap:anywhere]">
                      {user.phone || "—"}
                    </div>
                  </div>
                  <div className="min-w-0 overflow-hidden rounded-xl bg-muted/35 p-2.5">
                    <div className="text-[10px] text-muted-foreground">Tên đăng nhập</div>
                    <div className="mt-0.5 break-words text-sm font-semibold [overflow-wrap:anywhere]">
                      {user.username || "—"}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <Landmark className="h-3.5 w-3.5" />
                      Tài khoản ngân hàng
                    </div>
                    {permissions.canUpdateBank && !bankEditing && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => setBankEditing(true)}
                      >
                        Sửa STK
                      </Button>
                    )}
                  </div>
                  {bankEditing ? (
                    <form
                      className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void saveBankInfo();
                      }}
                    >
                      <div className="space-y-1">
                        <Label className="text-xs">Ngân hàng</Label>
                        <Select
                          value={bankForm.bank_name}
                          onValueChange={(v) => setBankForm((c) => ({ ...c, bank_name: v }))}
                        >
                          <SelectTrigger>
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
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Số tài khoản</Label>
                        <Input
                          value={bankForm.bank_account_number}
                          onChange={(e) =>
                            setBankForm((c) => ({
                              ...c,
                              bank_account_number: e.target.value.replace(/\D/g, ""),
                            }))
                          }
                          inputMode="numeric"
                          placeholder="Nhập số tài khoản"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Tên chủ tài khoản</Label>
                        <Input
                          value={bankForm.bank_account_name}
                          onChange={(e) =>
                            setBankForm((c) => ({ ...c, bank_account_name: e.target.value }))
                          }
                          placeholder="Nhập tên chủ tài khoản"
                        />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => setBankEditing(false)}
                        >
                          Hủy
                        </Button>
                        <Button type="submit" size="sm" className="flex-1" disabled={bankSaving}>
                          {bankSaving ? "Đang lưu..." : "Lưu STK"}
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <div className="grid min-w-0 grid-cols-1 gap-1.5 text-sm">
                      <div className="min-w-0 overflow-hidden rounded-xl bg-muted/35 p-2.5">
                        <div className="text-[10px] text-muted-foreground">Ngân hàng</div>
                        <div className="mt-0.5 break-words text-sm font-semibold [overflow-wrap:anywhere]">
                          {user.bank_name || "—"}
                        </div>
                      </div>
                      <div className="grid min-w-0 grid-cols-2 gap-1.5">
                        <div className="min-w-0 overflow-hidden rounded-xl bg-muted/35 p-2.5">
                          <div className="text-[10px] text-muted-foreground">Số tài khoản</div>
                          <div className="mt-0.5 break-words text-sm font-semibold [overflow-wrap:anywhere]">
                            {user.bank_account_number || "—"}
                          </div>
                        </div>
                        <div className="min-w-0 overflow-hidden rounded-xl bg-muted/35 p-2.5">
                          <div className="text-[10px] text-muted-foreground">Tên chủ TK</div>
                          <div className="mt-0.5 break-words text-sm font-semibold [overflow-wrap:anywhere]">
                            {user.bank_account_name || "—"}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Ảnh CCCD
                </div>
                <CccdManager targetUser={user} actor={actor} onUpdated={onDataChanged} readOnly />
              </>
            )}

            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Lịch sử đi làm ({histories.length})
            </div>

            {histories.length === 0 ? (
              <div className="rounded-xl border bg-card p-3 text-center text-xs text-muted-foreground">
                Chưa có lịch sử
              </div>
            ) : (
              histories.map((h) => (
                <Card
                  key={h.id}
                  className={`min-w-0 space-y-2 overflow-hidden rounded-2xl p-3 transition-colors ${
                    permissions.canEditHistory ? "cursor-pointer hover:bg-muted/30" : ""
                  }`}
                  onClick={permissions.canEditHistory ? () => startEdit(h) : undefined}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="break-words text-sm font-semibold [overflow-wrap:anywhere]">
                        {h.expand?.factory?.name || "Nhà máy"}
                        <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                          · Mã: {h.employee_code || "—"}
                        </span>
                      </div>
                      <div className="break-words text-[11px] text-muted-foreground [overflow-wrap:anywhere]">
                        {h.worker_name_snapshot}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <StatusChip tone={isCurrentlyWorking(h) ? "success" : "neutral"}>
                        {isCurrentlyWorking(h) ? "Đang làm" : "Đã nghỉ"}
                      </StatusChip>
                      {permissions.canEditHistory && (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                  <div className="min-w-0 space-y-1 text-[11px] text-muted-foreground">
                    <div className="min-w-0 break-words [overflow-wrap:anywhere]">
                      Vào: {formatDate(h.join_date)} · Nghỉ: {formatDate(h.leave_date) || "—"}
                    </div>
                    <div className="min-w-0 break-words [overflow-wrap:anywhere]">
                      Người tuyển:{" "}
                      {h.expand?.recruiter_staff?.full_name ||
                        h.expand?.recruiter_staff?.username ||
                        "—"}
                    </div>
                    {h.note && (
                      <div className="min-w-0 break-words [overflow-wrap:anywhere]">{h.note}</div>
                    )}
                  </div>
                </Card>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={oldHistoryOpen}
        onOpenChange={(value) => !oldHistorySaving && setOldHistoryOpen(value)}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>Bổ sung lịch sử đi làm cũ</DialogTitle>
            <DialogDescription>
              Bản ghi luôn ở trạng thái Đã nghỉ và không được trùng thời gian với lịch sử khác.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void saveOldHistory();
            }}
          >
            <div className="space-y-1">
              <Label className="text-xs">Nhà máy *</Label>
              <Select
                value={oldHistoryForm.factory}
                onValueChange={(value) =>
                  setOldHistoryForm((current) => ({ ...current, factory: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn nhà máy" />
                </SelectTrigger>
                <SelectContent>
                  {factories.map((factory) => (
                    <SelectItem key={factory.id} value={factory.id}>
                      {factory.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Nhà chính *</Label>
                <Select
                  value={oldHistoryForm.main_house}
                  onValueChange={(value) =>
                    setOldHistoryForm((current) => ({ ...current, main_house: value }))
                  }
                >
                  <SelectTrigger>
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
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Người tuyển *</Label>
                <Select
                  value={oldHistoryForm.recruiter_staff}
                  onValueChange={(value) =>
                    setOldHistoryForm((current) => ({ ...current, recruiter_staff: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn người tuyển" />
                  </SelectTrigger>
                  <SelectContent>
                    {staffUsers.map((staff) => (
                      <SelectItem key={staff.id} value={staff.id}>
                        {staff.full_name || staff.username || staff.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Mã NV</Label>
                <Input
                  value={oldHistoryForm.employee_code}
                  onChange={(event) =>
                    setOldHistoryForm((current) => ({
                      ...current,
                      employee_code: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Mã số thuế</Label>
                <Input
                  value={oldHistoryForm.worker_tax_code_snapshot}
                  onChange={(event) =>
                    setOldHistoryForm((current) => ({
                      ...current,
                      worker_tax_code_snapshot: event.target.value.replace(/[^\d]/g, ""),
                    }))
                  }
                  inputMode="numeric"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Họ tên tại nhà máy</Label>
              <Input
                value={oldHistoryForm.worker_name_snapshot}
                onChange={(event) =>
                  setOldHistoryForm((current) => ({
                    ...current,
                    worker_name_snapshot: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">CCCD tại nhà máy</Label>
              <Input
                value={oldHistoryForm.worker_cccd_snapshot}
                onChange={(event) =>
                  setOldHistoryForm((current) => ({
                    ...current,
                    worker_cccd_snapshot: event.target.value.replace(/[^\d]/g, ""),
                  }))
                }
                inputMode="numeric"
              />
            </div>
            <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Ngày vào *</Label>
                <DateInput
                  value={oldHistoryForm.join_date}
                  max={oldHistoryForm.leave_date || todayIso()}
                  onChange={(value) =>
                    setOldHistoryForm((current) => ({ ...current, join_date: value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Ngày nghỉ *</Label>
                <DateInput
                  value={oldHistoryForm.leave_date}
                  min={oldHistoryForm.join_date}
                  max={todayIso()}
                  onChange={(value) =>
                    setOldHistoryForm((current) => ({ ...current, leave_date: value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ghi chú</Label>
              <Textarea
                value={oldHistoryForm.note}
                onChange={(event) =>
                  setOldHistoryForm((current) => ({ ...current, note: event.target.value }))
                }
                rows={3}
                placeholder="Ví dụ: bổ sung hồ sơ làm việc trước đây..."
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOldHistoryOpen(false)}
                disabled={oldHistorySaving}
              >
                Đóng
              </Button>
              <Button type="submit" disabled={oldHistorySaving}>
                {oldHistorySaving ? "Đang lưu..." : "Lưu lịch sử cũ"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingId} onOpenChange={(v) => !v && setEditingId(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sửa lịch sử đi làm</DialogTitle>
            <DialogDescription>
              Chỉnh sửa thông tin lịch sử đi làm của người lao động.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3 desktop:grid desktop:grid-cols-6 desktop:gap-2 desktop:space-y-0"
            onSubmit={(e) => {
              e.preventDefault();
              void saveEdit();
            }}
          >
            <div className="space-y-1 desktop:order-1 desktop:col-span-3">
              <Label className="text-xs">Nhà máy *</Label>
              <Select
                value={form.factory}
                onValueChange={(v) => setForm((f) => ({ ...f, factory: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn nhà máy" />
                </SelectTrigger>
                <SelectContent>
                  {factories.map((factory) => (
                    <SelectItem key={factory.id} value={factory.id}>
                      {factory.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 desktop:order-6 desktop:col-span-6">
              <Label className="text-xs">Địa chỉ NLĐ</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="Nhập địa chỉ người lao động"
              />
            </div>
            <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2 desktop:contents">
              <div className="space-y-1 desktop:order-3 desktop:col-span-2">
                <Label className="text-xs">Họ tên (NM)</Label>
                <Input
                  value={form.worker_name_snapshot}
                  onChange={(e) => setForm((f) => ({ ...f, worker_name_snapshot: e.target.value }))}
                />
              </div>
              <div className="space-y-1 desktop:order-4 desktop:col-span-3">
                <Label className="text-xs">CCCD (NM)</Label>
                <Input
                  value={form.worker_cccd_snapshot}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      worker_cccd_snapshot: e.target.value.replace(/[^\d]/g, ""),
                    }))
                  }
                />
              </div>
              <div className="space-y-1 desktop:order-2 desktop:col-span-1">
                <Label className="text-xs">Mã NV</Label>
                <Input
                  value={form.employee_code}
                  onChange={(e) => setForm((f) => ({ ...f, employee_code: e.target.value }))}
                />
              </div>
              <div className="space-y-1 desktop:order-5 desktop:col-span-3">
                <Label className="text-xs">Mã số thuế</Label>
                <Input
                  value={form.worker_tax_code_snapshot}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      worker_tax_code_snapshot: e.target.value.replace(/[^\d]/g, ""),
                    }))
                  }
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-1 desktop:order-7 desktop:col-span-2">
                <Label className="text-xs">Ngày vào</Label>
                <DateInput
                  value={form.join_date}
                  onChange={(v) => setForm((f) => ({ ...f, join_date: v }))}
                />
              </div>
              <div className="space-y-1 desktop:order-8 desktop:col-span-2">
                <Label className="text-xs">Ngày nghỉ</Label>
                <DateInput
                  value={form.leave_date}
                  onChange={(v) => setForm((f) => ({ ...f, leave_date: v }))}
                />
              </div>
            </div>
            <div className="space-y-1 desktop:order-9 desktop:col-span-2">
              <Label className="text-xs">Người tuyển</Label>
              <Select
                value={form.recruiter_staff}
                onValueChange={(v) => setForm((f) => ({ ...f, recruiter_staff: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn người tuyển" />
                </SelectTrigger>
                <SelectContent>
                  {staffUsers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name || s.username || s.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 desktop:order-10 desktop:col-span-2">
              <Label className="text-xs">Nhà chính</Label>
              <Select
                value={form.main_house}
                onValueChange={(v) => setForm((f) => ({ ...f, main_house: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn nhà chính" />
                </SelectTrigger>
                <SelectContent>
                  {mainHouses.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 desktop:order-11 desktop:col-span-4">
              <Label className="text-xs">Ghi chú</Label>
              <Input
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Tuỳ chọn"
              />
            </div>

            <div className="space-y-1.5 desktop:order-12 desktop:col-span-6">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Ảnh CCCD
              </Label>
              <CccdManager targetUser={user} actor={actor} onUpdated={onDataChanged} />
            </div>
            <DialogFooter className="desktop:order-13 desktop:col-span-6">
              <Button type="button" variant="outline" onClick={() => setEditingId(null)}>
                Huỷ
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Đang lưu..." : "Lưu"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={advanceOpen} onOpenChange={setAdvanceOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>Báo ứng lương</DialogTitle>
            <DialogDescription>
              Chỉ áp dụng cho người lao động đang có trạng thái đi làm.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submitAdvance();
            }}
          >
            <div className="rounded-xl border bg-muted/30 p-3 text-sm">
              <div className="font-semibold">
                {user.full_name || user.username || "Người lao động"}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {activeHistory?.expand?.factory?.name || user.company || "Chưa có nhà máy"} · Mã NV:{" "}
                {activeHistory?.employee_code || user.employee_code || "—"}
              </div>
            </div>

            {advanceLimit > 0 && (
              <div className="flex flex-wrap items-center gap-x-1 rounded-xl border border-dashed border-border bg-muted/30 p-2.5 text-xs text-muted-foreground">
                <span>
                  Hạn mức:{" "}
                  <span className="font-semibold text-foreground">
                    {advanceLimit.toLocaleString("vi-VN")} đ
                  </span>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Tồn ứng:{" "}
                  <span className="font-semibold text-foreground">
                    {advanceOutstandingLoading
                      ? "Đang tải..."
                      : `${advanceOutstanding.toLocaleString("vi-VN")} đ`}
                  </span>
                </span>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">Tài khoản nhận tiền</Label>
              <div className="space-y-1.5">
                {workerBank && (
                  <button
                    type="button"
                    onClick={() => setAdvanceBankChoice("worker")}
                    className={`flex w-full items-start gap-2 rounded-xl border p-2.5 text-left text-xs transition ${advanceBankChoice === "worker" ? "border-primary bg-primary/5" : "border-border bg-card"}`}
                  >
                    <div
                      className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${advanceBankChoice === "worker" ? "border-primary bg-primary" : "border-muted-foreground"}`}
                    />
                    <div>
                      <div className="font-medium">STK của NLĐ</div>
                      <div className="text-muted-foreground">{workerBank}</div>
                    </div>
                  </button>
                )}
                {actorBank && (
                  <button
                    type="button"
                    onClick={() => setAdvanceBankChoice("actor")}
                    className={`flex w-full items-start gap-2 rounded-xl border p-2.5 text-left text-xs transition ${advanceBankChoice === "actor" ? "border-primary bg-primary/5" : "border-border bg-card"}`}
                  >
                    <div
                      className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${advanceBankChoice === "actor" ? "border-primary bg-primary" : "border-muted-foreground"}`}
                    />
                    <div>
                      <div className="font-medium">STK của tôi ({actorBankRoleLabel})</div>
                      <div className="text-muted-foreground">{actorBank}</div>
                    </div>
                  </button>
                )}
                {!workerBank && !actorBank && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                    Chưa có STK nào. Cập nhật ngân hàng trước khi báo ứng.
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Số tiền</Label>
              <Input
                value={advanceAmount}
                onChange={(e) => setAdvanceAmount(formatMoneyInput(e.target.value))}
                inputMode="numeric"
                placeholder="Nhập số tiền ứng"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Lý do</Label>
              <Textarea
                rows={3}
                value={advanceReason}
                onChange={(e) => setAdvanceReason(e.target.value)}
                placeholder="Ví dụ: ứng tiền sinh hoạt..."
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAdvanceOpen(false)}>
                Huỷ
              </Button>
              <Button
                type="submit"
                disabled={submittingAdvance || !isWorking || (!workerBank && !actorBank)}
              >
                {submittingAdvance ? "Đang gửi..." : "Gửi yêu cầu"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={leaveOpen} onOpenChange={(v) => !leaveSaving && setLeaveOpen(v)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>Báo nghỉ nhà máy hiện tại</DialogTitle>
            <DialogDescription>
              Cập nhật ngày nghỉ cho bản ghi đang đi làm của người lao động.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submitLeave();
            }}
          >
            <div className="space-y-1">
              <Label className="text-xs">Ngày nghỉ</Label>
              <DateInput value={leaveDate} max={todayIso()} onChange={(v) => setLeaveDate(v)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ghi chú</Label>
              <Textarea
                rows={3}
                value={leaveNote}
                onChange={(e) => setLeaveNote(e.target.value)}
                placeholder="Ví dụ: nghỉ việc, chuyển nhà máy..."
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setLeaveOpen(false)}
                disabled={leaveSaving}
              >
                Huỷ
              </Button>
              <Button type="submit" disabled={leaveSaving}>
                {leaveSaving ? "Đang lưu..." : "Xác nhận nghỉ"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={joinOpen} onOpenChange={(v) => !joinSaving && setJoinOpen(v)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>Báo đi làm nhà máy mới</DialogTitle>
            <DialogDescription>
              Tạo bản ghi đi làm mới. Cần báo nghỉ nhà máy cũ trước khi tạo.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submitJoin();
            }}
          >
            <div className="space-y-1">
              <Label className="text-xs">Nhà máy *</Label>
              <Select
                value={joinForm.factory}
                onValueChange={(v) => setJoinForm((f) => ({ ...f, factory: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn nhà máy" />
                </SelectTrigger>
                <SelectContent>
                  {joinableFactories.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Nhà chính *</Label>
                <Select
                  value={joinForm.main_house}
                  onValueChange={(v) => setJoinForm((f) => ({ ...f, main_house: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn nhà chính" />
                  </SelectTrigger>
                  <SelectContent>
                    {mainHouses.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Người tuyển *</Label>
                <Select
                  value={joinForm.recruiter_staff}
                  onValueChange={(v) => setJoinForm((f) => ({ ...f, recruiter_staff: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn người tuyển" />
                  </SelectTrigger>
                  <SelectContent>
                    {staffUsers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.full_name || s.username || s.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Mã NV</Label>
                <Input
                  value={joinForm.employee_code}
                  onChange={(e) => setJoinForm((f) => ({ ...f, employee_code: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Ngày vào *</Label>
                <DateInput
                  value={joinForm.join_date}
                  max={todayIso()}
                  onChange={(v) => setJoinForm((f) => ({ ...f, join_date: v }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Họ tên tại nhà máy</Label>
              <Input
                value={joinForm.worker_name_snapshot}
                onChange={(e) =>
                  setJoinForm((f) => ({ ...f, worker_name_snapshot: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">CCCD tại nhà máy</Label>
              <Input
                value={joinForm.worker_cccd_snapshot}
                onChange={(e) =>
                  setJoinForm((f) => ({
                    ...f,
                    worker_cccd_snapshot: e.target.value.replace(/[^\d]/g, ""),
                  }))
                }
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Mã số thuế</Label>
              <Input
                value={joinForm.worker_tax_code_snapshot}
                onChange={(e) =>
                  setJoinForm((f) => ({
                    ...f,
                    worker_tax_code_snapshot: e.target.value.replace(/[^\d]/g, ""),
                  }))
                }
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ghi chú</Label>
              <Textarea
                rows={3}
                value={joinForm.note}
                onChange={(e) => setJoinForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Tuỳ chọn"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setJoinOpen(false)}
                disabled={joinSaving}
              >
                Huỷ
              </Button>
              <Button type="submit" disabled={joinSaving}>
                {joinSaving ? "Đang lưu..." : "Tạo bản ghi"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={employeeCodeOpen}
        onOpenChange={(v) => !employeeCodeSaving && setEmployeeCodeOpen(v)}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>Cập nhật mã nhân viên</DialogTitle>
            <DialogDescription>
              Cập nhật mã NV cho hồ sơ và lịch sử đi làm gần nhất.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submitEmployeeCode();
            }}
          >
            <div className="space-y-1">
              <Label className="text-xs">Mã nhân viên</Label>
              <Input
                value={employeeCodeForm}
                onChange={(e) => setEmployeeCodeForm(e.target.value)}
                placeholder="Nhập mã nhân viên"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEmployeeCodeOpen(false)}
                disabled={employeeCodeSaving}
              >
                Huỷ
              </Button>
              <Button type="submit" disabled={employeeCodeSaving}>
                {employeeCodeSaving ? "Đang lưu..." : "Lưu mã NV"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
