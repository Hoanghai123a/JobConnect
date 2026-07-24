import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { pb, type UserRecord } from "@/lib/pocketbase";
import { useAuth } from "@/lib/auth";
import { useAppSettings } from "@/lib/app-settings";
import {
  fetchCachedStaffWorkspace,
  fetchStaffWorkspace,
  type StaffWorkerRecord,
} from "@/lib/staff-permissions";
import { useStaffCacheSignal } from "@/lib/use-staff-cache-signal";
import { escapePb } from "@/lib/delegations";
import {
  type AdvanceRecord,
  type AdvanceStatus,
  type AdminTab,
  ADVANCE_TAB_FILTERS,
  STATUS_META,
  joinPbFilters,
  buildAdvanceFilter,
  formatMoney,
} from "@/lib/advances";
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
  DialogDescription,
  DialogFooter,
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
  ChevronRight,
  CircleDollarSign,
  Clock,
  Landmark,
  Plus,
  RotateCcw,
  Search,
  Send,
  Wallet,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/staff/advances")({
  component: StaffAdvancesPage,
});

type AdvanceSummary = {
  count: number;
  total: number;
};

function emptyAdvanceSummaries(): Record<AdminTab, AdvanceSummary> {
  return {
    pending: { count: 0, total: 0 },
    recruiter_approved: { count: 0, total: 0 },
    accepted: { count: 0, total: 0 },
    recovered: { count: 0, total: 0 },
    unrecoverable: { count: 0, total: 0 },
    rejected: { count: 0, total: 0 },
    all: { count: 0, total: 0 },
  };
}

function statValue(summary: AdvanceSummary) {
  return (
    <span className="block text-[15px] leading-tight sm:text-base">
      SL:{summary.count} - {formatMoney(summary.total)}đ
    </span>
  );
}

async function loadAdvanceSummary(filter: string): Promise<AdvanceSummary> {
  const rows = await pb.collection("advances").getFullList<Pick<AdvanceRecord, "amount">>({
    filter,
    fields: "amount",
  });
  return rows.reduce<AdvanceSummary>(
    (summary, row) => ({
      count: summary.count + 1,
      total: summary.total + Number(row.amount || 0),
    }),
    { count: 0, total: 0 },
  );
}

type OutstandingAdvance = AdvanceRecord & {
  expand?: AdvanceRecord["expand"] & {
    requested_by?: UserRecord;
  };
};

type OutstandingWorkerSummary = {
  workerId: string;
  fullName: string;
  employeeCode: string;
  company: string;
  count: number;
  total: number;
  advances: OutstandingAdvance[];
};

const OUTSTANDING_ADVANCE_FILTER =
  '(status="pending" || status="recruiter_approved" || (status="accepted" && (recovery_status="" || recovery_status="none")))';

function groupOutstandingAdvances(rows: OutstandingAdvance[]): OutstandingWorkerSummary[] {
  const grouped = new Map<string, OutstandingWorkerSummary>();

  for (const row of rows) {
    const workerId = row.user || `missing-${row.id}`;
    const current = grouped.get(workerId);
    if (current) {
      current.count += 1;
      current.total += Number(row.amount || 0);
      current.advances.push(row);
      continue;
    }

    grouped.set(workerId, {
      workerId,
      fullName: row.full_name || "Chưa có tên",
      employeeCode: row.employee_code || "",
      company: row.company || "",
      count: 1,
      total: Number(row.amount || 0),
      advances: [row],
    });
  }

  return [...grouped.values()]
    .map((worker) => ({
      ...worker,
      advances: [...worker.advances].sort(
        (a, b) => new Date(b.created || 0).getTime() - new Date(a.created || 0).getTime(),
      ),
    }))
    .sort((a, b) => b.total - a.total || a.fullName.localeCompare(b.fullName, "vi"));
}

async function loadStaffOutstandingWorkers(staffId: string) {
  const rows = await pb.collection("advances").getFullList<OutstandingAdvance>({
    filter: joinPbFilters([
      `recruiter_id="${escapePb(staffId)}"`,
      `user!="${escapePb(staffId)}"`,
      OUTSTANDING_ADVANCE_FILTER,
    ]),
    sort: "-created",
    expand: "requested_by",
  });
  return groupOutstandingAdvances(rows);
}

function outstandingStatusMeta(row: OutstandingAdvance) {
  if (row.status === "pending") return { label: "Chờ người tuyển duyệt", tone: "warning" as const };
  if (row.status === "recruiter_approved") return { label: "Chờ admin duyệt", tone: "primary" as const };
  return { label: "Chờ thu hồi", tone: "neutral" as const };
}

function getOutstandingRequesterName(row: OutstandingAdvance) {
  const requester = row.expand?.requested_by;
  return requester?.full_name || requester?.username || requester?.phone || "Không xác định";
}

// PLACEHOLDER_CONTINUE

function StaffAdvancesPage() {
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
  const { data: settings } = useAppSettings();
  const [items, setItems] = useState<AdvanceRecord[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<AdminTab>("pending");
  const [loading, setLoading] = useState(false);
  const [advanceDetail, setAdvanceDetail] = useState<AdvanceRecord | null>(null);
  const [withdrawTarget, setWithdrawTarget] = useState<AdvanceRecord | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [workers, setWorkers] = useState<StaffWorkerRecord[]>([]);
  const [loadingWorkers, setLoadingWorkers] = useState(false);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [workerSearch, setWorkerSearch] = useState("");
  const [workerAmountText, setWorkerAmountText] = useState("");
  const [workerReason, setWorkerReason] = useState("");
  const [bankChoice, setBankChoice] = useState<"worker" | "staff">("worker");
  const [workerOutstanding, setWorkerOutstanding] = useState(0);
  const [loadingOutstanding, setLoadingOutstanding] = useState(false);
  const [creatingAdvance, setCreatingAdvance] = useState(false);
  const [stats, setStats] = useState<Record<AdminTab, AdvanceSummary>>(emptyAdvanceSummaries);
  const [showMobileStats, setShowMobileStats] = useState(false);
  const [outstandingWorkers, setOutstandingWorkers] = useState<OutstandingWorkerSummary[]>([]);
  const [loadingOutstandingStats, setLoadingOutstandingStats] = useState(false);
  const [showOutstandingStats, setShowOutstandingStats] = useState(false);
  const [selectedOutstandingWorkerId, setSelectedOutstandingWorkerId] = useState<string | null>(null);

  const eligibleWorkers = useMemo(
    () =>
      workers.filter(
        (worker) =>
          worker.canReportAdvance &&
          worker.histories.some((history) => history.status === "working" && !history.leave_date),
      ),
    [workers],
  );
  const selectedWorker =
    eligibleWorkers.find((worker) => worker.user.id === selectedWorkerId) || null;
  const workerLimit = Number(settings.advance_limit || 0);
  const workerAvailable =
    workerLimit > 0 ? Math.max(0, workerLimit - workerOutstanding) : 0;

  const filteredWorkers = useMemo(() => {
    const keyword = removeVietnameseTone(workerSearch.trim().toLowerCase());
    if (!keyword) return eligibleWorkers;
    return eligibleWorkers.filter((worker) => {
      const active = getActiveWorkerHistory(worker);
      const haystack = removeVietnameseTone(
        [
          worker.user.full_name,
          worker.user.username,
          worker.user.employee_code,
          worker.user.phone,
          active?.employee_code,
          active?.expand?.factory?.name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
      );
      return haystack.includes(keyword);
    });
  }, [eligibleWorkers, workerSearch]);

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

  const loadOutstandingStats = useCallback(async () => {
    if (isAdmin || !isStaff || !user?.id) {
      setShowOutstandingStats(false);
      setSelectedOutstandingWorkerId(null);
      setOutstandingWorkers([]);
      return;
    }

    setLoadingOutstandingStats(true);
    try {
      setOutstandingWorkers(await loadStaffOutstandingWorkers(user.id));
    } finally {
      setLoadingOutstandingStats(false);
    }
  }, [isAdmin, isStaff, user?.id]);

  const loadStats = useCallback(async () => {
    const base = buildAdvanceFilter({
      isAdmin,
      isStaff,
      userId: user?.id,
    });
    const withBase = (f: string) => joinPbFilters([base, f]);
    const [pending, recruiter_approved, accepted, rejected, all] = await Promise.all([
      loadAdvanceSummary(withBase(ADVANCE_TAB_FILTERS.pending)),
      loadAdvanceSummary(withBase(ADVANCE_TAB_FILTERS.recruiter_approved)),
      loadAdvanceSummary(withBase(ADVANCE_TAB_FILTERS.accepted)),
      loadAdvanceSummary(withBase(ADVANCE_TAB_FILTERS.rejected)),
      loadAdvanceSummary(base),
    ]);
    setStats((s) => ({ ...s, pending, recruiter_approved, accepted, rejected, all }));
  }, [isAdmin, isStaff, user?.id]);

  useEffect(() => {
    load();
    loadStats().catch(() => {});
    loadOutstandingStats().catch((error: unknown) =>
      toast.error((error as { message?: string })?.message || "Không tải được thống kê tồn ứng"),
    );
  }, [load, loadStats, loadOutstandingStats]);

  const outstandingTotal = useMemo(
    () => outstandingWorkers.reduce((sum, worker) => sum + worker.total, 0),
    [outstandingWorkers],
  );
  const selectedOutstandingWorker = outstandingWorkers.find(
    (worker) => worker.workerId === selectedOutstandingWorkerId,
  ) || null;

  useEffect(() => {
    if (selectedOutstandingWorkerId && !selectedOutstandingWorker) {
      setSelectedOutstandingWorkerId(null);
    }
  }, [selectedOutstandingWorker, selectedOutstandingWorkerId]);

  useEffect(() => {
    if (!showCreateForm || !user?.id) return;
    setLoadingWorkers(true);
    fetchStaffWorkspace(user as UserRecord)
      .then((workspace) => setWorkers(workspace.workers))
      .catch((error: unknown) =>
        toast.error((error as { message?: string })?.message || "Không tải được danh sách NLĐ"),
      )
      .finally(() => setLoadingWorkers(false));
  }, [showCreateForm, user]);

  const cacheSignal = useStaffCacheSignal();
  useEffect(() => {
    if (!showCreateForm || !user?.id || cacheSignal === 0) return;
    const timer = setTimeout(async () => {
      const ws = await fetchCachedStaffWorkspace(user as UserRecord);
      if (ws) setWorkers(ws.workers);
    }, 150);
    return () => clearTimeout(timer);
  }, [cacheSignal, showCreateForm, user?.id]);

  useEffect(() => {
    if (!selectedWorkerId) {
      setWorkerOutstanding(0);
      return;
    }
    let active = true;
    setLoadingOutstanding(true);
    loadWorkerOutstanding(selectedWorkerId)
      .then((total) => {
        if (active) setWorkerOutstanding(total);
      })
      .catch(() => {
        if (active) setWorkerOutstanding(0);
      })
      .finally(() => {
        if (active) setLoadingOutstanding(false);
      });
    return () => {
      active = false;
    };
  }, [selectedWorkerId]);

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
      loadOutstandingStats().catch(() => {});
    } catch (error: unknown) {
      toast.error((error as any)?.message || "Lỗi xử lý");
    }
  };

  const withdrawAdvance = async () => {
    if (!withdrawTarget || !user?.id) return;
    setWithdrawing(true);
    try {
      await withdrawStaffAdvance(user, withdrawTarget);
      toast.success("Đã thu hồi yêu cầu ứng lương");
      setWithdrawTarget(null);
      setAdvanceDetail(null);
      await load();
      await loadStats();
      await loadOutstandingStats();
    } catch (error: unknown) {
      toast.error(getWithdrawErrorMessage(error));
      setWithdrawTarget(null);
      await load();
      await loadStats().catch(() => {});
      await loadOutstandingStats().catch(() => {});
    } finally {
      setWithdrawing(false);
    }
  };

  const resetCreateForm = () => {
    setSelectedWorkerId("");
    setWorkerSearch("");
    setWorkerAmountText("");
    setWorkerReason("");
    setBankChoice("worker");
    setWorkerOutstanding(0);
  };

  const createWorkerAdvance = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user?.id || !selectedWorkerId) {
      toast.error("Vui lòng chọn người lao động");
      return;
    }
    const amount = parseMoneyInput(workerAmountText);
    if (!amount) {
      toast.error("Số tiền ứng không được để trống");
      return;
    }
    if (!workerReason.trim()) {
      toast.error("Lý do ứng không được để trống");
      return;
    }

    setCreatingAdvance(true);
    try {
      const workspace = await fetchStaffWorkspace(user as UserRecord);
      const currentWorker = workspace.workers.find(
        (worker) => worker.user.id === selectedWorkerId,
      );
      const activeHistory = currentWorker ? getActiveWorkerHistory(currentWorker) : null;
      if (!currentWorker?.canReportAdvance || !activeHistory) {
        throw new Error("Bạn không còn quyền báo ứng hoặc NLĐ đã ngừng làm");
      }

      const bankSource = bankChoice === "staff" ? user : currentWorker.user;
      if (!bankSource.bank_account_number) {
        throw new Error(
          bankChoice === "staff"
            ? "Tài khoản ngân hàng của staff chưa có"
            : "Tài khoản ngân hàng của NLĐ chưa có",
        );
      }

      const outstanding = await loadWorkerOutstanding(currentWorker.user.id);
      const limit = Number(settings.advance_limit || 0);
      if (limit <= 0) throw new Error("Admin chưa cài hạn mức Ứng lương");
      if (outstanding + amount > limit) {
        throw new Error(
          `Vượt hạn mức ứng lương. Đã ứng chưa thu hồi ${formatMoney(outstanding)}đ, còn có thể ứng ${formatMoney(Math.max(0, limit - outstanding))}đ`,
        );
      }

      const payload = {
        user: currentWorker.user.id,
        requested_by: user.id,
        recruiter_id: user.id,
        employee_code: activeHistory.employee_code || currentWorker.user.employee_code || "",
        full_name:
          activeHistory.worker_name_snapshot || currentWorker.user.full_name || "",
        company: activeHistory.expand?.factory?.name || currentWorker.user.company || "",
        phone: currentWorker.user.phone || "",
        join_date: activeHistory.join_date || "",
        bank_name: bankSource.bank_name || "",
        bank_account_number: bankSource.bank_account_number || "",
        bank_account_name: bankSource.bank_account_name || "",
        amount,
        reason: workerReason.trim(),
        status: "recruiter_approved",
        recovery_status: "none",
      };
      const created = await pb.collection("advances").create(payload);
      await createStaffActionLog({
        actor: user,
        targetUserId: currentWorker.user.id,
        targetCollection: "advances",
        targetRecord: created.id,
        action: "report_advance",
        after: payload,
        note: "Staff tạo yêu cầu ứng lương thay người lao động từ màn duyệt ứng",
      });

      toast.success("Đã gửi yêu cầu ứng lương cho NLĐ");
      setShowCreateForm(false);
      resetCreateForm();
      setTab("recruiter_approved");
      await load();
      await loadStats();
      await loadOutstandingStats();
    } catch (error: unknown) {
      toast.error((error as { message?: string })?.message || "Không thể tạo yêu cầu ứng lương");
    } finally {
      setCreatingAdvance(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setShowMobileStats((current) => !current)}
        aria-expanded={showMobileStats}
        aria-controls="staff-advance-statistics"
        className="w-full text-right text-xs font-medium text-primary md:hidden"
      >
        {showMobileStats ? "Ẩn thống kê" : "Hiện thống kê"}
      </button>

      <div
        id="staff-advance-statistics"
        className={showMobileStats ? "grid grid-cols-2 gap-2" : "hidden grid-cols-2 gap-2 md:grid"}
      >
        <StatCard label="Chờ duyệt" value={statValue(stats.pending)} icon={Clock} tone="warning" />
        <StatCard label="Đã chuyển admin" value={statValue(stats.recruiter_approved)} icon={Check} tone="primary" />
        <StatCard label="Đã duyệt" value={statValue(stats.accepted)} icon={Check} tone="success" />
        <StatCard label="Từ chối" value={statValue(stats.rejected)} icon={X} tone="danger" />
        {isStaff && !isAdmin && (
          <button
            type="button"
            className="col-span-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          onClick={() => setShowOutstandingStats(true)}
          aria-label="Xem NLĐ tồn ứng chưa thu"
        >
          <StatCard
            label="NLĐ tồn ứng chưa thu"
            value={
              <span className="block text-[15px] leading-tight sm:text-base">
                {loadingOutstandingStats
                  ? "Đang tải..."
                  : `${outstandingWorkers.length} NLĐ - ${formatMoney(outstandingTotal)}đ`}
              </span>
            }
            hint="Bấm để xem danh sách và chi tiết từng lần ứng"
            icon={CircleDollarSign}
            tone="warning"
            className="h-full transition hover:border-primary/50 hover:shadow-soft"
          />
          </button>
        )}
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        placeholder="Tìm theo tên, mã NV…"
        chips={[
          { key: "pending", label: `Chờ duyệt (${stats.pending.count})` },
          { key: "recruiter_approved", label: `Đã chuyển admin (${stats.recruiter_approved.count})` },
          { key: "accepted", label: `Đã duyệt (${stats.accepted.count})` },
          { key: "rejected", label: `Từ chối (${stats.rejected.count})` },
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
                  {status === "recruiter_approved" && row.recruiter_id === user?.id && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 px-2 text-amber-700"
                      onClick={(event) => {
                        event.stopPropagation();
                        setWithdrawTarget(row);
                      }}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Thu hồi
                    </Button>
                  )}
                </div>
              </div>
              <p className="mt-1 truncate text-[12px] text-muted-foreground">{row.reason}</p>
            </div>
          );
        })
      )}

      {isStaff && !isAdmin && (
        <>
          <OutstandingWorkersDialog
            open={showOutstandingStats}
            workers={outstandingWorkers}
            totalAmount={outstandingTotal}
            onClose={() => {
              setShowOutstandingStats(false);
              setSelectedOutstandingWorkerId(null);
            }}
            onSelectWorker={(workerId) => setSelectedOutstandingWorkerId(workerId)}
          />
          <OutstandingWorkerDetailDialog
            worker={selectedOutstandingWorker}
            onClose={() => setSelectedOutstandingWorkerId(null)}
          />
        </>
      )}
      <AdvanceQuickDetail
        detail={advanceDetail}
        onClose={() => setAdvanceDetail(null)}
        canWithdraw={
          advanceDetail?.status === "recruiter_approved" &&
          advanceDetail.recruiter_id === user?.id
        }
        onWithdraw={(advance) => {
          setAdvanceDetail(null);
          setWithdrawTarget(advance);
        }}
      />
      <WithdrawAdvanceDialog
        advance={withdrawTarget}
        withdrawing={withdrawing}
        onClose={() => !withdrawing && setWithdrawTarget(null)}
        onConfirm={withdrawAdvance}
      />
      <Button
        className="fixed bottom-20 right-4 z-30 h-12 w-12 rounded-full shadow-lg"
        onClick={() => setShowCreateForm(true)}
        aria-label="Tạo ứng lương cho NLĐ"
        title="Tạo ứng lương cho NLĐ"
      >
        <Plus className="h-5 w-5" />
      </Button>
      <WorkerAdvanceCreateDialog
        open={showCreateForm}
        onOpenChange={(open) => {
          if (creatingAdvance) return;
          setShowCreateForm(open);
          if (!open) resetCreateForm();
        }}
        workers={filteredWorkers}
        loadingWorkers={loadingWorkers}
        search={workerSearch}
        setSearch={setWorkerSearch}
        selectedWorker={selectedWorker}
        selectWorker={(workerId) => {
          setSelectedWorkerId(workerId);
          setWorkerSearch("");
          setBankChoice("worker");
        }}
        bankChoice={bankChoice}
        setBankChoice={setBankChoice}
        amountText={workerAmountText}
        setAmountText={setWorkerAmountText}
        reason={workerReason}
        setReason={setWorkerReason}
        limit={workerLimit}
        outstanding={workerOutstanding}
        available={workerAvailable}
        loadingOutstanding={loadingOutstanding}
        submitting={creatingAdvance}
        onSubmit={createWorkerAdvance}
      />
    </>
  );
}

function OutstandingWorkersDialog({
  open,
  workers,
  totalAmount,
  onClose,
  onSelectWorker,
}: {
  open: boolean;
  workers: OutstandingWorkerSummary[];
  totalAmount: number;
  onClose: () => void;
  onSelectWorker: (workerId: string) => void;
}) {
  const totalAdvances = workers.reduce((sum, worker) => sum + worker.count, 0);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex max-h-[88dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b border-border/60 p-5 pr-14 text-left">
          <DialogTitle>NLĐ đang tồn ứng chưa thu</DialogTitle>
          <DialogDescription>Danh sách được sắp xếp từ số tiền tồn ứng nhiều đến ít.</DialogDescription>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-muted/50 p-2">
              <div className="text-lg font-semibold">{workers.length}</div>
              <div className="text-[11px] text-muted-foreground">NLĐ</div>
            </div>
            <div className="rounded-xl bg-muted/50 p-2">
              <div className="text-lg font-semibold">{totalAdvances}</div>
              <div className="text-[11px] text-muted-foreground">Lần ứng</div>
            </div>
            <div className="rounded-xl bg-warning/10 p-2 text-warning-foreground">
              <div className="text-lg font-semibold">{formatMoney(totalAmount)}đ</div>
              <div className="text-[11px]">Tổng tiền</div>
            </div>
          </div>
        </DialogHeader>
        <div className="min-h-0 space-y-2 overflow-y-auto p-5">
          {workers.length === 0 ? (
            <EmptyState
              icon={CircleDollarSign}
              title="Không có NLĐ tồn ứng"
              description="Hiện chưa có khoản ứng nào đang chờ thu hồi."
            />
          ) : (
            workers.map((worker, index) => (
              <div key={worker.workerId} className="rounded-2xl border border-border/60 bg-card p-3 shadow-soft">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{index + 1}. {worker.fullName}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {worker.employeeCode || "Chưa có mã NV"} · {worker.company || "Chưa có nhà máy"}
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">{worker.count} lần ứng chưa thu</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectWorker(worker.workerId)}
                    className="flex shrink-0 items-center gap-1 rounded-xl border border-primary/30 bg-primary/5 px-2.5 py-2 text-right text-primary transition hover:bg-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={`Xem chi tiết tồn ứng của ${worker.fullName}`}
                  >
                    <span>
                      <span className="block text-sm font-bold">{formatMoney(worker.total)}đ</span>
                      <span className="block text-[10px] font-medium">Xem chi tiết</span>
                    </span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OutstandingWorkerDetailDialog({
  worker,
  onClose,
}: {
  worker: OutstandingWorkerSummary | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!worker} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex max-h-[88dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b border-border/60 p-5 pr-14 text-left">
          <DialogTitle>Chi tiết tồn ứng – {worker?.fullName || "NLĐ"}</DialogTitle>
          <DialogDescription>
            {worker?.employeeCode || "Chưa có mã NV"} · {worker?.company || "Chưa có nhà máy"}
          </DialogDescription>
          {worker && (
            <div className="mt-3 rounded-xl bg-warning/10 p-3 text-sm text-warning-foreground">
              <span className="font-semibold">{worker.count} lần ứng</span> · Tổng cộng {formatMoney(worker.total)}đ chưa thu
            </div>
          )}
        </DialogHeader>
        <div className="min-h-0 space-y-2 overflow-y-auto p-5">
          {worker?.advances.map((advance, index) => {
            const meta = outstandingStatusMeta(advance);
            const notes = [
              advance.recruiter_note && `Ghi chú người tuyển: ${advance.recruiter_note}`,
              advance.admin_note && `Ghi chú admin: ${advance.admin_note}`,
              advance.recovery_note && `Ghi chú thu hồi: ${advance.recovery_note}`,
            ].filter(Boolean);
            return (
              <div key={advance.id} className={cn("rounded-2xl border bg-card p-3", toneBorder[meta.tone])}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">Lần ứng #{worker.advances.length - index}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {advance.created ? new Date(advance.created).toLocaleString("vi-VN") : "Chưa có thời gian"}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-base font-bold text-primary">{formatMoney(advance.amount)}đ</div>
                    <StatusChip tone={meta.tone}>{meta.label}</StatusChip>
                  </div>
                </div>
                <div className="mt-2 space-y-1 text-[12px]">
                  <div><span className="font-semibold">Lý do:</span> {advance.reason || "Không có lý do"}</div>
                  <div className="text-muted-foreground"><span className="font-semibold">Người yêu cầu:</span> {getOutstandingRequesterName(advance)}</div>
                  {notes.map((note) => <div key={note} className="rounded-lg bg-muted/60 p-2 text-muted-foreground">{note}</div>)}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// PLACEHOLDER_MY_ADVANCES

function MyAdvancesView() {
  const { user } = useAuth();
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
  const [withdrawTarget, setWithdrawTarget] = useState<AdvanceRecord | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [showMobileStats, setShowMobileStats] = useState(false);

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

  useEffect(() => { load(); }, [load]);

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
    } catch (error: unknown) {
      toast.error((error as any)?.message || "Lỗi gửi ứng lương");
    } finally {
      setSending(false);
    }
  };

  const withdrawAdvance = async () => {
    if (!withdrawTarget || !user?.id) return;
    setWithdrawing(true);
    try {
      await withdrawStaffAdvance(user, withdrawTarget);
      toast.success("Đã thu hồi yêu cầu ứng lương");
      setWithdrawTarget(null);
      await load();
    } catch (error: unknown) {
      toast.error(getWithdrawErrorMessage(error));
      setWithdrawTarget(null);
      await load();
    } finally {
      setWithdrawing(false);
    }
  };

  const myStats = useMemo(() => {
    const result = emptyAdvanceSummaries();
    for (const row of items) {
      const status = (row.status || "recruiter_approved") as AdminTab;
      const amount = Number(row.amount || 0);
      if (result[status]) {
        result[status].count += 1;
        result[status].total += amount;
      }
      result.all.count += 1;
      result.all.total += amount;
    }
    return result;
  }, [items]);

  return (
    <>
      <button
        type="button"
        onClick={() => setShowMobileStats((current) => !current)}
        aria-expanded={showMobileStats}
        aria-controls="staff-own-advance-statistics"
        className="w-full text-right text-xs font-medium text-primary md:hidden"
      >
        {showMobileStats ? "Ẩn thống kê" : "Hiện thống kê"}
      </button>

      <div
        id="staff-own-advance-statistics"
        className={showMobileStats ? "grid grid-cols-2 gap-2" : "hidden grid-cols-2 gap-2 md:grid"}
      >
        <StatCard label="Chờ admin duyệt" value={statValue(myStats.recruiter_approved)} icon={Clock} tone="warning" />
        <StatCard label="Đã tiếp nhận" value={statValue(myStats.accepted)} icon={Check} tone="success" />
        <StatCard label="Từ chối" value={statValue(myStats.rejected)} icon={X} tone="danger" />
        <StatCard
          label="Tổng đơn"
          value={statValue(myStats.all)}
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
                <div className="flex flex-col items-end gap-1">
                  <StatusChip tone={STATUS_META[status].tone as any}>
                    {STATUS_META[status].label}
                  </StatusChip>
                  {status === "recruiter_approved" && row.requested_by === user?.id && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 px-2 text-amber-700"
                      onClick={() => setWithdrawTarget(row)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Thu hồi
                    </Button>
                  )}
                </div>
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
      />
      <WithdrawAdvanceDialog
        advance={withdrawTarget}
        withdrawing={withdrawing}
        onClose={() => !withdrawing && setWithdrawTarget(null)}
        onConfirm={withdrawAdvance}
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
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Xin ứng lương</DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
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
  canWithdraw = false,
  onWithdraw,
}: {
  detail: AdvanceRecord | null;
  onClose: () => void;
  canWithdraw?: boolean;
  onWithdraw?: (advance: AdvanceRecord) => void;
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
          {canWithdraw && onWithdraw && (
            <Button
              type="button"
              variant="destructive"
              className="w-full"
              onClick={() => onWithdraw(detail)}
            >
              <RotateCcw className="h-4 w-4" />
              Thu hồi yêu cầu
            </Button>
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

function WorkerAdvanceCreateDialog({
  open,
  onOpenChange,
  workers,
  loadingWorkers,
  search,
  setSearch,
  selectedWorker,
  selectWorker,
  bankChoice,
  setBankChoice,
  amountText,
  setAmountText,
  reason,
  setReason,
  limit,
  outstanding,
  available,
  loadingOutstanding,
  submitting,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workers: StaffWorkerRecord[];
  loadingWorkers: boolean;
  search: string;
  setSearch: (value: string) => void;
  selectedWorker: StaffWorkerRecord | null;
  selectWorker: (workerId: string) => void;
  bankChoice: "worker" | "staff";
  setBankChoice: (value: "worker" | "staff") => void;
  amountText: string;
  setAmountText: (value: string) => void;
  reason: string;
  setReason: (value: string) => void;
  limit: number;
  outstanding: number;
  available: number;
  loadingOutstanding: boolean;
  submitting: boolean;
  onSubmit: (event: React.FormEvent) => void;
}) {
  const activeHistory = selectedWorker ? getActiveWorkerHistory(selectedWorker) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tạo ứng lương cho NLĐ</DialogTitle>
          <DialogDescription>
            Chọn người lao động đang làm và gửi yêu cầu trực tiếp tới admin.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-2">
            <Label>Người lao động *</Label>
            {selectedWorker ? (
              <div className="rounded-xl border bg-muted/30 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">
                      {selectedWorker.user.full_name || selectedWorker.user.username || "NLĐ"}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {[activeHistory?.employee_code, activeHistory?.expand?.factory?.name]
                        .filter(Boolean)
                        .join(" · ") || "Chưa có thông tin nhà máy"}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => selectWorker("")}
                  >
                    Đổi NLĐ
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Tìm tên, mã NV, nhà máy, SĐT..."
                    className="rounded-xl pl-9"
                  />
                </div>
                <div className="max-h-52 space-y-1 overflow-y-auto rounded-xl border p-1.5">
                  {loadingWorkers ? (
                    <div className="py-6 text-center text-xs text-muted-foreground">
                      Đang tải danh sách NLĐ...
                    </div>
                  ) : workers.length === 0 ? (
                    <div className="py-6 text-center text-xs text-muted-foreground">
                      Không tìm thấy NLĐ đang làm mà bạn có quyền báo ứng.
                    </div>
                  ) : (
                    workers.map((worker) => {
                      const history = getActiveWorkerHistory(worker);
                      return (
                        <button
                          key={worker.user.id}
                          type="button"
                          onClick={() => selectWorker(worker.user.id)}
                          className="w-full rounded-lg px-2.5 py-2 text-left transition hover:bg-muted"
                        >
                          <div className="truncate text-sm font-medium">
                            {worker.user.full_name || worker.user.username || "NLĐ"}
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {[history?.employee_code, history?.expand?.factory?.name, worker.user.phone]
                              .filter(Boolean)
                              .join(" · ") || "Chưa có thông tin"}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>

          {selectedWorker && (
            <>
              <div className="grid grid-cols-3 gap-1.5">
                <DetailCell
                  label="Hạn mức"
                  value={limit > 0 ? `${formatMoney(limit)}đ` : "Chưa cài"}
                />
                <DetailCell
                  label="Chưa thu hồi"
                  value={loadingOutstanding ? "Đang tải..." : `${formatMoney(outstanding)}đ`}
                />
                <DetailCell
                  label="Còn có thể ứng"
                  value={limit > 0 ? `${formatMoney(available)}đ` : "—"}
                />
              </div>

              <div className="space-y-2">
                <Label>Tài khoản nhận tiền *</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setBankChoice("worker")}
                    className={cn(
                      "rounded-xl border p-2.5 text-left",
                      bankChoice === "worker"
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card",
                    )}
                  >
                    <div className="text-xs font-semibold">Tài khoản NLĐ</div>
                    <div className="mt-1 truncate text-[11px] text-muted-foreground">
                      {selectedWorker.user.bank_account_number
                        ? `${selectedWorker.user.bank_name || "NH"} · ${selectedWorker.user.bank_account_number}`
                        : "Chưa có tài khoản"}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBankChoice("staff")}
                    className={cn(
                      "rounded-xl border p-2.5 text-left",
                      bankChoice === "staff"
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card",
                    )}
                  >
                    <div className="flex items-center gap-1 text-xs font-semibold">
                      <Landmark className="h-3.5 w-3.5" />
                      Tài khoản staff
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      Dùng tài khoản ngân hàng của bạn
                    </div>
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Số tiền ứng *</Label>
                <Input
                  value={amountText}
                  onChange={(event) => setAmountText(formatMoneyInput(event.target.value))}
                  inputMode="numeric"
                  placeholder="Nhập số tiền ứng"
                  className="rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Lý do ứng *</Label>
                <Textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Nhập lý do ứng lương"
                  className="min-h-20 rounded-xl"
                />
              </div>

              <Button type="submit" className="w-full rounded-xl" disabled={submitting}>
                <Send className="h-4 w-4" />
                {submitting ? "Đang gửi..." : "Gửi yêu cầu tới admin"}
              </Button>
            </>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}

function getActiveWorkerHistory(worker: StaffWorkerRecord) {
  return (
    worker.histories.find((history) => history.status === "working" && !history.leave_date) || null
  );
}

async function loadWorkerOutstanding(workerId: string) {
  const rows = await pb.collection("advances").getFullList<Pick<AdvanceRecord, "amount">>({
    filter: `user="${workerId}" && (status="pending" || status="recruiter_approved" || (status="accepted" && (recovery_status="" || recovery_status="none")))`,
    fields: "amount",
  });
  return rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
}

function removeVietnameseTone(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

async function withdrawStaffAdvance(user: UserRecord, advance: AdvanceRecord) {
  const current = (await pb.collection("advances").getOne(advance.id)) as unknown as AdvanceRecord;
  const ownedByStaff = current.requested_by === user.id || current.recruiter_id === user.id;

  if (current.status !== "recruiter_approved" || !ownedByStaff) {
    throw new Error("ADVANCE_NOT_WITHDRAWABLE");
  }

  await createStaffActionLog({
    actor: user,
    targetUserId: current.user,
    targetCollection: "advances",
    targetRecord: current.id,
    action: "delete",
    before: current,
    note: "Staff thu hồi yêu cầu ứng lương trước khi admin phê duyệt",
  });
  await pb.collection("advances").delete(current.id);
}

function getWithdrawErrorMessage(error: unknown) {
  if (error instanceof Error && error.message === "ADVANCE_NOT_WITHDRAWABLE") {
    return "Admin đã xử lý hoặc bạn không còn quyền thu hồi đơn này";
  }
  const status = (error as { status?: number })?.status;
  if (status === 404 || status === 403) {
    return "Admin đã xử lý hoặc đơn không còn khả dụng";
  }
  return (error as { message?: string })?.message || "Không thể thu hồi yêu cầu ứng lương";
}

function WithdrawAdvanceDialog({
  advance,
  withdrawing,
  onClose,
  onConfirm,
}: {
  advance: AdvanceRecord | null;
  withdrawing: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={!!advance} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="rounded-2xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Thu hồi yêu cầu ứng lương?</DialogTitle>
          <DialogDescription>
            Yêu cầu sẽ không còn hiển thị cho admin và không thể khôi phục.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-950">
          <div className="text-sm font-semibold">{advance?.full_name || "Staff"}</div>
          <div className="mt-1 text-xl font-bold">{formatMoney(Number(advance?.amount || 0))}đ</div>
          <div className="mt-1 text-xs text-amber-800">
            Lịch sử thao tác vẫn được lưu để đối soát.
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={withdrawing} onClick={onClose}>
            Giữ yêu cầu
          </Button>
          <Button type="button" variant="destructive" disabled={withdrawing} onClick={onConfirm}>
            <RotateCcw className="h-4 w-4" />
            {withdrawing ? "Đang thu hồi…" : "Xác nhận thu hồi"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
