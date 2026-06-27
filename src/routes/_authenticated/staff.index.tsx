import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, Building2, BusFront, Download, Newspaper, NotebookPen, ShieldCheck, Sprout, Users } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusChip } from "@/components/ui/status-chip";
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
          <div className="rounded-2xl bg-white/15 p-3 backdrop-blur">
            {user?.role === "admin" ? <ShieldCheck className="h-6 w-6" /> : <BriefcaseBusiness className="h-6 w-6" />}
          </div>
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
          to="/staff/export"
          title="Xuất dữ liệu"
          description="Lọc 90 ngày gần đây và xuất Excel nhanh."
          icon={Download}
        />
        <DashboardLink
          to="/news"
          title="Bảng tin"
          description="Xem tin tuyển dụng và thông báo mới."
          icon={Newspaper}
        />
        <DashboardLink
          to="/transport"
          title="Tìm nhà xe"
          description="Tra cứu nhà xe đưa đón công nhân."
          icon={BusFront}
        />
        <DashboardLink
          to="/garden"
          title="Vườn cây"
          description="Trồng hoa, nuôi thú, thư giãn chút nha."
          icon={Sprout}
        />
      </div>

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
