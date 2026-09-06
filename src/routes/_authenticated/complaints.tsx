import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { pb } from "@/lib/pocketbase";
import { useAuth } from "@/lib/auth";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import { PageContainer } from "@/components/layout/PageContainer";
import { FilterBar } from "@/components/ui/filter-bar";
import { StatusChip, toneBorder, ChipTone } from "@/components/ui/status-chip";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { DataLoadingState } from "@/components/ui/data-loading-state";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { exportToExcel, formatDateOnly } from "@/lib/excel";
import { escapePb } from "@/lib/delegations";
import { findActiveEmploymentByUser, type EmploymentHistoryRecord } from "@/lib/employment";
import { toast } from "@/lib/toast";
import {
  Phone,
  Send,
  FileDown,
  MessageSquareWarning,
  Check,
  X,
  History,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/complaints")({
  component: ComplaintsPage,
});

type Status = "pending" | "accepted" | "rejected";

interface Complaint {
  id: string;
  employee_code?: string;
  full_name: string;
  company: string;
  phone: string;
  content: string;
  status?: Status;
  admin_note?: string;
  resolved_at?: string;
  created: string;
}

const STATUS_META: Record<Status, { label: string; tone: ChipTone }> = {
  pending: { label: "Chờ xử lý", tone: "warning" },
  accepted: { label: "Đã tiếp nhận", tone: "success" },
  rejected: { label: "Đã từ chối", tone: "danger" },
};

type ComplaintTab = Status | "all";

function joinPbFilters(parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" && ");
}

function buildComplaintFilter(input: {
  isAdmin: boolean;
  phone?: string;
  tab: ComplaintTab;
  search: string;
}) {
  const q = escapePb(input.search.trim());
  const searchFilter = q
    ? `(${["full_name", "employee_code", "company", "phone", "content", "admin_note"]
        .map((field) => `${field}~"${q}"`)
        .join(" || ")})`
    : "";
  return joinPbFilters([
    input.isAdmin ? "" : `phone="${escapePb(input.phone || "")}"`,
    input.tab === "all" ? "" : `status="${input.tab}"`,
    searchFilter,
  ]);
}

async function countComplaints(filter: string) {
  const res = await pb.collection("complaints").getList(1, 1, { filter, fields: "id" });
  return res.totalItems || 0;
}

function ComplaintsPage() {
  const { user, isAdmin } = useAuth();
  const [items, setItems] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedSearch(search);
  const [tab, setTab] = useState<ComplaintTab>("pending");
  const [stats, setStats] = useState<Record<Status, number>>({
    pending: 0,
    accepted: 0,
    rejected: 0,
  });
  const [resolving, setResolving] = useState<{ row: Complaint; status: Status } | null>(null);
  const [note, setNote] = useState("");
  const [form, setForm] = useState({
    full_name: user?.full_name || "",
    phone: user?.phone || "",
    content: "",
  });
  const [sending, setSending] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [currentEmployment, setCurrentEmployment] = useState<EmploymentHistoryRecord | null>(null);
  const [expandedComplaintId, setExpandedComplaintId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const filter = buildComplaintFilter({
        isAdmin,
        phone: user?.phone,
        tab,
        search: debouncedSearch,
      });
      const res = await pb.collection("complaints").getList(1, 200, {
        filter,
        sort: "-created",
      });
      setItems(res.items as any);
    } catch (e: any) {
      toast.error(e?.message || "Lỗi tải khiếu nại");
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    const base = buildComplaintFilter({
      isAdmin,
      phone: user?.phone,
      tab: "all",
      search: debouncedSearch,
    });
    const [pending, accepted, rejected] = await Promise.all([
      countComplaints(joinPbFilters([base, 'status="pending"'])),
      countComplaints(joinPbFilters([base, 'status="accepted"'])),
      countComplaints(joinPbFilters([base, 'status="rejected"'])),
    ]);
    setStats({ pending, accepted, rejected });
  };

  useEffect(() => {
    load();
    loadStats().catch(() => {});
    /* eslint-disable-next-line */
  }, [debouncedSearch, isAdmin, user?.phone, tab]);

  useEffect(() => {
    if (!user?.id) {
      setCurrentEmployment(null);
      return;
    }
    let active = true;
    findActiveEmploymentByUser(user.id)
      .then((history) => active && setCurrentEmployment(history))
      .catch(() => active && setCurrentEmployment(null));
    return () => {
      active = false;
    };
  }, [user?.id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      const employment = user?.id ? await findActiveEmploymentByUser(user.id) : null;
      await pb.collection("complaints").create({
        full_name: user?.full_name || "",
        employee_code: employment?.employee_code || "",
        company: employment?.expand?.factory?.name || "",
        phone: user?.phone || "",
        content: form.content,
        status: "pending",
      });
      toast.success("Đã gửi khiếu nại");
      setForm({ ...form, content: "" });
      load();
    } catch (e: any) {
      toast.error(e?.message || "Lỗi");
    } finally {
      setSending(false);
    }
  };

  const resolve = async () => {
    if (!resolving) return;
    try {
      await pb.collection("complaints").update(resolving.row.id, {
        status: resolving.status,
        admin_note: note,
        resolved_at: new Date().toISOString(),
      });
      toast.success(resolving.status === "accepted" ? "Đã tiếp nhận" : "Đã từ chối");
      setResolving(null);
      setNote("");
      load();
    } catch (e: any) {
      toast.error(e?.message || "Lỗi");
    }
  };

  const filtered = items;

  const exportAll = () => {
    const rows = items.map((i) => ({
      "Họ tên": i.full_name,
      "Nhà máy": i.company,
      "Số điện thoại": i.phone,
      "Nội dung": i.content,
      "Trạng thái": STATUS_META[(i.status || "pending") as Status].label,
      "Ghi chú admin": i.admin_note || "",
      "Thời gian gửi": formatDateOnly(i.created),
      "Thời gian xử lý": formatDateOnly(i.resolved_at),
    }));
    exportToExcel(
      `khieu_nai_${Date.now()}`,
      { "Khiếu nại": rows },
      { "Khiếu nại": ["Thời gian gửi", "Thời gian xử lý"] },
    );
  };

  /* ─── User view ─── */
  if (!isAdmin) {
    return (
      <PageContainer title="Khiếu nại" subtitle="Gửi phản ánh & xem lịch sử">
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
                <ReadOnlyField label="Họ và tên" value={user?.full_name} />
                <ReadOnlyField
                  label="Nhà máy đang làm"
                  value={currentEmployment?.expand?.factory?.name || "Chưa có lịch sử đi làm"}
                />
                <ReadOnlyField label="Số điện thoại liên hệ" value={user?.phone} />
              </div>
            )}
            <div className="space-y-1">
              <Label>Nội dung khiếu nại</Label>
              <Textarea
                rows={5}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={sending}>
              <Send className="h-4 w-4" /> {sending ? "Đang gửi..." : "Gửi khiếu nại"}
            </Button>
          </div>
        </form>

        {/* Lịch sử cá nhân */}
        <div className="flex items-center gap-2 px-1 pt-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Lịch sử của bạn ({items.length})</span>
        </div>
        {loading && items.length > 0 && (
          <DataLoadingState variant="inline" label="Đang cập nhật lịch sử khiếu nại..." />
        )}
        {loading && items.length === 0 ? (
          <DataLoadingState variant="list" label="Đang tải lịch sử khiếu nại..." rows={2} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={MessageSquareWarning}
            title="Chưa có khiếu nại"
            description="Phản ánh của bạn sẽ hiển thị tại đây."
          />
        ) : (
          items.map((c) => {
            const status = (c.status || "pending") as Status;
            const meta = STATUS_META[status];
            const isExpanded = expandedComplaintId === c.id;
            return (
              <div key={c.id} className={cn("list-card", toneBorder[meta.tone])}>
                <div className="flex items-baseline justify-between gap-2">
                  <StatusChip tone={meta.tone}>{meta.label}</StatusChip>
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(c.created).toLocaleString("vi-VN")}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setExpandedComplaintId(isExpanded ? null : c.id)}
                  className="mt-2 block w-full text-left"
                >
                  <p
                    className={cn(
                      "whitespace-pre-wrap text-[13px] leading-relaxed",
                      !isExpanded && "line-clamp-2",
                    )}
                  >
                    {c.content}
                  </p>
                  <div className="mt-1 text-[11px] font-medium text-primary">
                    {isExpanded ? "Thu gọn" : "Xem đầy đủ"}
                  </div>
                </button>
                {c.admin_note && (
                  <div className="mt-2 rounded-lg bg-muted/60 p-2 text-[12px]">
                    <div className="font-semibold text-muted-foreground">Phản hồi admin:</div>
                    <div className="whitespace-pre-wrap">{c.admin_note}</div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </PageContainer>
    );
  }

  /* ─── Admin view ─── */
  return (
    <PageContainer
      title="Khiếu nại"
      subtitle={loading && items.length === 0 ? "Đang tải dữ liệu..." : `${items.length} mục`}
      right={
        <button
          onClick={exportAll}
          disabled={loading}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-card text-muted-foreground border border-border hover:bg-muted"
          aria-label="Xuất Excel"
        >
          <FileDown className="h-4 w-4" />
        </button>
      }
    >
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Chờ" value={stats.pending} icon={Clock} tone="warning" />
        <StatCard label="Tiếp nhận" value={stats.accepted} icon={Check} tone="success" />
        <StatCard label="Từ chối" value={stats.rejected} icon={X} tone="danger" />
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        placeholder="Tìm theo tên, SĐT, nội dung…"
        chips={[
          { key: "pending", label: `Chờ (${stats.pending})` },
          { key: "accepted", label: `Tiếp nhận (${stats.accepted})` },
          { key: "rejected", label: `Từ chối (${stats.rejected})` },
          { key: "all", label: "Tất cả" },
        ]}
        activeChip={tab}
        onChipChange={(v) => setTab(v as any)}
      />

      {loading && items.length > 0 && (
        <DataLoadingState variant="inline" label="Đang cập nhật khiếu nại..." />
      )}
      {loading && items.length === 0 ? (
        <DataLoadingState variant="list" label="Đang tải danh sách khiếu nại..." rows={3} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={MessageSquareWarning}
          title="Không có khiếu nại"
          description={search ? "Không có kết quả phù hợp." : "Tin khiếu nại sẽ xuất hiện tại đây."}
        />
      ) : (
        filtered.map((c) => {
          const status = (c.status || "pending") as Status;
          const meta = STATUS_META[status];
          const isExpanded = expandedComplaintId === c.id;
          return (
            <div key={c.id} className={cn("list-card", toneBorder[meta.tone])}>
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0 truncate text-sm font-semibold">{c.full_name}</div>
                <div className="shrink-0 text-[11px] text-muted-foreground">
                  {new Date(c.created).toLocaleDateString("vi-VN")}
                </div>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <StatusChip tone="neutral">{c.company || "—"}</StatusChip>
                <StatusChip tone={meta.tone}>{meta.label}</StatusChip>
              </div>
              <button
                type="button"
                onClick={() => setExpandedComplaintId(isExpanded ? null : c.id)}
                className="mt-2 block w-full text-left"
              >
                <p
                  className={cn(
                    "whitespace-pre-wrap text-[13px] leading-relaxed",
                    !isExpanded && "line-clamp-2",
                  )}
                >
                  {c.content}
                </p>
                <div className="mt-1 text-[11px] font-medium text-primary">
                  {isExpanded ? "Thu gọn" : "Xem đầy đủ"}
                </div>
              </button>

              {c.admin_note && (
                <div className="mt-2 rounded-lg bg-muted/60 p-2 text-[12px]">
                  <div className="font-semibold text-muted-foreground">Ghi chú:</div>
                  <div className="whitespace-pre-wrap">{c.admin_note}</div>
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <a
                  href={`tel:${c.phone}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-success px-3 py-1 text-[11px] font-semibold text-success-foreground"
                >
                  <Phone className="h-3 w-3" /> {c.phone}
                </a>
                {status === "pending" && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => {
                        setResolving({ row: c, status: "accepted" });
                        setNote(c.admin_note || "");
                      }}
                    >
                      <Check className="h-3.5 w-3.5" /> Tiếp nhận
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        setResolving({ row: c, status: "rejected" });
                        setNote(c.admin_note || "");
                      }}
                    >
                      <X className="h-3.5 w-3.5" /> Từ chối
                    </Button>
                  </>
                )}
                {status !== "pending" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setResolving({ row: c, status: "pending" });
                      setNote("");
                    }}
                  >
                    Mở lại
                  </Button>
                )}
              </div>
            </div>
          );
        })
      )}

      <Dialog
        open={!!resolving}
        onOpenChange={(o) => {
          if (!o) {
            setResolving(null);
            setNote("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {resolving?.status === "accepted" && "Tiếp nhận khiếu nại"}
              {resolving?.status === "rejected" && "Từ chối khiếu nại"}
              {resolving?.status === "pending" && "Mở lại khiếu nại"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Ghi chú (tuỳ chọn)</Label>
            <Textarea
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Phản hồi cho người gửi…"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setResolving(null);
                setNote("");
              }}
            >
              Huỷ
            </Button>
            <Button onClick={resolve}>Xác nhận</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function ReadOnlyField(props: { label: string; value?: string | null }) {
  return (
    <div className="space-y-1">
      <Label>{props.label}</Label>
      <div className="rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm text-foreground">
        {props.value?.trim() || "—"}
      </div>
    </div>
  );
}
