import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { pb } from "@/lib/pocketbase";
import { useAuth } from "@/lib/auth";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import PocketBase from "pocketbase";
import { PageContainer } from "@/components/layout/PageContainer";
import { FilterBar } from "@/components/ui/filter-bar";
import { StatusChip, toneBorder, ChipTone } from "@/components/ui/status-chip";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { DataLoadingState } from "@/components/ui/data-loading-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { escapePb } from "@/lib/pocketbase-utils";
import {
  readGuestComplaints,
  saveGuestComplaint,
  submitGuestComplaint,
  syncGuestComplaints,
} from "@/lib/guest-requests";
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
  expand?: {
    resolved_by?: {
      id: string;
      full_name?: string;
      username?: string;
    };
  };
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
  const { user, isAdmin, isGuest } = useAuth();
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
  const [expandedComplaintId, setExpandedComplaintId] = useState<string | null>(null);
  const [viewingComplaint, setViewingComplaint] = useState<Complaint | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      if (isGuest) {
        // Sync guest complaints với PocketBase để cập nhật trạng thái
        await syncGuestComplaints();

        const query = debouncedSearch.trim().toLocaleLowerCase("vi-VN");
        // Guest: Hiển thị TẤT CẢ trạng thái, không filter theo tab
        const rows = readGuestComplaints().filter((row) => {
          const searchMatches =
            !query ||
            [row.full_name, row.phone, row.content, row.admin_note]
              .join(" ")
              .toLocaleLowerCase("vi-VN")
              .includes(query);
          return searchMatches;
        });
        setItems(rows);
        return;
      }
      const filter = buildComplaintFilter({
        isAdmin,
        phone: user?.phone,
        tab: isAdmin ? tab : "all", // User: luôn dùng tab="all" để lấy tất cả
        search: debouncedSearch,
      });
      console.log("[complaints.tsx] Filter:", filter);
      console.log("[complaints.tsx] User phone:", user?.phone);
      console.log("[complaints.tsx] Tab:", isAdmin ? tab : "all (user view)");
      console.log("[complaints.tsx] Is admin:", isAdmin);
      const res = await pb.collection("complaints").getList(1, 200, {
        filter,
        sort: "-created",
        expand: "resolved_by",
      });
      setItems(res.items as any);
    } catch (e: any) {
      console.error("[complaints.tsx] Load error:", e);
      console.error("[complaints.tsx] Error details:", {
        message: e?.message,
        status: e?.status,
        data: e?.data,
        response: e?.response,
      });
      toast.error(e?.message || "Lỗi tải khiếu nại");
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    if (isGuest) {
      const rows = readGuestComplaints();
      setStats({
        pending: rows.filter((row) => (row.status || "pending") === "pending").length,
        accepted: rows.filter((row) => row.status === "accepted").length,
        rejected: rows.filter((row) => row.status === "rejected").length,
      });
      return;
    }

    // Test query đơn giản trước
    try {
      console.log("[complaints.tsx] Testing simple query...");
      const testRes = await pb.collection("complaints").getList(1, 1, { fields: "id" });
      console.log("[complaints.tsx] Simple query OK, total:", testRes.totalItems);
    } catch (testErr: any) {
      console.error("[complaints.tsx] Simple query failed:", testErr);
      console.error("[complaints.tsx] Error details:", {
        message: testErr?.message,
        status: testErr?.status,
        data: testErr?.data,
      });
    }

    const base = buildComplaintFilter({
      isAdmin,
      phone: user?.phone,
      tab: "all",
      search: debouncedSearch,
    });
    console.log("[complaints.tsx] Stats base filter:", base);

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
  }, [debouncedSearch, isAdmin, isGuest, user?.phone, tab]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      if (isGuest) {
        console.log("[DEBUG] Guest form submission - React state:", form);
        if (!form.full_name.trim() || !form.phone.trim() || !form.content.trim()) {
          console.log("[DEBUG] Validation failed - empty fields detected");
          toast.error("Vui lòng nhập họ tên, số điện thoại và nội dung.");
          return;
        }
        console.log("[DEBUG] Validation passed, submitting...");
        const created = await submitGuestComplaint({
          full_name: form.full_name.trim(),
          phone: form.phone.trim(),
          content: form.content.trim(),
        });
        console.log("[DEBUG] Submission successful:", created);
        saveGuestComplaint(created);
        toast.success("Đã gửi khiếu nại");
        setForm((current) => ({ ...current, content: "" }));
        await load();
        return;
      }
      const title = form.content.trim().slice(0, 100) || "Khiếu nại";
      await pb.collection("complaints").create({
        user: user?.id || "",
        title,
        full_name: user?.full_name || "",
        employee_code: "",
        company: "",
        phone: user?.phone || "",
        content: form.content,
        status: "pending",
      });
      toast.success("Đã gửi khiếu nại");
      setForm({ ...form, content: "" });
      load().catch(() => {});
    } catch (e: any) {
      toast.error(e?.message || "Lỗi");
    } finally {
      setSending(false);
    }
  };

  const resolve = async () => {
    if (!resolving) return;
    try {
      // Debug: kiểm tra auth data hiện tại
      console.log("[complaints.tsx] Current auth:", {
        hasToken: !!pb.authStore.token,
        hasRecord: !!pb.authStore.record,
        recordRole: (pb.authStore.record as any)?.role,
        recordId: (pb.authStore.record as any)?.id,
      });

      // Tạo một PocketBase client tạm với upstream URL
      const adminPb = new PocketBase("http://127.0.0.1:8090");

      // Copy toàn bộ auth state
      adminPb.authStore.save(pb.authStore.token, pb.authStore.record);

      console.log("[complaints.tsx] Admin PB auth:", {
        hasToken: !!adminPb.authStore.token,
        hasRecord: !!adminPb.authStore.record,
        recordRole: (adminPb.authStore.record as any)?.role,
      });

      await adminPb.collection("complaints").update(resolving.row.id, {
        status: resolving.status,
        admin_note: note,
        resolved_at: new Date().toISOString(),
        resolved_by: pb.authStore.record?.id || "",
      });

      toast.success(resolving.status === "accepted" ? "Đã tiếp nhận" : "Đã từ chối");
      setResolving(null);
      setNote("");

      // Reload cả data và stats để cập nhật số liệu
      await Promise.all([load(), loadStats()]);
    } catch (e: any) {
      console.error("[complaints.tsx] Resolve error:", e);
      console.error("[complaints.tsx] Error details:", {
        message: e?.message,
        status: e?.status,
        data: e?.data,
        response: e?.response,
      });
      toast.error(e?.message || "Lỗi cập nhật khiếu nại");
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
      <PageContainer
        title="Khiếu nại"
        subtitle={isGuest ? "Nhập đủ thông tin để gửi phản ánh" : "Gửi phản ánh & xem lịch sử"}
      >
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
            {isGuest ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Họ và tên</Label>
                  <Input
                    value={form.full_name}
                    onChange={(event) => setForm({ ...form, full_name: event.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>Số điện thoại</Label>
                  <Input
                    value={form.phone}
                    inputMode="tel"
                    onChange={(event) => setForm({ ...form, phone: event.target.value })}
                    required
                  />
                </div>
              </div>
            ) : (
              showProfile && (
                <div className="space-y-3">
                  <ReadOnlyField label="Họ và tên" value={user?.full_name} />
                  <ReadOnlyField
                    label="Nhà máy đang làm"
                    value={(user as any)?.company || "Chưa có lịch sử đi làm"}
                  />
                  <ReadOnlyField label="Số điện thoại liên hệ" value={user?.phone} />
                </div>
              )
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
          <span className="text-sm font-semibold">
            {isGuest ? "Lịch sử trên thiết bị" : "Lịch sử của bạn"} ({items.length})
          </span>
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
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setViewingComplaint(c)}
                className={cn("list-card text-left transition-all hover:shadow-md", toneBorder[meta.tone])}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <StatusChip tone={meta.tone}>{meta.label}</StatusChip>
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(c.created).toLocaleString("vi-VN")}
                  </div>
                </div>
                <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-[13px] leading-relaxed">
                  {c.content}
                </p>
                <div className="mt-1 text-[11px] font-medium text-primary">Xem đầy đủ</div>
              </button>
            );
          })
        )}

        {/* Dialog chi tiết khiếu nại cho user/guest */}
        <Dialog open={!!viewingComplaint} onOpenChange={(o) => !o && setViewingComplaint(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Chi tiết khiếu nại</DialogTitle>
            </DialogHeader>
            {viewingComplaint && (
              <div className="space-y-4">
                {/* Trạng thái */}
                <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3">
                  <span className="text-sm font-medium">Trạng thái</span>
                  <StatusChip tone={STATUS_META[(viewingComplaint.status || "pending") as Status].tone}>
                    {STATUS_META[(viewingComplaint.status || "pending") as Status].label}
                  </StatusChip>
                </div>

                {/* Thông tin người gửi */}
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-muted-foreground">Thông tin người gửi</div>
                  <div className="space-y-1.5 rounded-lg border bg-card p-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Họ và tên:</span>
                      <span className="font-medium">{viewingComplaint.full_name}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Số điện thoại:</span>
                      <a
                        href={`tel:${viewingComplaint.phone}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {viewingComplaint.phone}
                      </a>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Thời gian gửi:</span>
                      <span className="font-medium">
                        {new Date(viewingComplaint.created).toLocaleString("vi-VN")}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Nội dung khiếu nại */}
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-muted-foreground">Nội dung khiếu nại</div>
                  <div className="whitespace-pre-wrap rounded-lg border bg-card p-3 text-sm leading-relaxed">
                    {viewingComplaint.content}
                  </div>
                </div>

                {/* Thông tin phản hồi admin */}
                {(viewingComplaint.admin_note || viewingComplaint.resolved_at || viewingComplaint.expand?.resolved_by) && (
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-muted-foreground">Thông tin phản hồi</div>
                    <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                      {/* Admin xử lý */}
                      {viewingComplaint.expand?.resolved_by && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Admin xử lý:</span>
                          <span className="font-medium">
                            {viewingComplaint.expand.resolved_by.full_name || viewingComplaint.expand.resolved_by.username || "—"}
                          </span>
                        </div>
                      )}

                      {/* Lý do phản hồi */}
                      {viewingComplaint.admin_note && (
                        <div className="space-y-1">
                          <div className="text-sm text-muted-foreground">Lý do phản hồi:</div>
                          <div className="whitespace-pre-wrap text-sm leading-relaxed">
                            {viewingComplaint.admin_note}
                          </div>
                        </div>
                      )}

                      {/* Thời gian phản hồi */}
                      {viewingComplaint.resolved_at && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Thời gian phản hồi:</span>
                          <span className="font-medium">
                            {new Date(viewingComplaint.resolved_at).toLocaleString("vi-VN")}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => setViewingComplaint(null)}>Đóng</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
