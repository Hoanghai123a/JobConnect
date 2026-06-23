import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusChip } from "@/components/ui/status-chip";
import { pb } from "@/lib/pocketbase";
import type { StaffActionLogRecord } from "@/lib/staff-types";

export const Route = createFileRoute("/_authenticated/admin/accounts/logs")({
  beforeLoad: () => {
    const currentUser = pb.authStore.record as any;
    if (!currentUser || currentUser.role !== "admin") throw redirect({ to: "/account", search: {} as any });
  },
  component: AccountLogsPage,
});

const ACTION_LABELS: Record<string, string> = {
  create: "Tạo mới",
  update: "Cập nhật",
  delete: "Xóa",
  export: "Xuất dữ liệu",
  import: "Import",
  report_advance: "Báo ứng",
  report_leave: "Báo nghỉ",
  report_join: "Báo đi làm mới",
  update_bank: "Cập nhật ngân hàng",
  check_payroll: "Check công lương",
};

function AccountLogsPage() {
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<StaffActionLogRecord[]>([]);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    pb.collection("staff_action_logs")
      .getFullList<StaffActionLogRecord>({
        sort: "-created",
        expand: "actor,target_user",
      })
      .then((rows) => {
        if (alive) setLogs(rows);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const filteredLogs = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return logs.filter((item) => {
      if (actionFilter !== "all" && item.action !== actionFilter) return false;
      if (!keyword) return true;
      const haystack = [
        item.expand?.actor?.full_name,
        item.expand?.actor?.username,
        item.expand?.target_user?.full_name,
        item.expand?.target_user?.username,
        item.target_collection,
        item.note,
        item.action,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [actionFilter, logs, search]);

  return (
    <PageContainer
      title="Nhật ký thay đổi"
      subtitle="Theo dõi mọi thao tác staff và admin trong hệ thống"
      right={
        <Link
          to="/admin/accounts"
          className="flex h-9 items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 text-xs font-medium text-foreground shadow-soft"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Tài khoản
        </Link>
      }
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Tìm theo actor, user đích, collection, ghi chú..."
          className="rounded-full pl-9"
        />
      </div>

      <Select value={actionFilter} onValueChange={setActionFilter}>
        <SelectTrigger className="rounded-xl">
          <SelectValue placeholder="Lọc theo thao tác" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả thao tác</SelectItem>
          {Object.keys(ACTION_LABELS).map((action) => (
            <SelectItem key={action} value={action}>
              {ACTION_LABELS[action]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {loading ? (
        <Card className="rounded-2xl p-4 text-sm text-muted-foreground">Đang tải nhật ký...</Card>
      ) : filteredLogs.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Chưa có log phù hợp"
          description="Thử đổi bộ lọc hoặc thao tác thêm trên màn hình staff/admin để hệ thống ghi log mới."
        />
      ) : (
        filteredLogs.map((item) => (
          <Card key={item.id} className="space-y-3 rounded-2xl p-4 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">
                  {ACTION_LABELS[item.action] || item.action}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {item.expand?.actor?.full_name || item.expand?.actor?.username || item.actor} ·{" "}
                  {formatDateTime(item.created)}
                </div>
              </div>
              <StatusChip tone="info">{item.target_collection}</StatusChip>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <InfoCell
                label="User đích"
                value={
                  item.expand?.target_user?.full_name ||
                  item.expand?.target_user?.username ||
                  item.target_user ||
                  "Không có"
                }
              />
              <InfoCell label="Role actor" value={item.actor_role_snapshot || "Không rõ"} />
            </div>

            {item.note && (
              <div className="rounded-2xl bg-muted/35 p-3 text-sm text-muted-foreground">{item.note}</div>
            )}
          </Card>
        ))
      )}
    </PageContainer>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-muted/35 p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}

function formatDateTime(value?: string) {
  if (!value) return "Không rõ thời gian";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("vi-VN");
}