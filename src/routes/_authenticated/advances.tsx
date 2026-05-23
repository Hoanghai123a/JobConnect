import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { pb } from "@/lib/pocketbase";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { exportToExcel } from "@/lib/excel";
import { formatMoneyInput, parseMoneyInput } from "@/lib/money";
import { toast } from "sonner";
import {
  Banknote,
  Check,
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

type AdvanceStatus = "pending" | "accepted" | "rejected";
type RecoveryStatus = "none" | "recovered" | "unrecoverable";

type AdvanceRecord = {
  id: string;
  user?: string;
  employee_code: string;
  full_name: string;
  company: string;
  phone: string;
  amount: number;
  reason: string;
  status?: AdvanceStatus;
  recovery_status?: RecoveryStatus;
  admin_note?: string;
  recovery_note?: string;
  resolved_at?: string;
  recovered_at?: string;
  created: string;
};

const STATUS_META: Record<
  AdvanceStatus,
  { label: string; tone: "warning" | "success" | "danger" }
> = {
  pending: { label: "Chờ duyệt", tone: "warning" },
  accepted: { label: "Đã tiếp nhận", tone: "success" },
  rejected: { label: "Đã từ chối", tone: "danger" },
};

const RECOVERY_META: Record<
  RecoveryStatus,
  { label: string; tone: "neutral" | "success" | "danger" }
> = {
  none: { label: "Chờ thu hồi", tone: "neutral" },
  recovered: { label: "Đã thu hồi", tone: "success" },
  unrecoverable: { label: "Không thể thu hồi", tone: "danger" },
};

export function AdvancesPage() {
  const { user, isAdmin } = useAuth();
  const { data: settings } = useAppSettings();

  const [items, setItems] = useState<AdvanceRecord[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"pending" | "accepted" | "rejected" | "all">("pending");
  const [showProfile, setShowProfile] = useState(false);
  const [sending, setSending] = useState(false);
  const [amountText, setAmountText] = useState("");
  const [reason, setReason] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const filter = isAdmin ? "" : `user="${user?.id || ""}"`;
      const res = await pb.collection("advances").getFullList({
        filter,
        sort: "-created",
      });
      setItems(res as unknown as AdvanceRecord[]);
    } catch (error: any) {
      toast.error(error?.message || "Lỗi tải Ứng lương");
    } finally {
      setLoading(false);
    }
  }, [isAdmin, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const limit = Number(settings.advance_limit || 0);
  const outstanding = useMemo(() => {
    return items.reduce((sum, row) => {
      const status = row.status || "pending";
      const recovery = row.recovery_status || "none";
      if (status === "pending") return sum + Number(row.amount || 0);
      if (status === "accepted" && recovery === "none") return sum + Number(row.amount || 0);
      return sum;
    }, 0);
  }, [items]);
  const available = limit > 0 ? Math.max(0, limit - outstanding) : 0;

  const filtered = useMemo(() => {
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;
    return items.filter((row) => {
      const status = row.status || "pending";
      if (tab !== "all" && status !== tab) return false;
      const createdAt = new Date(row.created).getTime();
      if (from && createdAt < from) return false;
      if (to && createdAt > to) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        row.full_name?.toLowerCase().includes(q) ||
        row.employee_code?.toLowerCase().includes(q) ||
        row.company?.toLowerCase().includes(q) ||
        row.phone?.toLowerCase().includes(q) ||
        row.reason?.toLowerCase().includes(q) ||
        String(row.amount || 0).includes(q)
      );
    });
  }, [items, search, tab, dateFrom, dateTo]);
  const selectableFiltered = useMemo(
    () => filtered.filter((row) => (row.status || "pending") === "pending"),
    [filtered],
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseMoneyInput(amountText);
    if (!amount) {
      toast.error("Số tiền xin ứng không được để trống");
      return;
    }
    if (!reason.trim()) {
      toast.error("Lý do ứng không được để trống");
      return;
    }
    if (limit <= 0) {
      toast.error("Admin chưa cài hạn mức Ứng lương");
      return;
    }
    if (outstanding + amount > limit) {
      toast.error("Vượt hạn mức Ứng lương đang cài đặt");
      return;
    }

    setSending(true);
    try {
      await pb.collection("advances").create({
        user: user?.id,
        employee_code: user?.employee_code || "",
        full_name: user?.full_name || "",
        company: user?.company || "",
        phone: user?.phone || "",
        amount,
        reason: reason.trim(),
        status: "pending",
        recovery_status: "none",
      });
      toast.success("Đã gửi Ứng lương");
      setAmountText("");
      setReason("");
      load();
    } catch (error: any) {
      toast.error(error?.message || "Lỗi gửi Ứng lương");
    } finally {
      setSending(false);
    }
  };

  const updateRow = async (id: string, payload: Partial<AdvanceRecord>) => {
    await pb.collection("advances").update(id, payload);
  };

  const bulkUpdate = async (status: Exclude<AdvanceStatus, "pending">) => {
    const rows = filtered.filter(
      (row) => selectedIds.has(row.id) && (row.status || "pending") === "pending",
    );
    if (!rows.length) return;
    try {
      for (const row of rows) {
        await updateRow(row.id, {
          status,
          resolved_at: new Date().toISOString(),
          admin_note: row.admin_note || "",
        });
      }
      toast.success(status === "accepted" ? "Đã duyệt" : "Đã từ chối");
      setSelectedIds(new Set());
      load();
    } catch (error: any) {
      toast.error(error?.message || "Lỗi xử lý hàng loạt");
    }
  };

  const resolveRecovery = async (
    row: AdvanceRecord,
    recoveryStatus: Exclude<RecoveryStatus, "none">,
  ) => {
    try {
      await updateRow(row.id, {
        recovery_status: recoveryStatus,
        recovered_at: recoveryStatus === "recovered" ? new Date().toISOString() : "",
      });
      toast.success(
        recoveryStatus === "recovered" ? "Đã đánh dấu thu hồi" : "Đã đánh dấu không thể thu hồi",
      );
      load();
    } catch (error: any) {
      toast.error(error?.message || "Lỗi");
    }
  };

  const exportCurrent = () => {
    const rows = filtered.map((row) => ({
      "Họ tên": row.full_name,
      "Mã NV": row.employee_code,
      "Nhà máy": row.company,
      SĐT: row.phone,
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

  const stats = useMemo(
    () => ({
      pending: items.filter((row) => (row.status || "pending") === "pending").length,
      accepted: items.filter((row) => row.status === "accepted").length,
      rejected: items.filter((row) => row.status === "rejected").length,
      recovered: items.filter((row) => row.recovery_status === "recovered").length,
    }),
    [items],
  );

  if (!isAdmin) {
    return (
      <PageContainer title="Ứng lương" subtitle="Xin ứng lương & xem lịch sử">
        <AdvanceRulesCard rules={settings.advance_rules} />
        <form onSubmit={submit} className="space-y-3">
          <div className="card-soft space-y-3 rounded-2xl border bg-card p-4">
            <button
              type="button"
              onClick={() => setShowProfile((v) => !v)}
              className="flex w-full items-center justify-between rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm font-medium"
            >
              <span>Thông tin cá nhân</span>
              <span className="text-xs text-muted-foreground">
                {showProfile ? "Thu gọn" : "Xem"}
              </span>
            </button>
            {showProfile && (
              <div className="space-y-3">
                <ReadOnlyField label="Mã NV" value={user?.employee_code} />
                <ReadOnlyField label="Họ và tên" value={user?.full_name} />
                <ReadOnlyField label="Nhà máy đang làm" value={user?.company} />
                <ReadOnlyField label="Số điện thoại liên hệ" value={user?.phone} />
              </div>
            )}

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
                toneBorder[
                  (row.status === "accepted"
                    ? "success"
                    : row.status === "rejected"
                      ? "danger"
                      : "warning") as any
                ],
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
                  tone={
                    (row.status === "accepted"
                      ? "success"
                      : row.status === "rejected"
                        ? "danger"
                        : "warning") as any
                  }
                >
                  {STATUS_META[(row.status || "pending") as AdvanceStatus].label}
                </StatusChip>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed">{row.reason}</p>
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
        <StatCard label="Chờ duyệt" value={stats.pending} icon={Clock} tone="warning" />
        <StatCard label="Đã tiếp nhận" value={stats.accepted} icon={Check} tone="success" />
        <StatCard label="Từ chối" value={stats.rejected} icon={X} tone="danger" />
        <StatCard label="Đã thu hồi" value={stats.recovered} icon={ShieldCheck} tone="primary" />
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        placeholder="Tìm theo tên, mã NV, số tiền…"
        chips={[
          { key: "pending", label: `Chờ (${stats.pending})` },
          { key: "accepted", label: `Tiếp nhận (${stats.accepted})` },
          { key: "rejected", label: `Từ chối (${stats.rejected})` },
          { key: "all", label: "Tất cả" },
        ]}
        activeChip={tab}
        onChipChange={(v) => setTab(v as any)}
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

      {selectedIds.size > 0 && (
        <div className="sticky top-[var(--header-h,3.25rem)] z-20 -mx-4 flex items-center justify-between gap-2 bg-primary/10 px-4 py-2 backdrop-blur">
          <span className="text-xs font-medium text-primary">{selectedIds.size} đã chọn</span>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => bulkUpdate("accepted")}>
              <Check className="h-3.5 w-3.5" /> Duyệt
            </Button>
            <Button size="sm" variant="destructive" onClick={() => bulkUpdate("rejected")}>
              <X className="h-3.5 w-3.5" /> Từ chối
            </Button>
          </div>
        </div>
      )}

      <label className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
        <Checkbox
          checked={selectableFiltered.length > 0 && selectedIds.size === selectableFiltered.length}
          onCheckedChange={(checked) =>
            setSelectedIds(checked ? new Set(selectableFiltered.map((row) => row.id)) : new Set())
          }
        />
        Chọn tất cả ({selectableFiltered.length})
      </label>

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
          const selectable = status === "pending";
          const canRecover = status === "accepted" && recovery === "none";
          return (
            <div
              key={row.id}
              className={cn(
                "list-card flex items-start gap-3",
                toneBorder[STATUS_META[status].tone],
                !selectable && "opacity-95",
              )}
            >
              <Checkbox
                checked={selectedIds.has(row.id)}
                onCheckedChange={() =>
                  setSelectedIds((current) => {
                    const next = new Set(current);
                    next.has(row.id) ? next.delete(row.id) : next.add(row.id);
                    return next;
                  })
                }
                disabled={!selectable}
                className="mt-1"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{row.full_name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {row.employee_code} · {row.company}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-sm font-semibold">
                    {formatMoney(row.amount)}
                  </div>
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <StatusChip tone={STATUS_META[status].tone}>
                    {STATUS_META[status].label}
                  </StatusChip>
                  <StatusChip tone={RECOVERY_META[recovery].tone as any}>
                    {RECOVERY_META[recovery].label}
                  </StatusChip>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed">{row.reason}</p>
                <div className="mt-2 text-[11px] text-muted-foreground">
                  SĐT: {row.phone} · {new Date(row.created).toLocaleString("vi-VN")}
                </div>
                {(row.admin_note || row.recovery_note) && (
                  <div className="mt-2 space-y-1 rounded-lg bg-muted/60 p-2 text-[12px]">
                    {row.admin_note && <div>Admin: {row.admin_note}</div>}
                    {row.recovery_note && <div>Thu hồi: {row.recovery_note}</div>}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1">
                {status === "pending" && (
                  <>
                    <Button
                      size="sm"
                      onClick={() =>
                        updateRow(row.id, {
                          status: "accepted",
                          resolved_at: new Date().toISOString(),
                        }).then(load)
                      }
                    >
                      <Check className="h-3.5 w-3.5" /> Tiếp nhận
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        updateRow(row.id, {
                          status: "rejected",
                          resolved_at: new Date().toISOString(),
                        }).then(load)
                      }
                    >
                      <X className="h-3.5 w-3.5" /> Từ chối
                    </Button>
                  </>
                )}
                {canRecover && (
                  <>
                    <Button size="sm" onClick={() => resolveRecovery(row, "recovered")}>
                      <ShieldCheck className="h-3.5 w-3.5" /> Thu hồi
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resolveRecovery(row, "unrecoverable")}
                    >
                      Không thu hồi
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })
      )}
    </PageContainer>
  );
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
