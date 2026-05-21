import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { pb } from "@/lib/pocketbase";
import { PageContainer } from "@/components/layout/PageContainer";
import { StatCard } from "@/components/ui/stat-card";
import { StatusChip, toneBorder } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { exportToExcel } from "@/lib/excel";
import { toast } from "sonner";
import { Check, FileDown, ShieldCheck, X, Users, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/approvals")({
  beforeLoad: () => {
    const u = pb.authStore.record as any;
    if (!u || u.role !== "admin") throw redirect({ to: "/news" });
  },
  component: ApprovalsPage,
});

function ApprovalsPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [requireApproval, setRequireApproval] = useState(true);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await pb.collection("users").getFullList({
        filter: `approved=false`,
        sort: "-created",
      });
      setUsers(res);
    } catch (e: any) { toast.error(e?.message || "Lỗi tải"); }
    try {
      const s = await pb.collection("settings").getList(1, 1);
      if (s.items[0]) {
        setSettingsId(s.items[0].id);
        setRequireApproval(!!s.items[0].require_approval);
      }
    } catch { /* ignore */ }
  };
  useEffect(() => { load(); }, []);

  const toggle = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const approveSelected = async (approve: boolean) => {
    if (!selected.size) return;
    for (const id of selected) {
      if (approve) await pb.collection("users").update(id, { approved: true });
      else await pb.collection("users").delete(id);
    }
    toast.success(approve ? "Đã duyệt" : "Đã từ chối");
    setSelected(new Set());
    load();
  };

  const toggleApprovalRequirement = async (val: boolean) => {
    setRequireApproval(val);
    try {
      if (settingsId) {
        await pb.collection("settings").update(settingsId, { require_approval: val });
      } else {
        const r = await pb.collection("settings").create({ require_approval: val });
        setSettingsId(r.id);
      }
      toast.success("Đã cập nhật");
    } catch (e: any) { toast.error(e?.message || "Lỗi"); }
  };

  const exportUsers = async () => {
    const all = await pb.collection("users").getFullList({ sort: "-created" });
    const rows = all.map((u: any) => ({
      "Họ tên": u.full_name,
      "SĐT": u.phone,
      "Email": u.email,
      "Vai trò": u.role,
      "Đã duyệt": u.approved ? "Có" : "Không",
      "Nhà máy": u.company,
      "LCB": u.lcb,
      "Ngân hàng": u.bank_name,
      "Số TK": u.bank_account_number,
      "Tên TK": u.bank_account_name,
      "Tạo lúc": u.created,
    }));
    exportToExcel(`danh_sach_user_${Date.now()}`, { Users: rows });
  };

  return (
    <PageContainer
      title="Quản lý duyệt"
      subtitle={`${users.length} chờ duyệt`}
      right={
        <button
          onClick={exportUsers}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-card text-muted-foreground border border-border hover:bg-muted"
          aria-label="Xuất Excel"
        >
          <FileDown className="h-4 w-4" />
        </button>
      }
    >
      <div className="grid grid-cols-2 gap-2.5">
        <StatCard label="Chờ duyệt" value={users.length} icon={Clock} tone="warning" />
        <StatCard label="Đã chọn" value={selected.size} icon={Check} tone="primary" />
      </div>

      <Card className="flex items-center gap-3 rounded-2xl border-border/60 p-3.5 shadow-soft">
        <div className="rounded-xl bg-primary/10 p-2 text-primary">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <Label className="text-sm font-semibold">Yêu cầu duyệt khi đăng ký</Label>
          <div className="text-[11px] text-muted-foreground">
            Tắt để user tự do đăng ký (vẫn check trùng SĐT/STK).
          </div>
        </div>
        <Switch checked={requireApproval} onCheckedChange={toggleApprovalRequirement} />
      </Card>

      {selected.size > 0 && (
        <div className="sticky top-[var(--header-h,3.25rem)] z-20 -mx-4 flex items-center justify-between gap-2 bg-primary/10 px-4 py-2 backdrop-blur">
          <span className="text-xs font-medium text-primary">{selected.size} đã chọn</span>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => approveSelected(true)}>
              <Check className="h-3.5 w-3.5" /> Duyệt
            </Button>
            <Button size="sm" variant="destructive" onClick={() => approveSelected(false)}>
              <X className="h-3.5 w-3.5" /> Từ chối
            </Button>
          </div>
        </div>
      )}

      {users.length > 0 && (
        <label className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <Checkbox
            checked={selected.size === users.length && users.length > 0}
            onCheckedChange={(c) =>
              setSelected(c ? new Set(users.map((u) => u.id)) : new Set())
            }
          />
          Chọn tất cả ({users.length})
        </label>
      )}

      {users.length === 0 ? (
        <EmptyState icon={Users} title="Không có yêu cầu" description="Tất cả đăng ký đã được xử lý." />
      ) : (
        users.map((u) => (
          <label
            key={u.id}
            className={cn("list-card cursor-pointer", toneBorder["warning"], "flex items-start gap-3")}
          >
            <Checkbox
              checked={selected.has(u.id)}
              onCheckedChange={() => toggle(u.id)}
              className="mt-1"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{u.full_name || u.phone}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                SĐT: {u.phone || "—"} · STK: {u.bank_account_number || "—"}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                <StatusChip tone="warning">Chờ duyệt</StatusChip>
                <StatusChip tone="neutral">
                  {new Date(u.created).toLocaleDateString("vi-VN")}
                </StatusChip>
              </div>
            </div>
          </label>
        ))
      )}
    </PageContainer>
  );
}
