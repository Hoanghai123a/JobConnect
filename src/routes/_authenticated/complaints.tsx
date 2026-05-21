import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { pb } from "@/lib/pocketbase";
import { useAuth } from "@/lib/auth";
import { PageContainer } from "@/components/layout/PageContainer";
import { FilterBar } from "@/components/ui/filter-bar";
import { StatusChip, toneBorder, ChipTone } from "@/components/ui/status-chip";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { exportToExcel } from "@/lib/excel";
import { toast } from "sonner";
import { Phone, Send, FileDown, MessageSquareWarning, Check, X, History, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/complaints")({
  component: ComplaintsPage,
});

type Status = "pending" | "accepted" | "rejected";

interface Complaint {
  id: string;
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

function ComplaintsPage() {
  const { user, isAdmin } = useAuth();
  const [items, setItems] = useState<Complaint[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"pending" | "accepted" | "rejected" | "all">("pending");
  const [resolving, setResolving] = useState<{ row: Complaint; status: Status } | null>(null);
  const [note, setNote] = useState("");
  const [form, setForm] = useState({
    full_name: user?.full_name || "",
    company: user?.company || "",
    phone: user?.phone || "",
    content: "",
  });
  const [sending, setSending] = useState(false);

  const load = async () => {
    try {
      const filter = isAdmin ? "" : `phone="${user?.phone || ""}"`;
      const res = await pb.collection("complaints").getFullList({
        filter,
        sort: "-created",
      });
      setItems(res as any);
    } catch (e: any) { toast.error(e?.message || "Lỗi tải khiếu nại"); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [isAdmin, user?.phone]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      await pb.collection("complaints").create({ ...form, status: "pending" });
      toast.success("Đã gửi khiếu nại");
      setForm({ ...form, content: "" });
      load();
    } catch (e: any) { toast.error(e?.message || "Lỗi"); }
    finally { setSending(false); }
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
      setResolving(null); setNote("");
      load();
    } catch (e: any) { toast.error(e?.message || "Lỗi"); }
  };

  const stats = useMemo(() => ({
    pending: items.filter((i) => (i.status || "pending") === "pending").length,
    accepted: items.filter((i) => i.status === "accepted").length,
    rejected: items.filter((i) => i.status === "rejected").length,
  }), [items]);

  const filtered = useMemo(
    () =>
      items.filter((i) => {
        const s = i.status || "pending";
        if (tab !== "all" && s !== tab) return false;
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          i.full_name?.toLowerCase().includes(q) ||
          i.company?.toLowerCase().includes(q) ||
          i.phone?.toLowerCase().includes(q) ||
          i.content?.toLowerCase().includes(q)
        );
      }),
    [items, search, tab],
  );

  const exportAll = () => {
    const rows = items.map((i) => ({
      "Họ tên": i.full_name,
      "Nhà máy": i.company,
      "SĐT": i.phone,
      "Nội dung": i.content,
      "Trạng thái": STATUS_META[(i.status || "pending") as Status].label,
      "Ghi chú admin": i.admin_note || "",
      "Thời gian gửi": i.created,
      "Thời gian xử lý": i.resolved_at || "",
    }));
    exportToExcel(`khieu_nai_${Date.now()}`, { "Khiếu nại": rows });
  };

  /* ─── User view ─── */
  if (!isAdmin) {
    return (
      <PageContainer title="Khiếu nại" subtitle="Gửi phản ánh & xem lịch sử">
        <form onSubmit={submit} className="space-y-3">
          <div className="card-soft space-y-3 rounded-2xl border bg-card p-4">
            <Field label="Họ và tên" value={form.full_name} onChange={(v) => setForm({ ...form, full_name: v })} required />
            <Field label="Nhà máy đang làm" value={form.company} onChange={(v) => setForm({ ...form, company: v })} required />
            <Field label="Số điện thoại liên hệ" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} type="tel" required />
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
              <Send className="h-4 w-4" /> {sending ? "Đang gửi…" : "Gửi khiếu nại"}
            </Button>
          </div>
        </form>

        {/* Lịch sử cá nhân */}
        <div className="flex items-center gap-2 px-1 pt-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Lịch sử của bạn ({items.length})</span>
        </div>
        {items.length === 0 ? (
          <EmptyState icon={MessageSquareWarning} title="Chưa có khiếu nại" description="Phản ánh của bạn sẽ hiển thị tại đây." />
        ) : (
          items.map((c) => {
            const status = (c.status || "pending") as Status;
            const meta = STATUS_META[status];
            return (
              <div key={c.id} className={cn("list-card", toneBorder[meta.tone])}>
                <div className="flex items-baseline justify-between gap-2">
                  <StatusChip tone={meta.tone}>{meta.label}</StatusChip>
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(c.created).toLocaleString("vi-VN")}
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed">{c.content}</p>
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
      subtitle={`${items.length} mục`}
      right={
        <button
          onClick={exportAll}
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

      {filtered.length === 0 ? (
        <EmptyState
          icon={MessageSquareWarning}
          title="Không có khiếu nại"
          description={search ? "Không có kết quả phù hợp." : "Tin khiếu nại sẽ xuất hiện ở đây."}
        />
      ) : (
        filtered.map((c) => {
          const status = (c.status || "pending") as Status;
          const meta = STATUS_META[status];
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
              <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed">{c.content}</p>

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
                    <Button size="sm" onClick={() => { setResolving({ row: c, status: "accepted" }); setNote(c.admin_note || ""); }}>
                      <Check className="h-3.5 w-3.5" /> Tiếp nhận
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => { setResolving({ row: c, status: "rejected" }); setNote(c.admin_note || ""); }}>
                      <X className="h-3.5 w-3.5" /> Từ chối
                    </Button>
                  </>
                )}
                {status !== "pending" && (
                  <Button size="sm" variant="outline" onClick={() => { setResolving({ row: c, status: "pending" }); setNote(""); }}>
                    Mở lại
                  </Button>
                )}
              </div>
            </div>
          );
        })
      )}

      <Dialog open={!!resolving} onOpenChange={(o) => { if (!o) { setResolving(null); setNote(""); } }}>
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
            <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Phản hồi cho người gửi…" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResolving(null); setNote(""); }}>Huỷ</Button>
            <Button onClick={resolve}>Xác nhận</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function Field(props: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label>{props.label}</Label>
      <Input type={props.type || "text"} value={props.value} onChange={(e) => props.onChange(e.target.value)} required={props.required} />
    </div>
  );
}
