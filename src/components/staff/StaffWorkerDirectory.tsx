import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { BriefcaseBusiness, Plus, Search, UserRoundSearch } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { WorkerEmploymentDrawer } from "@/components/employment/WorkerEmploymentDrawer";
import { QuickWorkerAccountDialog } from "@/components/staff/QuickWorkerAccountDialog";
import { WorkerDesktopCard } from "@/components/staff/WorkerDesktopCard";
import { ScopeChip } from "@/components/staff/WorkerQuickDrawer";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/status-chip";
import { RegisterDialog } from "@/components/workforce/RegisterDialog";
import { useAuth } from "@/lib/auth";
import { isCurrentlyWorking, maskCccd } from "@/lib/employment";
import {
  fetchFactories,
  fetchFactoryManagers,
  isFactoryAssignmentActive,
  type FactoryRecord,
} from "@/lib/factories";
import { fetchMainHouses, type MainHouseRecord } from "@/lib/main-houses";
import { pb, type UserRecord } from "@/lib/pocketbase";
import { readCachedAuxData, writeCachedAuxData } from "@/lib/staff-cache";
import {
  fetchCachedStaffWorkspace,
  fetchStaffWorkspace,
  hasActiveOrRecentlyLeftEmployment,
  type StaffWorkerRecord,
} from "@/lib/staff-permissions";
import { useStaffCacheSignal } from "@/lib/use-staff-cache-signal";

export type StaffWorkerDirectoryMode = "all" | "recruited";
type WorkerScope = "all" | "qlnm" | "nvtd" | "working" | "left";

const RECRUITED_PAGE_SIZE = 20;

function formatDate(value?: string) {
  if (!value) return "—";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function latestJoinTime(worker: StaffWorkerRecord) {
  const time = new Date(worker.latestHistory?.join_date || "").getTime();
  return Number.isNaN(time) ? null : time;
}

function isRecruitedByViewer(worker: StaffWorkerRecord, viewerId?: string) {
  return Boolean(
    viewerId && worker.histories.some((history) => history.recruiter_staff === viewerId),
  );
}

export function StaffWorkerDirectory({
  workers,
  viewer,
  loading,
  mode,
  onSelectWorker,
  embedded = false,
}: {
  workers: StaffWorkerRecord[];
  viewer: UserRecord | null;
  loading: boolean;
  mode: StaffWorkerDirectoryMode;
  onSelectWorker: (worker: StaffWorkerRecord) => void;
  embedded?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<WorkerScope>("all");
  const [visibleCount, setVisibleCount] = useState(RECRUITED_PAGE_SIZE);

  const updateSearch = (value: string) => {
    setSearch(value);
    setVisibleCount(RECRUITED_PAGE_SIZE);
  };

  const updateScope = (value: WorkerScope) => {
    setScope(value);
    setVisibleCount(RECRUITED_PAGE_SIZE);
  };

  const filteredWorkers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("vi-VN");

    return workers
      .filter((worker) => {
        const recruitedByViewer = isRecruitedByViewer(worker, viewer?.id);
        const needsRecruiterScope = mode === "recruited" || scope === "nvtd";
        if (needsRecruiterScope) {
          if (!recruitedByViewer) return false;
          if (!hasActiveOrRecentlyLeftEmployment(worker.histories)) return false;
        }

        if (scope === "qlnm" && !worker.reasons.includes("qlnm")) return false;

        const latest = worker.latestHistory;
        const isWorking = latest ? isCurrentlyWorking(latest) : false;
        if (scope === "working" && !isWorking) return false;
        if (scope === "left" && isWorking) return false;

        if (query) {
          const haystack = [
            worker.user.full_name,
            worker.user.username,
            worker.user.phone,
            worker.user.cccd,
            worker.user.uid,
            ...worker.histories.flatMap((history) => [
              history.uid,
              history.employee_code,
              history.worker_name_snapshot,
              history.worker_cccd_snapshot,
              history.worker_tax_code_snapshot,
              history.expand?.factory?.name,
              history.expand?.main_house?.name,
              history.expand?.recruiter_staff?.full_name,
              history.expand?.recruiter_staff?.username,
            ]),
          ]
            .filter(Boolean)
            .join(" ")
            .toLocaleLowerCase("vi-VN");
          if (!haystack.includes(query)) return false;
        }

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
  }, [mode, scope, search, viewer?.id, workers]);

  const visibleWorkers =
    mode === "recruited" ? filteredWorkers.slice(0, visibleCount) : filteredWorkers;

  return (
    <div className="space-y-3">
      <div
        className={
          embedded
            ? "sticky top-[calc(env(safe-area-inset-top)+6.5rem)] z-10 -mx-4 space-y-3 bg-background px-4 pb-2 pt-1"
            : "flex flex-col gap-2 desktop:flex-row desktop:items-center"
        }
      >
        <div
          className={
            embedded ? "relative" : "relative order-1 desktop:order-2 desktop:ml-auto desktop:w-80"
          }
        >
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => updateSearch(event.target.value)}
            placeholder="Tìm mã NV, họ tên, CCCD, nhà máy..."
            className="rounded-full pl-9"
          />
        </div>

        <div
          className={
            embedded
              ? "scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
              : "scrollbar-none -mx-1 order-2 flex gap-2 overflow-x-auto px-1 pb-1 desktop:order-1 desktop:min-w-0 desktop:flex-1"
          }
        >
          <ScopeChip label="Tất cả" active={scope === "all"} onClick={() => updateScope("all")} />
          {mode === "all" && (
            <>
              <ScopeChip
                label="Nhà máy tôi quản lý"
                active={scope === "qlnm"}
                onClick={() => updateScope("qlnm")}
              />
              <ScopeChip
                label="Người tôi tuyển"
                active={scope === "nvtd"}
                onClick={() => updateScope("nvtd")}
              />
            </>
          )}
          <ScopeChip
            label="Đang làm"
            active={scope === "working"}
            onClick={() => updateScope("working")}
          />
          <ScopeChip
            label="Đã nghỉ"
            active={scope === "left"}
            onClick={() => updateScope("left")}
          />
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        {mode === "recruited"
          ? `Đang hiển thị ${Math.min(visibleCount, filteredWorkers.length)}/${filteredWorkers.length} lao động bạn tuyển.`
          : `Tổng ${filteredWorkers.length} hồ sơ hiển thị trong phạm vi quyền.`}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border/60 bg-card p-4 text-sm text-muted-foreground">
          Đang tải danh sách lao động...
        </div>
      ) : filteredWorkers.length === 0 ? (
        <EmptyState
          icon={UserRoundSearch}
          title="Không có hồ sơ phù hợp"
          description={
            mode === "recruited"
              ? "Chưa có lao động đang làm hoặc đã nghỉ trong 90 ngày gần đây do bạn tuyển."
              : "Thử đổi bộ lọc hoặc tìm theo mã NV, CCCD, tên nhà máy gần nhất."
          }
        />
      ) : (
        <div className="space-y-2">
          {visibleWorkers.map((worker) => {
            const latest = worker.latestHistory;
            const isWorking = latest ? isCurrentlyWorking(latest) : false;
            const recruitedByViewer = isRecruitedByViewer(worker, viewer?.id);
            const recruiterName =
              latest?.expand?.recruiter_staff?.full_name ||
              latest?.expand?.recruiter_staff?.username;
            const mainHouseName = latest?.expand?.main_house?.name;
            const desktopBadges = (
              <>
                {worker.reasons.includes("qlnm") && (
                  <StatusChip tone="info">Thuộc nhà máy phụ trách</StatusChip>
                )}
                {recruitedByViewer && <StatusChip tone="primary">Bạn là người tuyển</StatusChip>}
                {(worker.canReportAdvance || worker.canReportLeave || worker.canReportJoin) && (
                  <StatusChip tone="success">Có thể thao tác</StatusChip>
                )}
              </>
            );
            const hasDesktopBadges =
              worker.reasons.includes("qlnm") ||
              recruitedByViewer ||
              worker.canReportAdvance ||
              worker.canReportLeave ||
              worker.canReportJoin;

            return (
              <Fragment key={worker.user.id}>
                <WorkerDesktopCard
                  name={worker.user.full_name || worker.user.username || "Người lao động"}
                  username={worker.user.username}
                  uid={latest?.uid || worker.user.uid}
                  employeeCode={latest?.employee_code || ""}
                  cccd={maskCccd(latest?.worker_cccd_snapshot || worker.user.cccd)}
                  taxCode={latest?.worker_tax_code_snapshot}
                  phone={worker.user.phone}
                  dateOfBirth={
                    worker.user.date_of_birth ? formatDate(worker.user.date_of_birth) : undefined
                  }
                  gender={worker.user.gender}
                  address={worker.user.address}
                  factoryName={latest?.expand?.factory?.name || ""}
                  mainHouseName={mainHouseName}
                  recruiterName={recruiterName}
                  joinDate={formatDate(latest?.join_date)}
                  leaveDate={latest?.leave_date ? formatDate(latest.leave_date) : undefined}
                  isWorking={isWorking}
                  badges={hasDesktopBadges ? desktopBadges : undefined}
                  onClick={() => onSelectWorker(worker)}
                />

                <button
                  type="button"
                  onClick={() => onSelectWorker(worker)}
                  className="list-card block w-full overflow-hidden border-l-primary text-left desktop:hidden"
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div className="truncate text-sm font-semibold">
                        {worker.user.full_name || worker.user.username || "Người lao động"}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        Mã NV: {latest?.employee_code || "Chưa có"} · CCCD:{" "}
                        {maskCccd(latest?.worker_cccd_snapshot || worker.user.cccd)}
                        {latest?.worker_tax_code_snapshot &&
                          ` · MST: ${latest.worker_tax_code_snapshot}`}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {latest?.expand?.factory?.name || "Chưa có nhà máy"} · Người tuyển:{" "}
                        {recruiterName || "Chưa gán"}
                      </div>
                      {mainHouseName && (
                        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          Nhà chính: {mainHouseName}
                        </div>
                      )}
                    </div>

                    <StatusChip tone={isWorking ? "success" : "neutral"}>
                      {isWorking ? "Đang làm" : "Đã nghỉ"}
                    </StatusChip>
                  </div>

                  <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
                    {worker.reasons.includes("qlnm") && (
                      <StatusChip tone="info">Thuộc nhà máy phụ trách</StatusChip>
                    )}
                    {recruitedByViewer && (
                      <StatusChip tone="primary">Bạn là người tuyển</StatusChip>
                    )}
                    {(worker.canReportAdvance || worker.canReportLeave || worker.canReportJoin) && (
                      <StatusChip tone="success">Có thể thao tác</StatusChip>
                    )}
                  </div>
                </button>
              </Fragment>
            );
          })}

          {mode === "recruited" && visibleCount < filteredWorkers.length && (
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-full"
              onClick={() => setVisibleCount((count) => count + RECRUITED_PAGE_SIZE)}
            >
              Tải thêm người lao động
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function StaffWorkerDirectoryPage({ mode }: { mode: StaffWorkerDirectoryMode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [workers, setWorkers] = useState<StaffWorkerRecord[]>([]);
  const [factories, setFactories] = useState<FactoryRecord[]>([]);
  const [mainHouses, setMainHouses] = useState<MainHouseRecord[]>([]);
  const [managedFactoryIds, setManagedFactoryIds] = useState<Set<string>>(new Set());
  const [staffUsers, setStaffUsers] = useState<UserRecord[]>([]);
  const [selected, setSelected] = useState<StaffWorkerRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);

  const openWorker = (worker: StaffWorkerRecord) => {
    setSelected(worker);
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
          .then((result) => result.items)
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
      const workspace = await fetchCachedStaffWorkspace(user as UserRecord);
      if (workspace) {
        setWorkers(workspace.workers);
        setManagedFactoryIds(workspace.managedFactoryIds);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [cacheSignal, user]);

  const isAllMode = mode === "all";

  return (
    <PageContainer
      title={isAllMode ? "Lao động trong quyền" : "Người tôi tuyển"}
      subtitle={
        isAllMode
          ? "Tìm theo mã NV, họ tên, CCCD và nhà máy gần nhất"
          : "Lao động do chính tài khoản của bạn tuyển vào"
      }
      right={
        isAllMode ? (
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
        ) : undefined
      }
    >
      <StaffWorkerDirectory
        workers={workers}
        viewer={(user as UserRecord | null) ?? null}
        loading={loading}
        mode={mode}
        onSelectWorker={openWorker}
      />

      <WorkerEmploymentDrawer
        user={selected?.user ?? null}
        actor={(user as UserRecord | null) ?? null}
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

      {isAllMode && (
        <>
          <QuickWorkerAccountDialog
            open={quickCreateOpen}
            onOpenChange={setQuickCreateOpen}
            actor={(user as UserRecord | null) ?? null}
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
            actor={(user as UserRecord | null) ?? null}
            onClose={() => setRegisterOpen(false)}
            users={staffUsers}
            factories={factories}
            mainHouses={mainHouses}
            onCreated={loadWorkers}
            defaultRecruiterId={user?.id || ""}
            actorRoleLabel="Nhân sự"
          />
        </>
      )}
    </PageContainer>
  );
}
