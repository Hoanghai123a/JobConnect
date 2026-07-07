import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, Building2, BusFront, ChevronRight, Download, LayoutGrid, MessagesSquare, Newspaper, NotebookPen, RefreshCw, UserCheck, Users } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusChip } from "@/components/ui/status-chip";
import { FeatureTile } from "@/components/dashboard/FeatureTile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchFactoryManagers, type FactoryManagerRecord } from "@/lib/factories";
import { fetchStaffWorkspace } from "@/lib/staff-permissions";
import { useAuth } from "@/lib/auth";
import type { UserRecord } from "@/lib/pocketbase";

export const Route = createFileRoute("/_authenticated/staff/")({
  component: StaffDashboardPage,
});

function StaffDashboardPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [workersCount, setWorkersCount] = useState(0);
  const [operableCount, setOperableCount] = useState(0);
  const [assignments, setAssignments] = useState<FactoryManagerRecord[]>([]);
  const [utilOpen, setUtilOpen] = useState(false);
  const [reloading, setReloading] = useState(false);

  const handleReload = async () => {
    if (reloading) return;
    setReloading(true);
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    window.location.reload();
  };

  useEffect(() => {
    if (!user?.id) return;

    let alive = true;
    setLoading(true);

    Promise.all([fetchStaffWorkspace(user as UserRecord), fetchFactoryManagers(user.id)])
      .then(([workspace, managerRows]) => {
        if (!alive) return;
        setWorkersCount(workspace.workers.length);
        setOperableCount(
          workspace.workers.filter(
            (item) => item.canReportAdvance || item.canReportLeave || item.canReportJoin,
          ).length,
        );
        setAssignments(managerRows);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [user?.id]);

  const activeAssignments = useMemo(
    () => assignments.filter((item) => item.status !== "inactive"),
    [assignments],
  );

  return (
    <PageContainer
      title={user?.role === "admin" ? "Nhân sự & tuyển dụng" : "Bàn làm việc staff"}
      subtitle="Quản lý lao động theo nhà máy và người tuyển"
      back={false}
    >
      <div className="gradient-hero overflow-hidden rounded-[1.75rem] px-4 py-5 text-white shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-white/70">JobConnect staff</div>
            <div className="mt-1 text-xl font-semibold leading-tight">
              {user?.full_name || user?.username || "Staff"}
            </div>
            <div className="mt-1 text-sm text-white/80">
              {user?.role === "admin"
                ? "Bạn đang xem toàn bộ dữ liệu để quản trị và chỉnh sửa."
                : "Bạn xem lao động theo nhà máy phụ trách và người tuyển của mình."}
            </div>
          </div>
          <button
            type="button"
            onClick={handleReload}
            disabled={reloading}
            aria-label="Tải lại trang"
            title="Tải lại trang"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-white shadow-sm backdrop-blur transition hover:bg-white/30 active:scale-95 disabled:opacity-70"
          >
            <RefreshCw className={reloading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <StatCard label="Nhà máy phụ trách" value={activeAssignments.length} icon={Building2} tone="info" />
        <StatCard label="Lao động trong quyền" value={workersCount} icon={Users} tone="primary" />
        <StatCard label="Có thể cập nhật" value={operableCount} icon={NotebookPen} tone="success" />
        <StatCard label="Xuất dữ liệu" value={1} icon={Download} tone="warning" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <DashboardLink
          to="/staff/workers"
          title="Danh sách lao động"
          description="Tìm kiếm, xem lịch sử và xử lý nghiệp vụ."
          icon={Users}
        />
        <DashboardLink
          to="/staff/recruited"
          title="Người tôi tuyển"
          description="Xem và xử lý lao động bạn trực tiếp tuyển."
          icon={UserCheck}
        />
        <DashboardLink
          to="/staff/export"
          title="Xuất dữ liệu"
          description="Lọc 90 ngày gần đây và xuất Excel nhanh."
          icon={Download}
        />
        <DashboardLink
          to="/notebook"
          title="Sổ tay"
          description="Ghi chú, ghi nợ theo ngày tháng."
          icon={NotebookPen}
        />
        <button
          type="button"
          onClick={() => setUtilOpen(true)}
          className="group rounded-2xl border border-border/60 bg-card p-4 text-left shadow-soft transition hover:-translate-y-0.5"
        >
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <LayoutGrid className="h-5 w-5" />
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>
          <div className="mt-3 text-sm font-semibold">Tiện ích</div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">Bảng tin, nhà xe, trò chuyện, hướng dẫn</div>
        </button>
      </div>

      <Dialog open={utilOpen} onOpenChange={setUtilOpen}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="gradient-primary flex h-8 w-8 items-center justify-center rounded-xl text-primary-foreground shadow-sm">
                <LayoutGrid className="h-4 w-4" />
              </div>
              Tiện ích
            </DialogTitle>
            <DialogDescription>Các tiện ích dành cho staff</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2" onClick={() => setUtilOpen(false)}>
            <FeatureTile to="/news" label="Bảng tin" icon={Newspaper} size="compact" />
            <FeatureTile to="/transport" label="Tìm nhà xe" icon={BusFront} size="compact" />
            <FeatureTile to="/chat" label="Trò chuyện" icon={MessagesSquare} size="compact" />
            <FeatureTile to="/guides" label="Hướng dẫn" icon={BookOpen} size="compact" />
          </div>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="rounded-2xl border border-border/60 bg-card p-4 text-sm text-muted-foreground">
          Đang tải dữ liệu staff...
        </div>
      ) : activeAssignments.length === 0 && user?.role !== "admin" ? (
        <EmptyState
          icon={Building2}
          title="Chưa có nhà máy phụ trách"
          description="Admin cần gán nhà máy cho staff trong phần cài đặt trước khi bạn có thể xem danh sách lao động."
        />
      ) : (
        <div className="space-y-2 rounded-2xl border border-border/60 bg-card p-4 shadow-soft">
          <div className="text-sm font-semibold">Nhà máy đang phụ trách</div>
          <div className="flex flex-wrap gap-2">
            {user?.role === "admin" && activeAssignments.length === 0 ? (
              <StatusChip tone="info">Admin có thể xem toàn bộ</StatusChip>
            ) : (
              activeAssignments.map((item) => (
                <StatusChip key={item.id} tone="info">
                  {item.expand?.factory?.name || "Nhà máy"}
                </StatusChip>
              ))
            )}
          </div>
        </div>
      )}
    </PageContainer>
  );
}

function DashboardLink({
  to,
  title,
  description,
  icon: Icon,
}: {
  to: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Link
      to={to as any}
      className="group rounded-2xl border border-border/60 bg-card p-4 shadow-soft transition hover:-translate-y-0.5"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="mt-3 text-sm font-semibold">{title}</div>
      <div className="mt-1 text-xs leading-5 text-muted-foreground">{description}</div>
    </Link>
  );
}
