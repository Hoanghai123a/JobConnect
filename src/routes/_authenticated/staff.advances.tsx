import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { pb, type UserRecord } from "@/lib/pocketbase";
import { useAuth } from "@/lib/auth";
import { useAppSettings } from "@/lib/app-settings";
import {
  type AdvanceRecord,
  type AdvanceStatus,
  type AdminTab,
  ADVANCE_TAB_FILTERS,
  STATUS_META,
  joinPbFilters,
  buildAdvanceFilter,
  countAdvances,
  formatMoney,
} from "@/lib/advances";
import { escapePb } from "@/lib/delegations";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createStaffActionLog } from "@/lib/staff-log";
import { parseMoneyInput, formatMoneyInput } from "@/lib/money";
import { VN_BANKS, resolveBankName } from "@/lib/vn-banks";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Check,
  Clock,
  Plus,
  Send,
  Wallet,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/staff/advances")({
  component: StaffAdvancesPage,
});

// PLACEHOLDER_CONTINUE

function StaffAdvancesPage() {
  const { user, isAdmin, isStaff } = useAuth();
  const { data: settings } = useAppSettings();
  const [segment, setSegment] = useState<"workers" | "mine">("workers");

  return (
    <PageContainer title="Ứng lương">
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        <button
          type="button"
          className={cn(
            "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            segment === "workers" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setSegment("workers")}
        >
          Duyệt ứng NLĐ
        </button>
        <button
          type="button"
          className={cn(
            "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            segment === "mine" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setSegment("mine")}
        >
          Ứng của tôi
        </button>
      </div>

      {segment === "workers" ? (
        <WorkerAdvancesView />
      ) : (
        <MyAdvancesView />
      )}
    </PageContainer>
  );
}

// PLACEHOLDER_WORKERS_VIEW

function WorkerAdvancesView() {
  const { user, isAdmin, isStaff } = useAuth();
  const [items, setItems] = useState<AdvanceRecord[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<AdminTab>("pending");
  const [loading, setLoading] = useState(false);
  const [advanceDetail, setAdvanceDetail] = useState<AdvanceRecord | null>(null);
  const [stats, setStats] = useState<Record<AdminTab, number>>({
    pending: 0,
    recruiter_approved: 0,
    accepted: 0,
    recovered: 0,
    unrecoverable: 0,
    rejected: 0,
    all: 0,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const filter = buildAdvanceFilter({
        isAdmin,
        isStaff,
        userId: user?.id,
        tab,
      });
      const res = await pb.collection("advances").getList(1, 300, {
        filter,
        sort: "-created",
        expand: "requested_by",
      });
      setItems(res.items as unknown as AdvanceRecord[]);
    } catch (error: unknown) {
      toast.error((error as any)?.message || "Lỗi tải Ứng lương");
    } finally {
      setLoading(false);
    }
  }, [isAdmin, isStaff, tab, user?.id]);

  const loadStats = useCallback(async () => {
    const base = buildAdvanceFilter({
      isAdmin,
      isStaff,
      userId: user?.id,
    });
    const withBase = (f: string) => joinPbFilters([base, f]);
    const [pending, recruiter_approved, accepted, rejected, all] = await Promise.all([
      countAdvances(withBase(ADVANCE_TAB_FILTERS.pending)),
      countAdvances(withBase(ADVANCE_TAB_FILTERS.recruiter_approved)),
      countAdvances(withBase(ADVANCE_TAB_FILTERS.accepted)),
      countAdvances(withBase(ADVANCE_TAB_FILTERS.rejected)),
      countAdvances(base),
    ]);
    setStats((s) => ({ ...s, pending, recruiter_approved, accepted, rejected, all }));
  }, [isAdmin, isStaff, user?.id]);

  useEffect(() => { load(); loadStats().catch(() => {}); }, [load, loadStats]);

  const updateRow = async (id: string, payload: Partial<AdvanceRecord>) => {
    await pb.collection("advances").update(id, payload);
  };

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
      loadStats().catch(() => {});
    } catch (error: unknown) {
      toast.error((error as any)?.message || "Lỗi xử lý");
    }
  };

  return (
    <>
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

      {items.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Không có đơn ứng lương"
          description="Đơn ứng của NLĐ bạn tuyển sẽ hiển thị tại đây."
        />
      ) : (
        items.map((row) => {
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

      <AdvanceQuickDetail detail={advanceDetail} onClose={() => setAdvanceDetail(null)} />
    </>
  );
}

// PLACEHOLDER_MY_ADVANCES

function MyAdvancesView() {
  const { user } = useAuth();
  const { data: settings } = useAppSettings();
  const [items, setItems] = useState<AdvanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [sending, setSending] = useState(false);
  const [amountText, setAmountText] = useState("");
  const [reason, setReason] = useState("");
  const [bankForm, setBankForm] = useState({
    bank_name: "",
    bank_account_number: "",
    bank_account_name: "",
  });
  const [adminList, setAdminList] = useState<UserRecord[]>([]);
  const [selectedAdmins, setSelectedAdmins] = useState<string[]>([]);
  const [outstandingAmount, setOutstandingAmount] = useState(0);

  const limit = Number(settings.advance_limit || 0);
  const available = limit > 0 ? Math.max(0, limit - outstandingAmount) : 0;

  useEffect(() => {
    if (!user) return;
    setBankForm({
      bank_name: resolveBankName(user.bank_name || ""),
      bank_account_number: user.bank_account_number || "",
      bank_account_name: user.bank_account_name || "",
    });
  }, [user?.id, user?.bank_name, user?.bank_account_number, user?.bank_account_name]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const filter = buildAdvanceFilter({
        isAdmin: false,
        isStaff: false,
        userId: user.id,
        staffSelfOnly: true,
      });
      const res = await pb.collection("advances").getList(1, 300, {
        filter,
        sort: "-created",
      });
      setItems(res.items as unknown as AdvanceRecord[]);
    } catch (error: unknown) {
      toast.error((error as any)?.message || "Lỗi tải danh sách ứng");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const loadOutstanding = useCallback(async () => {
    if (!user?.id) return;
    const res = await pb.collection("advances").getList(1, 500, {
      filter: joinPbFilters([
        `user="${escapePb(user.id)}"`,
        `requested_by="${escapePb(user.id)}"`,
        'recruiter_id=""',
        '(status="recruiter_approved" || (status="accepted" && (recovery_status="" || recovery_status="none")))',
      ]),
      fields: "amount",
    });
    setOutstandingAmount(
      (res.items as unknown as Pick<AdvanceRecord, "amount">[]).reduce(
        (sum, row) => sum + Number(row.amount || 0),
        0,
      ),
    );
  }, [user?.id]);

  useEffect(() => { load(); loadOutstanding().catch(() => {}); }, [load, loadOutstanding]);

  useEffect(() => {
    if (!showForm) return;
    pb.collection("users")
      .getFullList<UserRecord>({ filter: 'role="admin"', sort: "full_name" })
      .then(setAdminList)
      .catch(() => {});
  }, [showForm]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseMoneyInput(amountText);
    if (!amount) return toast.error("Số tiền không được để trống");
    if (!reason.trim()) return toast.error("Lý do không được để trống");
    if (!selectedAdmins.length) return toast.error("Vui lòng chọn ít nhất 1 admin duyệt");
    if (limit <= 0) return toast.error("Admin chưa cài hạn mức ứng lương");
    if (outstandingAmount + amount > limit) return toast.error("Vượt hạn mức ứng lương");

    setSending(true);
    try {
      await pb.collection("advances").create({
        user: user!.id,
        requested_by: user!.id,
        recruiter_id: "",
        full_name: user!.full_name || "",
        employee_code: user!.employee_code || "",
        company: "",
        phone: user!.phone || "",
        bank_name: bankForm.bank_name,
        bank_account_number: bankForm.bank_account_number,
        bank_account_name: bankForm.bank_account_name,
        amount,
        reason: reason.trim(),
        status: "recruiter_approved",
        recovery_status: "none",
        target_admins: selectedAdmins,
      });
      toast.success("Đã gửi yêu cầu ứng lương");
      setAmountText("");
      setReason("");
      setSelectedAdmins([]);
      setShowForm(false);
      load();
      loadOutstanding().catch(() => {});
    } catch (error: unknown) {
      toast.error((error as any)?.message || "Lỗi gửi ứng lương");
    } finally {
      setSending(false);
    }
  };

  const pendingCount = items.filter((r) => r.status === "recruiter_approved").length;
  const acceptedCount = items.filter((r) => r.status === "accepted").length;
  const rejectedCount = items.filter((r) => r.status === "rejected").length;

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Chờ admin duyệt" value={pendingCount} icon={Clock} tone="warning" />
        <StatCard label="Đã tiếp nhận" value={acceptedCount} icon={Check} tone="success" />
        <StatCard label="Từ chối" value={rejectedCount} icon={X} tone="danger" />
        <StatCard
          label="Còn được ứng"
          value={limit > 0 ? formatMoney(available) : "—"}
          icon={Wallet}
          tone="primary"
        />
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Chưa có đơn ứng"
          description="Nhấn nút + để tạo yêu cầu ứng lương."
        />
      ) : (
        items.map((row) => {
          const status = (row.status || "recruiter_approved") as AdvanceStatus;
          return (
            <div
              key={row.id}
              className={cn(
                "list-card px-3 py-2",
                toneBorder[STATUS_META[status].tone] || "",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-primary">{formatMoney(row.amount)}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(row.created).toLocaleString("vi-VN")}
                  </div>
                </div>
                <StatusChip tone={STATUS_META[status].tone as any}>
                  {STATUS_META[status].label}
                </StatusChip>
              </div>
              <p className="mt-1 truncate text-[12px] text-muted-foreground">{row.reason}</p>
            </div>
          );
        })
      )}

      <Button
        className="fixed bottom-20 right-4 z-30 h-12 w-12 rounded-full shadow-lg"
        onClick={() => setShowForm(true)}
      >
        <Plus className="h-5 w-5" />
      </Button>

      <StaffAdvanceFormDialog
        open={showForm}
        onOpenChange={setShowForm}
        amountText={amountText}
        setAmountText={setAmountText}
        reason={reason}
        setReason={setReason}
        bankForm={bankForm}
        setBankForm={setBankForm}
        adminList={adminList}
        selectedAdmins={selectedAdmins}
        setSelectedAdmins={setSelectedAdmins}
        sending={sending}
        onSubmit={submit}
        limit={limit}
        outstanding={outstandingAmount}
      />
    </>
  );
}

// PLACEHOLDER_FORM_DIALOG

function StaffAdvanceFormDialog({
  open,
  onOpenChange,
  amountText,
  setAmountText,
  reason,
  setReason,
  bankForm,
  setBankForm,
  adminList,
  selectedAdmins,
  setSelectedAdmins,
  sending,
  onSubmit,
  limit,
  outstanding,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  amountText: string;
  setAmountText: (v: string) => void;
  reason: string;
  setReason: (v: string) => void;
  bankForm: { bank_name: string; bank_account_number: string; bank_account_name: string };
  setBankForm: (v: { bank_name: string; bank_account_number: string; bank_account_name: string }) => void;
  adminList: UserRecord[];
  selectedAdmins: string[];
  setSelectedAdmins: (v: string[]) => void;
  sending: boolean;
  onSubmit: (e: React.FormEvent) => void;
  limit: number;
  outstanding: number;
}) {
  const available = limit > 0 ? Math.max(0, limit - outstanding) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Xin ứng lương</DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          {limit > 0 && (
            <div className="rounded-xl border bg-muted/30 px-3 py-2 text-xs">
              <span className="text-muted-foreground">Hạn mức: </span>
              <span className="font-medium">{formatMoney(limit)}</span>
              <span className="mx-2 text-muted-foreground">|</span>
              <span className="text-muted-foreground">Đang ứng: </span>
              <span className="font-medium">{formatMoney(outstanding)}</span>
              <span className="mx-2 text-muted-foreground">|</span>
              <span className="text-muted-foreground">Còn: </span>
              <span className="font-semibold text-primary">{formatMoney(available)}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Số tiền *</Label>
            <Input
              inputMode="numeric"
              value={amountText}
              onChange={(e) => setAmountText(formatMoneyInput(e.target.value))}
              placeholder="Nhập số tiền ứng"
              className="rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Lý do *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Lý do xin ứng"
              className="min-h-16 rounded-xl"
            />
          </div>
// PLACEHOLDER_FORM_BANK

          <div className="space-y-1.5">
            <Label>Ngân hàng</Label>
            <Input
              value={bankForm.bank_name}
              onChange={(e) => setBankForm({ ...bankForm, bank_name: e.target.value })}
              placeholder="Tên ngân hàng"
              className="rounded-xl"
              list="bank-list"
            />
            <datalist id="bank-list">
              {VN_BANKS.map((b) => (
                <option key={b.code} value={b.name} />
              ))}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Số tài khoản</Label>
              <Input
                value={bankForm.bank_account_number}
                onChange={(e) => setBankForm({ ...bankForm, bank_account_number: e.target.value })}
                placeholder="Số TK"
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Chủ tài khoản</Label>
              <Input
                value={bankForm.bank_account_name}
                onChange={(e) => setBankForm({ ...bankForm, bank_account_name: e.target.value })}
                placeholder="Tên chủ TK"
                className="rounded-xl"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Gửi tới admin duyệt * ({selectedAdmins.length} đã chọn)</Label>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border p-2">
              {adminList.map((admin) => (
                <label
                  key={admin.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/50"
                >
                  <Checkbox
                    checked={selectedAdmins.includes(admin.id)}
                    onCheckedChange={() =>
                      setSelectedAdmins(
                        selectedAdmins.includes(admin.id)
                          ? selectedAdmins.filter((a) => a !== admin.id)
                          : [...selectedAdmins, admin.id],
                      )
                    }
                  />
                  <span>{admin.full_name || admin.username || admin.email}</span>
                </label>
              ))}
              {!adminList.length && (
                <div className="py-2 text-center text-xs text-muted-foreground">
                  Không tìm thấy admin
                </div>
              )}
            </div>
          </div>

          <Button type="submit" disabled={sending} className="w-full gap-2 rounded-xl">
            <Send className="h-4 w-4" />
            {sending ? "Đang gửi…" : "Gửi yêu cầu"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AdvanceQuickDetail({
  detail,
  onClose,
}: {
  detail: AdvanceRecord | null;
  onClose: () => void;
}) {
  if (!detail) return null;
  const status = (detail.status || "pending") as AdvanceStatus;

  return (
    <Dialog open={!!detail} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Chi tiết ứng lương</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-xl border bg-muted/30 p-3">
            <div className="text-sm font-semibold">{detail.full_name || "-"}</div>
            <div className="text-[11px] text-muted-foreground">
              {[detail.employee_code, detail.company].filter(Boolean).join(" - ") || "-"}
            </div>
            <div className="mt-2 text-2xl font-bold text-primary">{formatMoney(detail.amount)}</div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <DetailCell label="Trạng thái" value={STATUS_META[status].label} />
            <DetailCell label="Ngày gửi" value={new Date(detail.created).toLocaleDateString("vi-VN")} />
            <DetailCell label="Ngân hàng" value={detail.bank_name} />
            <DetailCell label="Số TK" value={detail.bank_account_number} />
          </div>
          <div className="rounded-xl border bg-card p-3 text-sm">
            <div className="text-[10px] text-muted-foreground">Lý do</div>
            <div className="mt-0.5 whitespace-pre-wrap text-xs">{detail.reason || "-"}</div>
          </div>
          {detail.admin_note && (
            <div className="rounded-xl border bg-card p-3 text-sm">
              <div className="text-[10px] text-muted-foreground">Ghi chú admin</div>
              <div className="mt-0.5 whitespace-pre-wrap text-xs">{detail.admin_note}</div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailCell({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-lg bg-muted/40 px-2.5 py-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="break-words text-xs font-medium">{value || "-"}</div>
    </div>
  );
}
