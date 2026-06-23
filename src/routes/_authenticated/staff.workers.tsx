import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, ShieldCheck, UserRoundSearch } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/status-chip";
import { fetchStaffWorkspace, type StaffWorkerRecord } from "@/lib/staff-permissions";
import { maskCccd } from "@/lib/employment";
import { useAuth } from "@/lib/auth";
import type { UserRecord } from "@/lib/pocketbase";

export const Route = createFileRoute("/_authenticated/staff/workers")({
  component: StaffWorkersPage,
});

type WorkerScope = "all" | "qlnm" | "nvtd" | "working" | "left";

function StaffWorkersPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [workers, setWorkers] = useState<StaffWorkerRecord[]>([]);
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<WorkerScope>("all");

  useEffect(() => {
    if (!user?.id) return;
    let alive = true;

    setLoading(true);
    fetchStaffWorkspace(user as UserRecord)
      .then((workspace) => {
        if (alive) setWorkers(workspace.workers);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [user?.id]);

  const filteredWorkers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return workers.filter((worker) => {
      const latest = worker.latestHistory;
      const haystack = [
        worker.user.full_name,
        worker.user.username,
        worker.user.phone,
        worker.user.employee_code,
        worker.user.cccd,
        latest?.employee_code,
        latest?.worker_name_snapshot,
        latest?.worker_cccd_snapshot,
        latest?.expand?.factory?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (query && !haystack.includes(query)) return false;

      if (scope === "qlnm" && !worker.reasons.includes("qlnm")) return false;
      if (scope === "nvtd" && !worker.reasons.includes("nvtd")) return false;
      if (scope === "working" && latest?.status !== "working") return false;
      if (scope === "left" && latest?.status !== "left") return false;

      return true;
    });
  }, [scope, search, workers]);

  return (
    <PageContainer
      title="Lao động trong quyền"
      subtitle="Tìm theo mã NV, họ tên, CCCD và nhà máy gần nhất"
    >
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Tìm mã NV, họ tên, CCCD, nhà máy..."
          className="rounded-full pl-9"
        />
      </div>

      <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <ScopeChip label="Tất cả" active={scope === "all"} onClick={() => setScope("all")} />
        <ScopeChip label="Nhà máy tôi quản lý" active={scope === "qlnm"} onClick={() => setScope("qlnm")} />
        <ScopeChip label="Người tôi tuyển" active={scope === "nvtd"} onClick={() => setScope("nvtd")} />
        <ScopeChip label="Đang làm" active={scope === "working"} onClick={() => setScope("working")} />
        <ScopeChip label="Đã nghỉ" active={scope === "left"} onClick={() => setScope("left")} />
      </div>

      <div className="text-xs text-muted-foreground">
        Tổng {filteredWorkers.length} hồ sơ hiển thị trong phạm vi 90 ngày gần đây.
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border/60 bg-card p-4 text-sm text-muted-foreground">
          Đang tải danh sách lao động...
        </div>
      ) : filteredWorkers.length === 0 ? (
        <EmptyState
          icon={UserRoundSearch}
          title="Không có hồ sơ phù hợp"
          description="Thử đổi bộ lọc hoặc tìm theo mã NV, CCCD, tên nhà máy gần nhất."
        />
      ) : (
        filteredWorkers.map((worker) => {
          const latest = worker.latestHistory;
          const statusTone = latest?.status === "working" ? "success" : "neutral";

          return (
            <Link
              key={worker.user.id}
              to="/staff/workers/$workerId"
              params={{ workerId: worker.user.id }}
              className="list-card border-l-primary block"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    {worker.user.full_name || worker.user.username || "Người lao động"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    Mã NV: {latest?.employee_code || worker.user.employee_code || "Chưa có"} · CCCD:{" "}
                    {maskCccd(latest?.worker_cccd_snapshot || worker.user.cccd)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {latest?.expand?.factory?.name || "Chưa có nhà máy"} · Người tuyển:{" "}
                    {latest?.expand?.recruiter_staff?.full_name ||
                      latest?.expand?.recruiter_staff?.username ||
                      "Chưa gán"}
                  </div>
                </div>

                {user?.role === "admin" ? (
                  <StatusChip tone="info" icon={ShieldCheck}>
                    Admin
                  </StatusChip>
                ) : (
                  <StatusChip tone={statusTone}>{latest?.status === "working" ? "Đang làm" : "Đã nghỉ"}</StatusChip>
                )}
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {worker.reasons.includes("qlnm") && <StatusChip tone="info">Thuộc nhà máy phụ trách</StatusChip>}
                {worker.reasons.includes("nvtd") && <StatusChip tone="primary">Bạn là người tuyển</StatusChip>}
                {(worker.canReportAdvance || worker.canReportLeave || worker.canReportJoin) && (
                  <StatusChip tone="success">Có thể thao tác</StatusChip>
                )}
              </div>
            </Link>
          );
        })
      )}
    </PageContainer>
  );
}

function ScopeChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-full bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
          : "rounded-full border border-border/60 bg-card px-3 py-2 text-xs font-medium text-muted-foreground"
      }
    >
      {label}
    </button>
  );
}
