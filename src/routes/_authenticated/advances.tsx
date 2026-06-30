import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { pb, type UserRecord } from "@/lib/pocketbase";
import { useAuth } from "@/lib/auth";
import { useAppSettings } from "@/lib/app-settings";
import { PageContainer } from "@/components/layout/PageContainer";
import { FilterBar } from "@/components/ui/filter-bar";
import { StatCard } from "@/components/ui/stat-card";
import { StatusChip, toneBorder } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { exportToExcel } from "@/lib/excel";
import { escapePb } from "@/lib/delegations";
import { markSeen } from "@/lib/seen";
import { formatMoneyInput, parseMoneyInput } from "@/lib/money";
import { createStaffActionLog } from "@/lib/staff-log";
import { findActiveEmploymentByUser } from "@/lib/employment";
import { VN_BANKS, buildVietQrUrl, resolveBankName } from "@/lib/vn-banks";
import { toast } from "sonner";
import {
  Banknote,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileDown,
  History,
  Send,
  ShieldCheck,
  TriangleAlert,
  Wallet,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/advances")({
  component: AdvancesPage,
});

type AdvanceStatus = "pending" | "recruiter_approved" | "accepted" | "rejected";
type RecoveryStatus = "none" | "recovered" | "unrecoverable";
type AdminTab = "pending" | "recruiter_approved" | "accepted" | "recovered" | "unrecoverable" | "rejected" | "all";

type AdvanceRecord = {
  id: string;
  user?: string;
  requested_by?: string;
  recruiter_id?: string;
  expand?: {
    requested_by?: UserRecord;
  };
  employee_code: string;
  full_name: string;
  company: string;
  phone: string;
  bank_name?: string;
  bank_account_number?: string;
  bank_account_name?: string;
  amount: number;
  reason: string;
  status?: AdvanceStatus;
  recovery_status?: RecoveryStatus;
  admin_note?: string;
  recruiter_note?: string;
  recovery_note?: string;
  resolved_at?: string;
  recovered_at?: string;
  created: string;
};

const ADVANCE_TAB_FILTERS = {
  pending: 'status="pending"',
  recruiter_approved: 'status="recruiter_approved"',
  accepted: 'status="accepted" && (recovery_status="" || recovery_status="none")',
  recovered: 'status="accepted" && recovery_status="recovered"',
  unrecoverable: 'status="accepted" && recovery_status="unrecoverable"',
  rejected: 'status="rejected"',
  all: "",
} satisfies Record<AdminTab, string>;

function joinPbFilters(parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" && ");
}

function containsAny(fields: string[], keyword: string) {
  const q = escapePb(keyword.trim());
  if (!q) return "";
  return `(${fields.map((field) => `${field}~"${q}"`).join(" || ")})`;
}

function buildAdvanceFilter(input: {
  isAdmin: boolean;
  isStaff: boolean;
  userId?: string;
  tab?: AdminTab;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}) {
  if (!input.isAdmin && !input.userId) return 'id=""';

  const searchFilter = containsAny(
    [
      "full_name",
      "employee_code",
      "company",
      "phone",
      "bank_name",
      "bank_account_number",
      "bank_account_name",
      "reason",
      "admin_note",
      "recovery_note",
    ],
    input.search || "",
  );

  let roleFilter = "";
  if (!input.isAdmin && !input.isStaff && input.userId) {
    roleFilter = `user="${escapePb(input.userId)}"`;
  } else if (input.isStaff && !input.isAdmin && input.userId) {
    roleFilter = `recruiter_id="${escapePb(input.userId)}"`;
  }

  let tabFilter = "";
  if (input.tab) {
    if (input.isAdmin && input.tab === "pending") {
      tabFilter = 'status="recruiter_approved"';
    } else {
      tabFilter = ADVANCE_TAB_FILTERS[input.tab];
    }
  }

  return joinPbFilters([
    roleFilter,
    tabFilter,
    input.dateFrom ? `created>="${input.dateFrom} 00:00:00"` : "",
    input.dateTo ? `created<="${input.dateTo} 23:59:59"` : "",
    searchFilter,
  ]);
}

async function countAdvances(filter: string) {
  const res = await pb.collection("advances").getList(1, 1, { filter, fields: "id" });
  return res.totalItems || 0;
}

const STATUS_META: Record<
  AdvanceStatus,
  { label: string; tone: "warning" | "success" | "danger" | "primary" }
> = {
  pending: { label: "Chờ người tuyển duyệt", tone: "warning" },
  recruiter_approved: { label: "Chờ admin duyệt", tone: "primary" },
  accepted: { label: "Đã tiếp nhận", tone: "success" },
  rejected: { label: "Đã từ chối", tone: "danger" },
};

const RECOVERY_META: Record<
  RecoveryStatus,
  { label: string; tone: "neutral" | "success" | "danger" }
> = {
  none: { label: "Chờ thu hồi", tone: "neutral" },
  recovered: { label: "Đã thu hồi", tone: "success" },
  unrecoverable: { label: "Không thu hồi", tone: "danger" },
};

export function AdvancesPage() {
  const { user, isAdmin, isStaff } = useAuth();
  const { data: settings } = useAppSettings();

  const [items, setItems] = useState<AdvanceRecord[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<AdminTab>("pending");
  const [showProfile, setShowProfile] = useState(false);
  const [sending, setSending] = useState(false);
  const [amountText, setAmountText] = useState("");
  const [reason, setReason] = useState("");
  const [bankForm, setBankForm] = useState({
    bank_name: "",
    bank_account_number: "",
    bank_account_name: "",
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [advanceDetail, setAdvanceDetail] = useState<AdvanceRecord | null>(null);
  const [adminNoteDraft, setAdminNoteDraft] = useState("");
  const [recoveryNoteDraft, setRecoveryNoteDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [outstandingAmount, setOutstandingAmount] = useState(0);
  const [stats, setStats] = useState<Record<AdminTab, number>>({
    pending: 0,
    recruiter_approved: 0,
    accepted: 0,
    recovered: 0,
    unrecoverable: 0,
    rejected: 0,
    all: 0,
  });

  const selectedAdvanceUser = user as UserRecord | null;

  useEffect(() => {
    setAdminNoteDraft(advanceDetail?.admin_note || "");
    setRecoveryNoteDraft(advanceDetail?.recovery_note || "");
  }, [advanceDetail?.id]);

  useEffect(() => {
    if (!selectedAdvanceUser) return;
    setBankForm({
      bank_name: resolveBankName(selectedAdvanceUser.bank_name || ""),
      bank_account_number: selectedAdvanceUser.bank_account_number || "",
      bank_account_name: selectedAdvanceUser.bank_account_name || "",
    });
  }, [selectedAdvanceUser?.id, selectedAdvanceUser?.bank_name, selectedAdvanceUser?.bank_account_number, selectedAdvanceUser?.bank_account_name]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const filter = buildAdvanceFilter({
        isAdmin,
        isStaff,
        userId: user?.id,
        tab: (isAdmin || isStaff) ? tab : undefined,
        dateFrom,
        dateTo,
        search,
      });
      const res = await pb.collection("advances").getList(1, 300, {
        filter,
        sort: "-created",
        expand: "requested_by",
      });
      const rows = res.items as unknown as AdvanceRecord[];
      setItems(rows);
      if (!isAdmin) {
        const latestResolved = rows.reduce(
          (max, row) => Math.max(max, row.resolved_at ? new Date(row.resolved_at).getTime() : 0),
          0,
        );
        markSeen("advances", user?.id, latestResolved || Date.now());
      }
    } catch (error: unknown) {
      toast.error((error as any)?.message || "Lỗi tải Ứng lương");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, isAdmin, isStaff, search, tab, user?.id]);

  const loadStats = useCallback(async () => {
    const base = buildAdvanceFilter({
      isAdmin,
      isStaff,
      userId: user?.id,
      dateFrom,
      dateTo,
      search,
    });
    const withBase = (statusFilter: string) => joinPbFilters([base, statusFilter]);
    const [pending, recruiter_approved, accepted, recovered, unrecoverable, rejected, all] = await Promise.all([
      countAdvances(withBase(ADVANCE_TAB_FILTERS.pending)),
      countAdvances(withBase(ADVANCE_TAB_FILTERS.recruiter_approved)),
      countAdvances(withBase(ADVANCE_TAB_FILTERS.accepted)),
      countAdvances(withBase(ADVANCE_TAB_FILTERS.recovered)),
      countAdvances(withBase(ADVANCE_TAB_FILTERS.unrecoverable)),
      countAdvances(withBase(ADVANCE_TAB_FILTERS.rejected)),
      countAdvances(base),
    ]);
    setStats({ pending, recruiter_approved, accepted, recovered, unrecoverable, rejected, all });
  }, [dateFrom, dateTo, isAdmin, isStaff, search, user?.id]);

  const loadOutstanding = useCallback(async () => {
    if (!user?.id || isAdmin) {
      setOutstandingAmount(0);
      return;
    }
    const res = await pb.collection("advances").getList(1, 500, {
      filter: joinPbFilters([
        `user="${escapePb(user.id)}"`,
        '(status="pending" || (status="accepted" && (recovery_status="" || recovery_status="none")))',
      ]),
      fields: "amount",
    });
    setOutstandingAmount(
      (res.items as unknown as Pick<AdvanceRecord, "amount">[]).reduce(
        (sum, row) => sum + Number(row.amount || 0),
        0,
      ),
    );
  }, [isAdmin, user?.id]);

  useEffect(() => {
    load();
    loadStats().catch(() => {});
  }, [load, loadStats]);

  useEffect(() => {
    loadOutstanding().catch(() => {});
  }, [loadOutstanding]);

  const limit = Number(settings.advance_limit || 0);
  const outstanding = isAdmin ? 0 : outstandingAmount;
  const available = limit > 0 ? Math.max(0, limit - outstanding) : 0;

  const filtered = items;
  const isActionable = (row: AdvanceRecord) => {
    const status = row.status || "pending";
    const recovery = row.recovery_status || "none";
    if (isAdmin) return status === "recruiter_approved" || (status === "accepted" && recovery === "none");
    return status === "pending" || (status === "accepted" && recovery === "none");
  };
  const selectableFiltered = useMemo(() => filtered.filter(isActionable), [filtered]);
  const selectedPendingCount = filtered.filter(
    (row) => selectedIds.has(row.id) && (row.status || "pending") === (isAdmin ? "recruiter_approved" : "pending"),
  ).length;
  const selectedRecoverableCount = filtered.filter(
    (row) =>
      selectedIds.has(row.id) &&
      row.status === "accepted" &&
      (row.recovery_status || "none") === "none",
  ).length;
  const selectedActionableCount = selectedPendingCount + selectedRecoverableCount;

  const submit = async (e: React.FormEvent): Promise<boolean> => {
    e.preventDefault();
    const amount = parseMoneyInput(amountText);
    if (!amount) {
      toast.error("Số tiền xin ứng không được để trống");
      return false;
    }
    if (!reason.trim()) {
      toast.error("Lý do ứng không được để trống");
      return false;
    }
    if (!selectedAdvanceUser?.id) {
      toast.error("Chọn người báo ứng");
      return false;
    }
    if (limit <= 0) {
      toast.error("Admin chưa cài hạn mức Ứng lương");
      return false;
    }
    if (outstanding + amount > limit) {
      toast.error("Vượt hạn mức Ứng lương đang cài đặt");
      return false;
    }

    setSending(true);
    try {
      const employment = await findActiveEmploymentByUser(selectedAdvanceUser.id);
      const recruiterId = employment?.recruiter_staff || "";
      await pb.collection("advances").create({
        user: selectedAdvanceUser.id,
        requested_by: user?.id || selectedAdvanceUser.id,
        recruiter_id: recruiterId,
        employee_code: selectedAdvanceUser.employee_code || "",
        full_name: selectedAdvanceUser.full_name || "",
        company: selectedAdvanceUser.company || "",
        phone: selectedAdvanceUser.phone || "",
        bank_name: bankForm.bank_name || "",
        bank_account_number: bankForm.bank_account_number || "",
        bank_account_name: bankForm.bank_account_name || "",
        amount,
        reason: reason.trim(),
        status: "pending",
        recovery_status: "none",
      });
      toast.success("Đã gửi Ứng lương");
      setAmountText("");
      setReason("");
      load();
      return true;
    } catch (error: unknown) {
      toast.error((error as any)?.message || "Lỗi gửi Ứng lương");
      return false;
    } finally {
      setSending(false);
    }
  };

  const updateRow = async (id: string, payload: Partial<AdvanceRecord>) => {
    await pb.collection("advances").update(id, payload);
  };

  const bulkUpdate = async (status: Exclude<AdvanceStatus, "pending" | "recruiter_approved">) => {
    const targetStatus = isAdmin ? "recruiter_approved" : "pending";
    const rows = filtered.filter(
      (row) => selectedIds.has(row.id) && (row.status || "pending") === targetStatus,
    );
    if (!rows.length) return;
    try {
      for (const row of rows) {
        const after = {
          status,
          resolved_at: new Date().toISOString(),
          admin_note: row.admin_note || "",
        };
        await updateRow(row.id, after);
        await createStaffActionLog({
          actor: user,
          targetUserId: row.user,
          targetCollection: "advances",
          targetRecord: row.id,
          action: "update",
          before: { status: row.status || "pending" },
          after,
          note: status === "accepted" ? "Admin duyệt báo ứng" : "Admin từ chối báo ứng",
        });
      }
      toast.success(status === "accepted" ? "Đã duyệt" : "Đã từ chối");
      setSelectedIds(new Set());
      load();
    } catch (error: unknown) {
      toast.error((error as any)?.message || "Lỗi xử lý hàng loạt");
    }
  };

  const bulkResolveRecovery = async (recoveryStatus: Exclude<RecoveryStatus, "none">) => {
    const rows = filtered.filter(
      (row) =>
        selectedIds.has(row.id) &&
        row.status === "accepted" &&
        (row.recovery_status || "none") === "none",
    );
    if (!rows.length) return;
    try {
      for (const row of rows) {
        const after = {
          recovery_status: recoveryStatus,
          recovered_at: recoveryStatus === "recovered" ? new Date().toISOString() : "",
        };
        await updateRow(row.id, after);
        await createStaffActionLog({
          actor: user,
          targetUserId: row.user,
          targetCollection: "advances",
          targetRecord: row.id,
          action: "update",
          before: { recovery_status: row.recovery_status || "none" },
          after,
          note:
            recoveryStatus === "recovered"
              ? "Admin đánh dấu đã thu hồi"
              : "Admin đánh dấu không thu hồi",
        });
      }
      toast.success(
        recoveryStatus === "recovered" ? "Đã đánh dấu thu hồi" : "Đã đánh dấu không thu hồi",
      );
      setSelectedIds(new Set());
      load();
    } catch (error: unknown) {
      toast.error((error as any)?.message || "Lỗi xử lý hàng loạt");
    }
  };

  const resolveRecovery = async (
    row: AdvanceRecord,
    recoveryStatus: Exclude<RecoveryStatus, "none">,
  ) => {
    try {
      const after = {
        recovery_status: recoveryStatus,
        recovered_at: recoveryStatus === "recovered" ? new Date().toISOString() : "",
      };
      await updateRow(row.id, after);
      await createStaffActionLog({
        actor: user,
        targetUserId: row.user,
        targetCollection: "advances",
        targetRecord: row.id,
        action: "update",
        before: { recovery_status: row.recovery_status || "none" },
        after,
        note:
          recoveryStatus === "recovered"
            ? "Admin đánh dấu đã thu hồi"
            : "Admin đánh dấu không thể thu hồi",
      });
      toast.success(
        recoveryStatus === "recovered" ? "Đã đánh dấu thu hồi" : "Đã đánh dấu không thể thu hồi",
      );
      load();
    } catch (error: unknown) {
      toast.error((error as any)?.message || "Lỗi");
    }
  };

  const exportCurrent = () => {
    const rows = filtered.map((row) => ({
      "Họ tên": row.full_name,
      "Mã nhân viên": row.employee_code,
      "Nhà máy": row.company,
      "Số điện thoại": row.phone,
      "Người báo ứng": getAdvanceRequesterName(row),
      "Mã nhân viên người báo": getAdvanceRequesterField(row, "employee_code"),
      "Nhà máy người báo": getAdvanceRequesterField(row, "company"),
      "Số điện thoại người báo": getAdvanceRequesterField(row, "phone"),
      "Ngân hàng": row.bank_name || "",
      "Số tài khoản": row.bank_account_number || "",
      "Tên chủ tài khoản": row.bank_account_name || "",
      "Số tiền": row.amount,
      "Lý do": row.reason,
      "Trạng thái": STATUS_META[(row.status || "pending") as AdvanceStatus].label,
      "Thu hồi": RECOVERY_META[(row.recovery_status || "none") as RecoveryStatus].label,
      "Ghi chú admin": row.admin_note || "",
      "Ghi chú thu hồi": row.recovery_note || "",
      "Ngày gửi": row.created,
      "Ngày duyệt": row.resolved_at || "",
      "Ngày thu hồi": row.recovered_at || "",
    }));
    exportToExcel(`ung_luong_${Date.now()}`, { "Ứng lương": rows });
  };

  if (!isAdmin && !isStaff) {
    return (
      <PageContainer title="Ứng lương" subtitle="Xin ứng lương & xem lịch sử">
        <AdvanceRulesCard rules={settings.advance_rules} />

        <Button className="w-full" onClick={() => setShowProfile(true)}>
          <Send className="h-4 w-4" /> Báo ứng mới
        </Button>

        <Dialog open={showProfile} onOpenChange={setShowProfile}>
          <DialogContent className="inset-0 h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 rounded-none border-0 left-0 top-0 overflow-y-auto p-4">
            <DialogHeader>
              <DialogTitle>Báo ứng mới</DialogTitle>
              <DialogDescription>Nhập thông tin và gửi yêu cầu ứng lương.</DialogDescription>
            </DialogHeader>
            <form onSubmit={async (e) => { const ok = await submit(e); if (ok) setShowProfile(false); }} className="space-y-3">
              <div className="space-y-3">
                <div className="space-y-3 rounded-xl border bg-muted/30 p-3">
                  <div className="text-xs font-semibold text-muted-foreground">Thông tin người báo ứng</div>
                  <ReadOnlyField label="Mã NV" value={selectedAdvanceUser?.employee_code} />
                  <ReadOnlyField label="Họ và tên" value={selectedAdvanceUser?.full_name} />
                  <ReadOnlyField label="Nhà máy đang làm" value={selectedAdvanceUser?.company} />
                  <ReadOnlyField label="Số điện thoại liên hệ" value={selectedAdvanceUser?.phone} />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <StatCard
                    label="Hạn mức"
                    value={limit > 0 ? formatMoney(limit) : "Chưa cài"}
                    icon={Wallet}
                    tone="primary"
                  />
                  <StatCard
                    label="Đang dùng"
                    value={formatMoney(outstanding)}
                    icon={Banknote}
                    tone="warning"
                  />
                </div>
                <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                  Còn lại:{" "}
                  <span className="font-semibold text-foreground">
                    {limit > 0 ? formatMoney(available) : "—"}
                  </span>
                </div>

                <div className="space-y-3 rounded-xl border bg-muted/30 p-3">
                  <div className="text-xs font-semibold text-muted-foreground">Tài khoản nhận tiền</div>
                  <div className="space-y-1">
                    <Label>Ngân hàng</Label>
                    <Select
                      value={bankForm.bank_name || ""}
                      onValueChange={(value) => setBankForm({ ...bankForm, bank_name: value })}
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
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label>Số TK</Label>
                      <Input
                        value={bankForm.bank_account_number}
                        inputMode="numeric"
                        onChange={(e) =>
                          setBankForm({
                            ...bankForm,
                            bank_account_number: e.target.value.replace(/\D/g, ""),
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Tên TK</Label>
                      <Input
                        value={bankForm.bank_account_name}
                        onChange={(e) =>
                          setBankForm({ ...bankForm, bank_account_name: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label>Số tiền xin ứng</Label>
                  <Input
                    value={amountText}
                    onChange={(e) => setAmountText(formatMoneyInput(e.target.value))}
                    inputMode="numeric"
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Lý do ứng</Label>
                  <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} />
                </div>
                <Button type="submit" className="w-full" disabled={sending}>
                  <Send className="h-4 w-4" /> {sending ? "Đang gửi…" : "Gửi Ứng lương"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <div className="flex items-center gap-2 px-1 pt-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Lịch sử của bạn ({items.length})</span>
        </div>
        {items.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="Chưa có Ứng lương"
            description="Yêu cầu của bạn sẽ hiển thị tại đây."
          />
        ) : (
          items.map((row) => (
            <div
              key={row.id}
              className={cn(
                "list-card",
                toneBorder[STATUS_META[(row.status || "pending") as AdvanceStatus].tone],
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{formatMoney(row.amount)}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {new Date(row.created).toLocaleString("vi-VN")}
                  </div>
                </div>
                <StatusChip
                  tone={STATUS_META[(row.status || "pending") as AdvanceStatus].tone as any}
                >
                  {STATUS_META[(row.status || "pending") as AdvanceStatus].label}
                </StatusChip>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed">{row.reason}</p>
              {(row.bank_name || row.bank_account_number || row.bank_account_name) && (
                <div className="mt-2 rounded-lg bg-muted/60 p-2 text-[12px] text-muted-foreground">
                  Nhận tiền: {row.bank_name || "—"} · {row.bank_account_number || "—"} ·{" "}
                  {row.bank_account_name || "—"}
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <StatusChip
                  tone={
                    RECOVERY_META[(row.recovery_status || "none") as RecoveryStatus].tone as any
                  }
                >
                  {RECOVERY_META[(row.recovery_status || "none") as RecoveryStatus].label}
                </StatusChip>
              </div>
              {(row.admin_note || row.recovery_note) && (
                <div className="mt-2 space-y-2 rounded-lg bg-muted/60 p-2 text-[12px]">
                  {row.admin_note && (
                    <div>
                      <div className="font-semibold text-muted-foreground">Phản hồi admin:</div>
                      <div className="whitespace-pre-wrap">{row.admin_note}</div>
                    </div>
                  )}
                  {row.recovery_note && (
                    <div>
                      <div className="font-semibold text-muted-foreground">Ghi chú thu hồi:</div>
                      <div className="whitespace-pre-wrap">{row.recovery_note}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </PageContainer>
    );
  }

  if (isStaff && !isAdmin) {
    const staffResolve = async (row: AdvanceRecord, newStatus: "recruiter_approved" | "rejected") => {
      try {
        const after = {
          status: newStatus,
          ...(newStatus === "rejected" ? { resolved_at: new Date().toISOString() } : {}),
        };
        await updateRow(row.id, after);
        await createStaffActionLog({
          actor: user,
          targetUserId: row.user,
          targetCollection: "advances",
          targetRecord: row.id,
          action: "update",
          before: { status: row.status || "pending" },
          after,
          note: newStatus === "recruiter_approved" ? "Người tuyển chấp nhận ứng lương" : "Người tuyển từ chối ứng lương",
        });
        toast.success(newStatus === "recruiter_approved" ? "Đã chấp nhận" : "Đã từ chối");
        load();
      } catch (error: unknown) {
        toast.error((error as any)?.message || "Lỗi xử lý");
      }
    };

    return (
      <PageContainer title="Ứng lương" subtitle="Đơn ứng của NLĐ bạn tuyển">
        <div className="grid grid-cols-2 gap-2">
          <StatCard label="Chờ duyệt" value={stats.pending} icon={Clock} tone="warning" />
          <StatCard label="Đã chuyển admin" value={stats.recruiter_approved} icon={Check} tone="primary" />
          <StatCard label="Đã duyệt" value={stats.accepted} icon={Check} tone="success" />
          <StatCard label="Từ chối" value={stats.rejected} icon={X} tone="danger" />
        </div>

        <FilterBar
          search={search}
          onSearchChange={setSearch}
          placeholder="Tìm theo tên, mã NV…"
          chips={[
            { key: "pending", label: `Chờ duyệt (${stats.pending})` },
            { key: "recruiter_approved", label: `Đã chuyển admin (${stats.recruiter_approved})` },
            { key: "accepted", label: `Đã duyệt (${stats.accepted})` },
            { key: "rejected", label: `Từ chối (${stats.rejected})` },
            { key: "all", label: "Tất cả" },
          ]}
          activeChip={tab}
          onChipChange={(v) => setTab(v as AdminTab)}
        />

        {filtered.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="Không có đơn ứng lương"
            description="Đơn ứng của NLĐ bạn tuyển sẽ hiển thị tại đây."
          />
        ) : (
          filtered.map((row) => {
            const status = (row.status || "pending") as AdvanceStatus;
            return (
              <div
                key={row.id}
                className={cn(
                  "list-card cursor-pointer px-3 py-2",
                  toneBorder[STATUS_META[status].tone] || "",
                )}
                role="button"
                tabIndex={0}
                onClick={() => setAdvanceDetail(row)}
                onKeyDown={(event) => {
                  if (event.currentTarget !== event.target) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setAdvanceDetail(row);
                  }
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">
                      {row.employee_code || "-"} - {row.full_name || "-"}
                    </div>
                    <div className="text-sm font-bold text-primary">{formatMoney(row.amount)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(row.created).toLocaleString("vi-VN")}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusChip tone={STATUS_META[status].tone as any}>
                      {STATUS_META[status].label}
                    </StatusChip>
                    {status === "pending" && (
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          className="h-7 w-7"
                          title="Chấp nhận"
                          onClick={(e) => { e.stopPropagation(); staffResolve(row, "recruiter_approved"); }}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="destructive"
                          className="h-7 w-7"
                          title="Từ chối"
                          onClick={(e) => { e.stopPropagation(); staffResolve(row, "rejected"); }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
                <p className="mt-1 truncate text-[12px] text-muted-foreground">{row.reason}</p>
              </div>
            );
          })
        )}

        <AdvanceDetailDialog
          advanceDetail={advanceDetail}
          setAdvanceDetail={setAdvanceDetail}
          items={filtered}
          isAdmin={false}
          adminNoteDraft={adminNoteDraft}
          setAdminNoteDraft={setAdminNoteDraft}
          recoveryNoteDraft={recoveryNoteDraft}
          setRecoveryNoteDraft={setRecoveryNoteDraft}
          savingNotes={savingNotes}
          setSavingNotes={setSavingNotes}
          updateRow={updateRow}
          load={load}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="Ứng lương"
      subtitle={`${items.length} mục`}
      right={
        <button
          onClick={exportCurrent}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:bg-muted"
          aria-label="Xuất Excel"
        >
          <FileDown className="h-4 w-4" />
        </button>
      }
    >
      <AdvanceRulesCard rules={settings.advance_rules} />
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Chờ duyệt" value={stats.recruiter_approved} icon={Clock} tone="warning" />
        <StatCard label="Đã tiếp nhận" value={stats.accepted} icon={Check} tone="success" />
        <StatCard label="Từ chối" value={stats.rejected} icon={X} tone="danger" />
        <StatCard label="Đã thu hồi" value={stats.recovered} icon={ShieldCheck} tone="primary" />
        <StatCard label="Không thu hồi" value={stats.unrecoverable} icon={X} tone="danger" />
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        placeholder="Tìm theo tên, mã NV, số tiền…"
        chips={[
          { key: "pending", label: `Chờ duyệt (${stats.recruiter_approved})` },
          { key: "accepted", label: `Đã tiếp nhận (${stats.accepted})` },
          { key: "recovered", label: `Đã thu hồi (${stats.recovered})` },
          { key: "unrecoverable", label: `Không thu hồi (${stats.unrecoverable})` },
          { key: "rejected", label: `Từ chối (${stats.rejected})` },
          { key: "all", label: "Tất cả" },
        ]}
        activeChip={tab}
        onChipChange={(v) => setTab(v as AdminTab)}
      />

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Từ ngày</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Đến ngày</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      {selectedActionableCount > 0 && (
        <div className="sticky top-[var(--header-h,3.25rem)] z-20 -mx-4 flex items-center justify-between gap-2 bg-primary/10 px-4 py-2 backdrop-blur">
          <span className="text-xs font-medium text-primary">
            {selectedActionableCount} đã chọn
          </span>
          <div className="flex flex-wrap justify-end gap-2">
            {selectedPendingCount > 0 && (
              <>
                <Button size="sm" onClick={() => bulkUpdate("accepted")}>
                  <Check className="h-3.5 w-3.5" /> Duyệt
                </Button>
                <Button size="sm" variant="destructive" onClick={() => bulkUpdate("rejected")}>
                  <X className="h-3.5 w-3.5" /> Từ chối
                </Button>
              </>
            )}
            {selectedRecoverableCount > 0 && (
              <>
                <Button size="sm" onClick={() => bulkResolveRecovery("recovered")}>
                  <ShieldCheck className="h-3.5 w-3.5" /> Thu hồi
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => bulkResolveRecovery("unrecoverable")}
                >
                  Không thu hồi
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {selectableFiltered.length > 0 && (
        <label className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <Checkbox
            checked={selectableFiltered.every((row) => selectedIds.has(row.id))}
            onCheckedChange={(checked) =>
              setSelectedIds((current) => {
                if (!checked) return new Set();
                return new Set([...current, ...selectableFiltered.map((row) => row.id)]);
              })
            }
          />
          Chọn tất cả ({selectableFiltered.length})
        </label>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Không có Ứng lương"
          description={
            search || dateFrom || dateTo
              ? "Không có kết quả phù hợp."
              : "Dữ liệu sẽ hiển thị ở đây."
          }
        />
      ) : (
        filtered.map((row) => {
          const status = (row.status || "pending") as AdvanceStatus;
          const recovery = (row.recovery_status || "none") as RecoveryStatus;
          const selectable = isActionable(row);
          const canRecover = status === "accepted" && recovery === "none";
          const requesterName = getAdvanceRequesterName(row);
          return (
            <div
              key={row.id}
              className={cn(
                "list-card flex cursor-pointer items-center gap-2 px-3 py-2",
                toneBorder[STATUS_META[status].tone],
                !selectable && "opacity-95",
              )}
              role="button"
              tabIndex={0}
              onClick={() => setAdvanceDetail(row)}
              onKeyDown={(event) => {
                if (event.currentTarget !== event.target) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setAdvanceDetail(row);
                }
              }}
            >
              {selectable && (
                <Checkbox
                  checked={selectedIds.has(row.id)}
                  onCheckedChange={(checked) =>
                    setSelectedIds((current) => {
                      const next = new Set(current);
                      checked ? next.add(row.id) : next.delete(row.id);
                      return next;
                    })
                  }
                  className="shrink-0"
                  onClick={(event) => event.stopPropagation()}
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold leading-tight">
                    {row.employee_code || "-"} - {row.full_name || "-"}
                  </div>
                  <div className="mt-0.5 text-sm font-bold leading-tight text-primary">
                    {formatMoney(row.amount)}
                  </div>
                  <div className="truncate text-[11px] leading-tight text-muted-foreground">
                    Báo ứng: {requesterName}
                  </div>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(row.created).toLocaleString("vi-VN")}
                  </span>
                  <StatusChip tone={STATUS_META[status].tone}>
                    {STATUS_META[status].label}
                  </StatusChip>
                  {recovery !== "none" && (
                    <StatusChip tone={RECOVERY_META[recovery].tone as any}>
                      {RECOVERY_META[recovery].label}
                    </StatusChip>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {status === "recruiter_approved" && (
                  <>
                    <Button
                      size="icon"
                      className="h-8 w-8"
                      title="Tiếp nhận"
                      aria-label="Tiếp nhận ứng lương"
                      onClick={(event) => {
                        event.stopPropagation();
                        updateRow(row.id, {
                          status: "accepted",
                          resolved_at: new Date().toISOString(),
                        }).then(load);
                      }}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="destructive"
                      className="h-8 w-8"
                      title="Từ chối"
                      aria-label="Từ chối ứng lương"
                      onClick={(event) => {
                        event.stopPropagation();
                        updateRow(row.id, {
                          status: "rejected",
                          resolved_at: new Date().toISOString(),
                        }).then(load);
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
                {canRecover && (
                  <>
                    <Button
                      size="icon"
                      className="h-8 w-8"
                      title="Thu hồi"
                      aria-label="Đánh dấu đã thu hồi"
                      onClick={(event) => {
                        event.stopPropagation();
                        resolveRecovery(row, "recovered");
                      }}
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8"
                      title="Không thu hồi"
                      aria-label="Đánh dấu không thu hồi"
                      onClick={(event) => {
                        event.stopPropagation();
                        resolveRecovery(row, "unrecoverable");
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })
      )}

      <AdvanceDetailDialog
        advanceDetail={advanceDetail}
        setAdvanceDetail={setAdvanceDetail}
        items={filtered}
        isAdmin={isAdmin}
        adminNoteDraft={adminNoteDraft}
        setAdminNoteDraft={setAdminNoteDraft}
        recoveryNoteDraft={recoveryNoteDraft}
        setRecoveryNoteDraft={setRecoveryNoteDraft}
        savingNotes={savingNotes}
        setSavingNotes={setSavingNotes}
        updateRow={updateRow}
        load={load}
      />
    </PageContainer>
  );
}

function AdvanceDetailDialog({
  advanceDetail,
  setAdvanceDetail,
  items,
  isAdmin,
  adminNoteDraft,
  setAdminNoteDraft,
  recoveryNoteDraft,
  setRecoveryNoteDraft,
  savingNotes,
  setSavingNotes,
  updateRow,
  load,
}: {
  advanceDetail: AdvanceRecord | null;
  setAdvanceDetail: (v: AdvanceRecord | null) => void;
  items: AdvanceRecord[];
  isAdmin: boolean;
  adminNoteDraft: string;
  setAdminNoteDraft: (v: string) => void;
  recoveryNoteDraft: string;
  setRecoveryNoteDraft: (v: string) => void;
  savingNotes: boolean;
  setSavingNotes: (v: boolean) => void;
  updateRow: (id: string, payload: Partial<AdvanceRecord>) => Promise<void>;
  load: () => void;
}) {
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  const currentIndex = useMemo(() => {
    if (!advanceDetail) return -1;
    return items.findIndex((row) => row.id === advanceDetail.id);
  }, [advanceDetail, items]);

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < items.length - 1;

  const goPrev = useCallback(() => {
    if (hasPrev) setAdvanceDetail(items[currentIndex - 1]);
  }, [hasPrev, items, currentIndex, setAdvanceDetail]);

  const goNext = useCallback(() => {
    if (hasNext) setAdvanceDetail(items[currentIndex + 1]);
  }, [hasNext, items, currentIndex, setAdvanceDetail]);

  useEffect(() => {
    if (!advanceDetail) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [advanceDetail, goPrev, goNext]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    const diff = touchStartX.current - touchEndX.current;
    const threshold = 50;
    if (diff > threshold) goNext();
    else if (diff < -threshold) goPrev();
  };

  return (
    <Dialog open={!!advanceDetail} onOpenChange={(open) => !open && setAdvanceDetail(null)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>Chi tiết ứng lương</DialogTitle>
          <DialogDescription>
            {currentIndex >= 0 && items.length > 1
              ? `${currentIndex + 1} / ${items.length}`
              : "Thông tin đầy đủ của yêu cầu ứng lương."}
          </DialogDescription>
        </DialogHeader>

        {items.length > 1 && (
          <div className="flex items-center justify-between">
            <Button
              size="icon"
              variant="outline"
              className="h-9 w-9 rounded-full"
              disabled={!hasPrev}
              onClick={goPrev}
              aria-label="Card trước"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground">
              Vuốt hoặc bấm mũi tên để chuyển
            </span>
            <Button
              size="icon"
              variant="outline"
              className="h-9 w-9 rounded-full"
              disabled={!hasNext}
              onClick={goNext}
              aria-label="Card tiếp theo"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {advanceDetail && (
          <div
            className="space-y-3"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div className="rounded-xl border bg-muted/30 p-3">
              <div className="text-sm font-semibold">{advanceDetail.full_name || "-"}</div>
              <div className="text-[11px] text-muted-foreground">
                {[advanceDetail.employee_code, advanceDetail.company].filter(Boolean).join(" - ") || "-"}
                {advanceDetail.phone && (
                  <>
                    {" - "}
                    <a
                      href={`tel:${advanceDetail.phone.replace(/\s/g, "")}`}
                      className="font-medium text-primary underline-offset-2 hover:underline"
                    >
                      {advanceDetail.phone}
                    </a>
                  </>
                )}
              </div>
              <div className="mt-2 text-2xl font-bold text-primary">
                {formatMoney(advanceDetail.amount)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-sm">
              <AdvanceDetailCell
                label="Người báo ứng"
                value={getAdvanceRequesterName(advanceDetail)}
              />
              <AdvanceDetailCell
                label="TT người báo"
                value={getAdvanceRequesterMeta(advanceDetail)}
              />
              <AdvanceDetailCell
                label="Trạng thái"
                value={STATUS_META[(advanceDetail.status || "pending") as AdvanceStatus].label}
              />
              <AdvanceDetailCell
                label="Thu hồi"
                value={
                  RECOVERY_META[(advanceDetail.recovery_status || "none") as RecoveryStatus].label
                }
              />
              <AdvanceDetailCell label="Ngày gửi" value={formatDateTime(advanceDetail.created)} />
              <AdvanceDetailCell
                label="Ngày xử lý"
                value={formatDateTime(advanceDetail.resolved_at)}
              />
              <AdvanceDetailCell
                label="Ngày thu hồi"
                value={formatDateTime(advanceDetail.recovered_at)}
              />
            </div>

            <div className="rounded-xl border bg-card p-3 text-sm">
              <div className="text-[11px] text-muted-foreground">Tài khoản nhận tiền</div>
              <div className="mt-1 font-medium">{advanceDetail.bank_name || "-"}</div>
              <div className="mt-0.5 text-muted-foreground">
                {advanceDetail.bank_account_number || "-"} -{" "}
                {advanceDetail.bank_account_name || "-"}
              </div>
              {advanceDetail.status === "accepted" && (() => {
                const qrUrl = buildVietQrUrl({
                  bankName: advanceDetail.bank_name || "",
                  accountNumber: advanceDetail.bank_account_number || "",
                  accountName: advanceDetail.bank_account_name,
                  amount: advanceDetail.amount,
                  description: `Ung luong ${advanceDetail.full_name}`,
                });
                if (!qrUrl) return null;
                return (
                  <div className="mt-3 flex flex-col items-center gap-2 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-3">
                    <div className="text-[11px] font-semibold text-primary">Mã QR chuyển khoản</div>
                    <img
                      src={qrUrl}
                      alt="QR chuyển khoản"
                      className="h-52 w-52 rounded-lg"
                      loading="lazy"
                    />
                    <div className="text-center text-[11px] text-muted-foreground">
                      Quét mã để chuyển {formatMoney(advanceDetail.amount)} VND
                    </div>
                  </div>
                );
              })()}
            </div>

            <AdvanceTextBlock label="Lý do ứng" value={advanceDetail.reason} />
            {isAdmin ? (
              <>
                <div className="rounded-xl border bg-card p-3 text-sm">
                  <Label className="text-[11px] text-muted-foreground">Ghi chú admin</Label>
                  <Textarea
                    rows={3}
                    value={adminNoteDraft}
                    onChange={(e) => setAdminNoteDraft(e.target.value)}
                    className="mt-1"
                    placeholder="Lý do duyệt/từ chối, ghi chú nội bộ…"
                  />
                </div>
                {advanceDetail.status === "accepted" && (
                  <div className="rounded-xl border bg-card p-3 text-sm">
                    <Label className="text-[11px] text-muted-foreground">Ghi chú thu hồi</Label>
                    <Textarea
                      rows={3}
                      value={recoveryNoteDraft}
                      onChange={(e) => setRecoveryNoteDraft(e.target.value)}
                      className="mt-1"
                      placeholder="Tình trạng thu hồi, lý do không thu hồi…"
                    />
                  </div>
                )}
                <Button
                  className="w-full"
                  disabled={
                    savingNotes ||
                    (adminNoteDraft === (advanceDetail.admin_note || "") &&
                      recoveryNoteDraft === (advanceDetail.recovery_note || ""))
                  }
                  onClick={async () => {
                    if (!advanceDetail) return;
                    setSavingNotes(true);
                    try {
                      const payload: Partial<AdvanceRecord> = {
                        admin_note: adminNoteDraft,
                      };
                      if (advanceDetail.status === "accepted") {
                        payload.recovery_note = recoveryNoteDraft;
                      }
                      await updateRow(advanceDetail.id, payload);
                      toast.success("Đã lưu ghi chú");
                      setAdvanceDetail({ ...advanceDetail, ...payload });
                      load();
                    } catch (error: unknown) {
                      toast.error(error instanceof Error ? error.message : "Lỗi lưu ghi chú");
                    } finally {
                      setSavingNotes(false);
                    }
                  }}
                >
                  {savingNotes ? "Đang lưu…" : "Lưu ghi chú"}
                </Button>
              </>
            ) : (
              <>
                <AdvanceTextBlock label="Ghi chú admin" value={advanceDetail.admin_note} />
                <AdvanceTextBlock label="Ghi chú thu hồi" value={advanceDetail.recovery_note} />
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AdvanceDetailCell({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <div className="rounded-lg bg-muted/40 px-2.5 py-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="break-words text-xs font-medium">{value || "-"}</div>
    </div>
  );
}

function AdvanceTextBlock({ label, value }: { label: string; value?: string }) {
  if (!value?.trim()) return null;
  return (
    <div className="rounded-xl border bg-card p-3 text-sm">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 whitespace-pre-wrap leading-relaxed">{value}</div>
    </div>
  );
}

function formatDateTime(value?: string) {
  return value ? new Date(value).toLocaleString("vi-VN") : "-";
}

function getAdvanceRequesterName(row: AdvanceRecord) {
  const requester = row.expand?.requested_by;
  if (requester) {
    return requester.full_name || requester.username || requester.phone || row.requested_by || "-";
  }
  if (row.requested_by && row.user && row.requested_by === row.user) {
    return row.full_name || row.employee_code || row.phone || "-";
  }
  return row.requested_by || "-";
}

function getAdvanceRequesterMeta(row: AdvanceRecord) {
  const requester = row.expand?.requested_by;
  if (requester) {
    return (
      [requester.employee_code, requester.company, requester.phone].filter(Boolean).join(" - ") ||
      "-"
    );
  }
  if (row.requested_by && row.user && row.requested_by === row.user) {
    return [row.employee_code, row.company, row.phone].filter(Boolean).join(" - ") || "-";
  }
  return row.requested_by || "-";
}

function getAdvanceRequesterField(
  row: AdvanceRecord,
  field: "employee_code" | "company" | "phone",
) {
  const requester = row.expand?.requested_by;
  if (requester?.[field]) return String(requester[field]);
  if (row.requested_by && row.user && row.requested_by === row.user) return row[field] || "";
  return "";
}

function AdvanceRulesCard({ rules }: { rules?: string }) {
  const [open, setOpen] = useState(false);
  const content = rules?.trim();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-left text-amber-900 shadow-soft transition active:scale-[0.99]"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-800">
          <TriangleAlert className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold leading-tight">Nội quy Ứng lương</span>
          <span className="block truncate text-[11px] leading-tight text-amber-800/80">
            Bấm để xem quy định từ admin
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80dvh] overflow-hidden rounded-2xl">
          <DialogHeader>
            <DialogTitle>Nội quy Ứng lương</DialogTitle>
            <DialogDescription>Quy định do admin thiết lập.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[55dvh] overflow-y-auto whitespace-pre-wrap rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-950">
            {content || "Admin chưa thiết lập nội quy Ứng lương."}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReadOnlyField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm text-foreground">
        {value?.trim() || "—"}
      </div>
    </div>
  );
}

function formatMoney(value: number) {
  return Number(value || 0).toLocaleString("vi-VN");
}
