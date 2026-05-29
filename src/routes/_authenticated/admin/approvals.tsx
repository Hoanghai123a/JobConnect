import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { pb } from "@/lib/pocketbase";
import { isUserApproved } from "@/lib/user-approval";
import { PageContainer } from "@/components/layout/PageContainer";
import { StatCard } from "@/components/ui/stat-card";
import { StatusChip, toneBorder } from "@/components/ui/status-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { exportToExcel } from "@/lib/excel";
import { toast } from "sonner";
import { Check, FileDown, X, Users, Clock } from "lucide-react";
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

  const load = async () => {
    try {
      const res = await pb.collection("users").getFullList({
        filter: `approvalStatus = "pending" || approved = "false"`,
        sort: "-created",
      });
      setUsers(res);
    } catch (e: any) {
      toast.error(e?.message || "Lá»—i táº£i");
    }
  };
  useEffect(() => {
    load();
  }, []);

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
      if (approve)
        await pb.collection("users").update(id, {
          approvalStatus: "approved",
          approved: "true",
          status: "active",
        });
      else await pb.collection("users").delete(id);
    }
    toast.success(approve ? "ÄÃ£ duyá»‡t" : "ÄÃ£ tá»« chá»‘i");
    setSelected(new Set());
    load();
  };

  const exportUsers = async () => {
    const all = await pb.collection("users").getFullList({ sort: "-created" });
    const rows = all.map((u: any) => ({
      "Há» tÃªn": u.full_name,
      "SÄT": u.phone,
      Email: u.email,
      "Vai trÃ²": u.role,
      "ÄÃ£ duyá»‡t": isUserApproved(u) ? "CÃ³" : "KhÃ´ng",
      "NhÃ  mÃ¡y": u.company,
      LCB: u.lcb,
      "NgÃ¢n hÃ ng": u.bank_name,
      "Sá»‘ TK": u.bank_account_number,
      "TÃªn TK": u.bank_account_name,
      "Táº¡o lÃºc": u.created,
    }));
    exportToExcel(`danh_sach_user_${Date.now()}`, { Users: rows });
  };

  return (
    <PageContainer
      title="Quáº£n lÃ½ duyá»‡t"
      subtitle={`${users.length} chá» duyá»‡t`}
      right={
        <button
          onClick={exportUsers}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-card text-muted-foreground border border-border hover:bg-muted"
          aria-label="Xuáº¥t Excel"
        >
          <FileDown className="h-4 w-4" />
        </button>
      }
    >
      <div className="grid grid-cols-2 gap-2.5">
        <StatCard label="Chá» duyá»‡t" value={users.length} icon={Clock} tone="warning" />
        <StatCard label="ÄÃ£ chá»n" value={selected.size} icon={Check} tone="primary" />
      </div>

      {selected.size > 0 && (
        <div className="sticky top-[var(--header-h,3.25rem)] z-20 -mx-4 flex items-center justify-between gap-2 bg-primary/10 px-4 py-2 backdrop-blur">
          <span className="text-xs font-medium text-primary">{selected.size} Ä‘Ã£ chá»n</span>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => approveSelected(true)}>
              <Check className="h-3.5 w-3.5" /> Duyá»‡t
            </Button>
            <Button size="sm" variant="destructive" onClick={() => approveSelected(false)}>
              <X className="h-3.5 w-3.5" /> Tá»« chá»‘i
            </Button>
          </div>
        </div>
      )}

      {users.length > 0 && (
        <label className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <Checkbox
            checked={selected.size === users.length && users.length > 0}
            onCheckedChange={(c) => setSelected(c ? new Set(users.map((u) => u.id)) : new Set())}
          />
          Chá»n táº¥t cáº£ ({users.length})
        </label>
      )}

      {users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="KhÃ´ng cÃ³ yÃªu cáº§u"
          description="Táº¥t cáº£ Ä‘Äƒng kÃ½ Ä‘Ã£ Ä‘Æ°á»£c xá»­ lÃ½."
        />
      ) : (
        users.map((u) => (
          <label
            key={u.id}
            className={cn(
              "list-card cursor-pointer",
              toneBorder["warning"],
              "flex items-start gap-3",
            )}
          >
            <Checkbox
              checked={selected.has(u.id)}
              onCheckedChange={() => toggle(u.id)}
              className="mt-1"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{u.full_name || u.phone}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                SÄT: {u.phone || "â€”"} Â· STK: {u.bank_account_number || "â€”"}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                <StatusChip tone="warning">Chá» duyá»‡t</StatusChip>
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
