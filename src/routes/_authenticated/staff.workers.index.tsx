import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, Plus, Search, ShieldCheck, UserRoundSearch } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/status-chip";
import { QuickWorkerAccountDialog } from "@/components/staff/QuickWorkerAccountDialog";
import { ScopeChip } from "@/components/staff/WorkerQuickDrawer";
import { WorkerEmploymentDrawer } from "@/components/employment/WorkerEmploymentDrawer";
import { WorkerDesktopCard } from "@/components/staff/WorkerDesktopCard";
import { RegisterDialog } from "@/components/workforce/RegisterDialog";
import {
  fetchCachedStaffWorkspace,
  fetchStaffWorkspace,
  type StaffWorkerRecord,
} from "@/lib/staff-permissions";
import { useStaffCacheSignal } from "@/lib/use-staff-cache-signal";
import { fetchFactoryManagers, isFactoryAssignmentActive } from "@/lib/factories";
import { isCurrentlyWorking, maskCccd } from "@/lib/employment";
import { fetchFactories, type FactoryRecord } from "@/lib/factories";
import { fetchMainHouses, type MainHouseRecord } from "@/lib/main-houses";
import { useAuth } from "@/lib/auth";
import { pb, type UserRecord } from "@/lib/pocketbase";
import { readCachedAuxData, writeCachedAuxData } from "@/lib/staff-cache";

export const Route = createFileRoute("/_authenticated/staff/workers/")({
  component: StaffWorkersPage,
});

type WorkerScope = "all" | "qlnm" | "nvtd" | "working" | "left";

function latestJoinTime(worker: StaffWorkerRecord) {
  const time = new Date(worker.latestHistory?.join_date || "").getTime();
  return Number.isNaN(time) ? null : time;
}

function formatDate(value?: string) {
  if (!value) return "—";
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value;
}

function StaffWorkersPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [workers, setWorkers] = useState<StaffWorkerRecord[]>([]);
  const [factories, setFactories] = useState<FactoryRecord[]>([]);
  const [mainHouses, setMainHouses] = useState<MainHouseRecord[]>([]);
  const [managedFactoryIds, setManagedFactoryIds] = useState<Set<string>>(new Set());
  const [staffUsers, setStaffUsers] = useState<UserRecord[]>([]);
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<WorkerScope>("all");
  const [selected, setSelected] = useState<StaffWorkerRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);

  const openWorker = (w: StaffWorkerRecord) => {
    setSelected(w);
    setDrawerOpen(true);
  };
  const closeDrawer = () => {
    setDrawerOpen(false);
    setTimeout(() => setSelected(null), 300);
  };

  const loadWorkers = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const auxCached = await readCachedAuxData();
      if (auxCached) {
        setFactories(auxCached.factories);
        setMainHouses(auxCached.mainHouses);
        setStaffUsers(auxCached.staffUsers);
      }

      const [workspace, factoryList, staffList, managerRows, mainHouseList] = await Promise.all([
        fetchStaffWorkspace(user as UserRecord, {
          onCacheReady: (cachedResult) => {
            setWorkers(cachedResult.workers);
            setManagedFactoryIds(cachedResult.managedFactoryIds);
            setLoading(false);
          },
        }),
        fetchFactories(),
        pb
          .collection("users")
          .getList<UserRecord>(1, 200, {
            filter: `role="staff" || role="admin"`,
            sort: "full_name,username",
          })
          .then((res) => res.items)
          .catch(() => [] as UserRecord[]),
        fetchFactoryManagers(user.id),
        fetchMainHouses().catch(() => [] as MainHouseRecord[]),
      ]);
      setWorkers(workspace.workers);
      setFactories(factoryList);
      setStaffUsers(staffList);
      setMainHouses(mainHouseList);
      setManagedFactoryIds(
        new Set(
          managerRows.filter((item) => isFactoryAssignmentActive(item)).map((item) => item.factory),
        ),
      );

      writeCachedAuxData({
        factories: factoryList,
        mainHouses: mainHouseList,
        staffUsers: staffList,
      });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadWorkers();
  }, [loadWorkers]);

  const cacheSignal = useStaffCacheSignal();
  useEffect(() => {
    if (!user?.id || cacheSignal === 0) return;
    const timer = setTimeout(async () => {
      const ws = await fetchCachedStaffWorkspace(user as UserRecord);
      if (ws) {
        setWorkers(ws.workers);
        setManagedFactoryIds(ws.managedFactoryIds);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [cacheSignal, user?.id]);

  const filteredWorkers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return workers
      .filter((worker) => {
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
          latest?.worker_tax_code_snapshot,
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
      })
      .sort((a, b) => {
        const aTime = latestJoinTime(a);
        const bTime = latestJoinTime(b);
        if (aTime !== null && bTime !== null && aTime !== bTime) return bTime - aTime;
        if (aTime === null && bTime !== null) return 1;
        if (aTime !== null && bTime === null) return -1;

        const aName = a.user.full_name || a.user.username || "";
        const bName = b.user.full_name || b.user.username || "";
        const nameOrder = aName.localeCompare(bName, "vi", { sensitivity: "base" });
        return nameOrder || a.user.id.localeCompare(b.user.id);
      });
  }, [scope, search, workers]);

  return (
    <PageContainer
      title="Lao động trong quyền"
      subtitle="Tìm theo mã NV, họ tên, CCCD và nhà máy gần nhất"
      right={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setRegisterOpen(true)}
            className="flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium text-foreground shadow-sm active:scale-[0.98]"
            aria-label="Đăng ký đi làm"
          >
            <BriefcaseBusiness className="h-4 w-4" />
            Đăng ký
          </button>
          <button
            type="button"
            onClick={() => setQuickCreateOpen(true)}
            className="flex h-9 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground shadow active:scale-[0.98]"
            aria-label="Tạo nhanh tài khoản NLĐ"
          >
            <Plus className="h-4 w-4" />
            Tạo nhanh
          </button>
        </div>
      }
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
        <ScopeChip
          label="Nhà máy tôi quản lý"
          active={scope === "qlnm"}
          onClick={() => setScope("qlnm")}
        />
        <ScopeChip
          label="Người tôi tuyển"
          active={scope === "nvtd"}
          onClick={() => setScope("nvtd")}
        />
        <ScopeChip
          label="Đang làm"
          active={scope === "working"}
          onClick={() => setScope("working")}
        />
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

          const recruiterName =
            latest?.expand?.recruiter_staff?.full_name || latest?.expand?.recruiter_staff?.username;
          const mainHouseName = latest?.expand?.main_house?.name;
          const isWorking = latest?.status === "working";
          const desktopBadges = (
            <>
              {worker.reasons.includes("qlnm") && (
                <StatusChip tone="info">Thuộc nhà máy phụ trách</StatusChip>
              )}
              {worker.reasons.includes("nvtd") && (
                <StatusChip tone="primary">Bạn là người tuyển</StatusChip>
              )}
              {(worker.canReportAdvance || worker.canReportLeave || worker.canReportJoin) && (
                <StatusChip tone="success">Có thể thao tác</StatusChip>
              )}
            </>
          );
          const hasDesktopBadges =
            worker.reasons.length > 0 ||
            worker.canReportAdvance ||
            worker.canReportLeave ||
            worker.canReportJoin;

          return (
            <Fragment key={worker.user.id}>
              <WorkerDesktopCard
                name={worker.user.full_name || worker.user.username || "Người lao động"}
                username={worker.user.username}
                uid={latest?.uid || worker.user.uid}
                employeeCode={latest?.employee_code || worker.user.employee_code}
                cccd={maskCccd(latest?.worker_cccd_snapshot || worker.user.cccd)}
                taxCode={latest?.worker_tax_code_snapshot}
                phone={worker.user.phone}
                dateOfBirth={
                  worker.user.date_of_birth ? formatDate(worker.user.date_of_birth) : undefined
                }
                gender={worker.user.gender}
                address={worker.user.address}
                factoryName={latest?.expand?.factory?.name || worker.user.company}
                mainHouseName={mainHouseName}
                recruiterName={recruiterName}
                joinDate={formatDate(latest?.join_date)}
                leaveDate={latest?.leave_date ? formatDate(latest.leave_date) : undefined}
                isWorking={isWorking}
                badges={hasDesktopBadges ? desktopBadges : undefined}
                onClick={() => openWorker(worker)}
              />

              <button
                key={`${worker.user.id}-mobile`}
                type="button"
                onClick={() => openWorker(worker)}
                className="list-card border-l-primary block w-full text-left desktop:hidden"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">
                      {worker.user.full_name || worker.user.username || "Người lao động"}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      Mã NV: {latest?.employee_code || worker.user.employee_code || "Chưa có"} ·
                      CCCD: {maskCccd(latest?.worker_cccd_snapshot || worker.user.cccd)}
                      {latest?.worker_tax_code_snapshot &&
                        ` · MST: ${latest.worker_tax_code_snapshot}`}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {latest?.expand?.factory?.name || "Chưa có nhà máy"} · Người tuyển:{" "}
                      {recruiterName || "Chưa gán"}
                    </div>
                    {mainHouseName && (
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        Nhà chính: {mainHouseName}
                      </div>
                    )}
                  </div>

                  {user?.role === "admin" ? (
                    <StatusChip tone="info" icon={ShieldCheck}>
                      Admin
                    </StatusChip>
                  ) : (
                    <StatusChip tone={statusTone}>{isWorking ? "Đang làm" : "Đã nghỉ"}</StatusChip>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {worker.reasons.includes("qlnm") && (
                    <StatusChip tone="info">Thuộc nhà máy phụ trách</StatusChip>
                  )}
                  {worker.reasons.includes("nvtd") && (
                    <StatusChip tone="primary">Bạn là người tuyển</StatusChip>
                  )}
                  {(worker.canReportAdvance || worker.canReportLeave || worker.canReportJoin) && (
                    <StatusChip tone="success">Có thể thao tác</StatusChip>
                  )}
                </div>
              </button>
            </Fragment>
          );
        })
      )}

      <WorkerEmploymentDrawer
        user={selected?.user ?? null}
        actor={user as UserRecord}
        histories={selected?.histories ?? []}
        factories={factories}
        mainHouses={mainHouses}
        users={staffUsers}
        managedFactoryIds={managedFactoryIds}
        permissions={{
          canEditHistory: selected?.canEditHistory ?? false,
          canAddOldHistory: user?.role === "admin",
          canReportAdvance: selected?.canReportAdvance ?? false,
          canUpdateBank: selected?.canUpdateBank ?? false,
          canReportLeave: selected?.canReportLeave ?? false,
          canReportJoin: selected?.canReportJoin ?? false,
          canViewPayroll: selected?.canViewPayroll ?? false,
        }}
        open={drawerOpen}
        onClose={closeDrawer}
        onDataChanged={loadWorkers}
      />

      <QuickWorkerAccountDialog
        open={quickCreateOpen}
        onOpenChange={setQuickCreateOpen}
        actor={user as UserRecord}
        factories={factories}
        mainHouses={mainHouses}
        staffUsers={staffUsers}
        onCreated={async (userId) => {
          await loadWorkers();
          navigate({ to: "/staff/workers/$workerId", params: { workerId: userId } });
        }}
      />

      <RegisterDialog
        open={registerOpen}
        actor={user as UserRecord}
        onClose={() => setRegisterOpen(false)}
        users={staffUsers}
        factories={factories}
        mainHouses={mainHouses}
        onCreated={loadWorkers}
        defaultRecruiterId={user?.id || ""}
        actorRoleLabel="Nhân sự"
      />
    </PageContainer>
  );
}
