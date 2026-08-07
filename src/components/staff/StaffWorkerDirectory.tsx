import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  BriefcaseBusiness,
  FileDown,
  Plus,
  RefreshCw,
  Search,
  UserRoundSearch,
  WifiOff,
} from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { WorkerEmploymentDrawer } from "@/components/employment/WorkerEmploymentDrawer";
import { QuickWorkerAccountDialog } from "@/components/staff/QuickWorkerAccountDialog";
import { WorkerDesktopCard } from "@/components/staff/WorkerDesktopCard";
import { ScopeChip } from "@/components/staff/WorkerQuickDrawer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { DataLoadingState } from "@/components/ui/data-loading-state";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/status-chip";
import { RegisterDialog } from "@/components/workforce/RegisterDialog";
import { useAuth } from "@/lib/auth";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import { isCurrentlyWorking, maskCccd } from "@/lib/employment";
import type { UserRecord } from "@/lib/pocketbase";
import { readCachedAuxData } from "@/lib/staff-cache";
import {
  fetchCachedStaffWorkspace,
  hasActiveOrRecentlyLeftEmployment,
  type StaffWorkerRecord,
} from "@/lib/staff-permissions";
import {
  STAFF_DIRECTORY_STATE_PREFIX,
  staffDirectoryAuxQueryKey,
  staffWorkspaceQueryKey,
  useStaffDirectoryAuxQuery,
  useStaffWorkspaceQuery,
} from "@/lib/staff-workspace-query";
import { useStaffCacheSignal } from "@/lib/use-staff-cache-signal";
import { getRecruiterDisplay } from "@/lib/recruiters";

export type StaffWorkerDirectoryMode = "all" | "recruited";
type WorkerScope = "all" | "qlnm" | "nvtd" | "working" | "left";

const DIRECTORY_PAGE_SIZE = 30;
const EMPTY_WORKERS: StaffWorkerRecord[] = [];
const EMPTY_MANAGED_FACTORY_IDS = new Set<string>();
const EMPTY_FACTORY_NAMES: string[] = [];

interface DirectorySessionState {
  search: string;
  scope: WorkerScope;
  visibleCount: number;
}

const VALID_SCOPES = new Set<WorkerScope>(["all", "qlnm", "nvtd", "working", "left"]);

function directoryStateKey(viewerId: string, mode: StaffWorkerDirectoryMode) {
  return `${STAFF_DIRECTORY_STATE_PREFIX}:${viewerId}:${mode}`;
}

function readDirectoryState(
  viewerId: string | undefined,
  mode: StaffWorkerDirectoryMode,
  embedded: boolean,
): DirectorySessionState {
  const fallback: DirectorySessionState = {
    search: "",
    scope: "all",
    visibleCount: DIRECTORY_PAGE_SIZE,
  };
  if (embedded || !viewerId || typeof window === "undefined") return fallback;

  try {
    const raw = window.sessionStorage.getItem(directoryStateKey(viewerId, mode));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<DirectorySessionState>;
    const scope = VALID_SCOPES.has(parsed.scope as WorkerScope)
      ? (parsed.scope as WorkerScope)
      : "all";
    const visibleCount = Number.isFinite(parsed.visibleCount)
      ? Math.max(DIRECTORY_PAGE_SIZE, Math.trunc(parsed.visibleCount as number))
      : DIRECTORY_PAGE_SIZE;
    return {
      search: typeof parsed.search === "string" ? parsed.search : "",
      scope,
      visibleCount,
    };
  } catch {
    return fallback;
  }
}

function buildWorkerSearchText(worker: StaffWorkerRecord) {
  return [
    worker.user.full_name,
    worker.user.username,
    worker.user.phone,
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
      history.expand?.recruiter_partner?.name,
      history.expand?.recruiter_partner?.hotline,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("vi-VN");
}

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

function getWorkerDisplayName(worker: StaffWorkerRecord) {
  return worker.user.full_name?.trim() || worker.user.username?.trim() || "Thiếu thông tin";
}

export function StaffWorkerDirectory({
  workers,
  viewer,
  loading,
  mode,
  onSelectWorker,
  embedded = false,
  managedFactoryNames = EMPTY_FACTORY_NAMES,
}: {
  workers: StaffWorkerRecord[];
  viewer: UserRecord | null;
  loading: boolean;
  mode: StaffWorkerDirectoryMode;
  onSelectWorker: (worker: StaffWorkerRecord) => void;
  embedded?: boolean;
  managedFactoryNames?: string[];
}) {
  const restoredState = useMemo(
    () => readDirectoryState(viewer?.id, mode, embedded),
    [embedded, mode, viewer?.id],
  );
  const [search, setSearch] = useState(restoredState.search);
  const [scope, setScope] = useState<WorkerScope>(restoredState.scope);
  const [visibleCount, setVisibleCount] = useState(restoredState.visibleCount);
  const [autoLoadSupported, setAutoLoadSupported] = useState(true);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const debouncedSearch = useDebouncedSearch(search);

  useEffect(() => {
    if (embedded || !viewer?.id || typeof window === "undefined") return;
    const state: DirectorySessionState = { search, scope, visibleCount };
    try {
      window.sessionStorage.setItem(directoryStateKey(viewer.id, mode), JSON.stringify(state));
    } catch {
      // Keep the directory usable when session storage is unavailable.
    }
  }, [embedded, mode, scope, search, viewer?.id, visibleCount]);

  const updateSearch = (value: string) => {
    setSearch(value);
    setVisibleCount(DIRECTORY_PAGE_SIZE);
  };

  const updateScope = (value: WorkerScope) => {
    setScope(value);
    setVisibleCount(DIRECTORY_PAGE_SIZE);
  };

  const indexedWorkers = useMemo(
    () => workers.map((worker) => ({ worker, searchText: buildWorkerSearchText(worker) })),
    [workers],
  );

  const filteredWorkers = useMemo(() => {
    const query = debouncedSearch.trim().toLocaleLowerCase("vi-VN");

    return indexedWorkers
      .filter(({ worker, searchText }) => {
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
        if (query && !searchText.includes(query)) return false;

        return true;
      })
      .map(({ worker }) => worker)
      .sort((a, b) => {
        const aTime = latestJoinTime(a);
        const bTime = latestJoinTime(b);
        if (aTime !== null && bTime !== null && aTime !== bTime) return bTime - aTime;
        if (aTime === null && bTime !== null) return 1;
        if (aTime !== null && bTime === null) return -1;

        const aName = getWorkerDisplayName(a);
        const bName = getWorkerDisplayName(b);
        const nameOrder = aName.localeCompare(bName, "vi", { sensitivity: "base" });
        return nameOrder || a.user.id.localeCompare(b.user.id);
      });
  }, [debouncedSearch, indexedWorkers, mode, scope, viewer?.id]);

  const visibleWorkers = filteredWorkers.slice(0, visibleCount);
  const canLoadMore = visibleCount < filteredWorkers.length;
  const showManagedFactoryNames =
    mode === "all" && scope === "qlnm" && managedFactoryNames.length > 0;

  useEffect(() => {
    if (!canLoadMore || !loadMoreRef.current || typeof window === "undefined") return;
    if (!("IntersectionObserver" in window)) {
      setAutoLoadSupported(false);
      return;
    }

    setAutoLoadSupported(true);
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        setVisibleCount((count) => Math.min(count + DIRECTORY_PAGE_SIZE, filteredWorkers.length));
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [canLoadMore, filteredWorkers.length, visibleCount]);

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
        {mode === "recruited" ? (
          `Đang hiển thị ${Math.min(visibleCount, filteredWorkers.length)}/${filteredWorkers.length} lao động bạn tuyển.`
        ) : (
          <>
            {`Tổng ${filteredWorkers.length} hồ sơ hiển thị trong phạm vi quyền`}
            {showManagedFactoryNames ? (
              <>
                <span className="hidden desktop:inline">{`: ${managedFactoryNames.join(", ")}`}</span>
                <span className="desktop:hidden">.</span>
              </>
            ) : (
              "."
            )}
          </>
        )}
      </div>

      {loading ? (
        <DataLoadingState variant="list" label="Đang tải danh sách lao động..." rows={4} />
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
            const recruiter = getRecruiterDisplay(latest);
            const recruiterName = recruiter ? `${recruiter.name} · ${recruiter.label}` : undefined;
            const mainHouseName = latest?.expand?.main_house?.name;
            const workerName = getWorkerDisplayName(worker);
            const snapshotCccd = latest?.worker_cccd_snapshot || "";
            const snapshotDateOfBirth = latest?.worker_date_of_birth_snapshot;
            const snapshotAddress = latest?.worker_address_snapshot || latest?.hometown_snapshot;

            return (
              <Fragment key={worker.user.id}>
                <WorkerDesktopCard
                  name={workerName}
                  username={worker.user.username}
                  uid={latest?.uid || worker.user.uid}
                  employeeCode={latest?.employee_code || ""}
                  cccd={maskCccd(snapshotCccd)}
                  taxCode={latest?.worker_tax_code_snapshot}
                  phone={worker.user.phone}
                  dateOfBirth={snapshotDateOfBirth ? formatDate(snapshotDateOfBirth) : undefined}
                  gender={worker.user.gender}
                  address={snapshotAddress}
                  factoryName={latest?.expand?.factory?.name || ""}
                  mainHouseName={mainHouseName}
                  recruiterName={recruiterName}
                  joinDate={formatDate(latest?.join_date)}
                  leaveDate={latest?.leave_date ? formatDate(latest.leave_date) : undefined}
                  isWorking={isWorking}
                  onClick={() => onSelectWorker(worker)}
                />

                <button
                  type="button"
                  onClick={() => onSelectWorker(worker)}
                  className="list-card block w-full overflow-hidden border-l-primary text-left desktop:hidden"
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div className="truncate text-sm font-semibold">{workerName}</div>
                      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        Mã NV: {latest?.employee_code || "Chưa có"} · CCCD: {maskCccd(snapshotCccd)}
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
                </button>
              </Fragment>
            );
          })}

          {canLoadMore && <div ref={loadMoreRef} className="h-px" aria-hidden="true" />}
          {canLoadMore && !autoLoadSupported && (
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-full"
              onClick={() => setVisibleCount((count) => count + DIRECTORY_PAGE_SIZE)}
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
  const viewer = (user as UserRecord | null) ?? null;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspaceQuery = useStaffWorkspaceQuery(viewer);
  const auxQuery = useStaffDirectoryAuxQuery(viewer);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  const workspace = workspaceQuery.data;
  const auxData = auxQuery.data;
  const workers = workspace?.workers ?? EMPTY_WORKERS;
  const factories = auxData?.factories || [];
  const mainHouses = auxData?.recruitmentEntities || [];
  const managedFactoryIds = workspace?.managedFactoryIds ?? EMPTY_MANAGED_FACTORY_IDS;
  const staffUsers = auxData?.staffUsers || [];
  const managedFactoryNames = useMemo(
    () =>
      (auxData?.factories ?? [])
        .filter((factory) => managedFactoryIds.has(factory.id))
        .map((factory) => factory.name?.trim())
        .filter((name): name is string => Boolean(name)),
    [auxData?.factories, managedFactoryIds],
  );
  const selected = useMemo(
    () => workers.find((worker) => worker.user.id === selectedWorkerId) || null,
    [selectedWorkerId, workers],
  );

  const openWorker = (worker: StaffWorkerRecord) => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    setSelectedWorkerId(worker.user.id);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      setSelectedWorkerId(null);
      closeTimerRef.current = null;
    }, 300);
  };

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!selectedWorkerId || !workspace || selected) return;
    setDrawerOpen(false);
    setSelectedWorkerId(null);
  }, [selected, selectedWorkerId, workspace]);

  const refreshDirectory = async () => {
    await Promise.all([workspaceQuery.refetch(), auxQuery.refetch()]);
  };

  const cacheSignal = useStaffCacheSignal();
  useEffect(() => {
    if (!viewer?.id || cacheSignal === 0) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void Promise.all([fetchCachedStaffWorkspace(viewer), readCachedAuxData()])
        .then(([cachedWorkspace, cachedAux]) => {
          if (cancelled) return;
          if (cachedWorkspace) {
            queryClient.setQueryData(staffWorkspaceQueryKey(viewer), cachedWorkspace);
          }
          if (cachedAux) {
            queryClient.setQueryData(staffDirectoryAuxQueryKey(viewer), cachedAux);
          }
        })
        .catch((error) => console.warn("[staff-directory] cache signal refresh failed", error));
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [cacheSignal, queryClient, viewer]);

  const loading = !workspace && workspaceQuery.isPending;
  const initialError = !workspace && workspaceQuery.isError;
  const refreshing = Boolean(workspace && (workspaceQuery.isFetching || auxQuery.isFetching));
  const showingCachedError = Boolean(workspace && (workspaceQuery.isError || auxQuery.isError));

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
              onClick={() => navigate({ to: "/staff/export" })}
              className="hidden h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted active:scale-[0.98] desktop:flex"
              aria-label="Xuất Excel"
            >
              <FileDown className="h-4 w-4" />
              Xuất Excel
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
      {isAllMode && (
        <button
          type="button"
          onClick={() => navigate({ to: "/staff/export" })}
          className="block w-full text-left desktop:hidden"
          aria-label="Mở trang xuất Excel"
        >
          <Card className="group flex items-center gap-3 rounded-2xl border-primary/20 bg-primary/5 p-4 text-left shadow-soft transition hover:border-primary/40 hover:bg-primary/10 active:scale-[0.99]">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <FileDown className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-foreground">Xuất Excel</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Xuất danh sách và dữ liệu lao động theo phạm vi quyền truy cập.
              </div>
            </div>
            <FileDown className="h-4 w-4 shrink-0 text-primary transition-transform group-hover:translate-y-0.5" />
          </Card>
        </button>
      )}

      {refreshing && (
        <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/70 px-3 py-2 text-xs text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
          Đang đồng bộ danh sách lao động...
        </div>
      )}

      {showingCachedError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
          <span className="min-w-0">
            Đang hiển thị dữ liệu đã lưu. Chưa thể đồng bộ dữ liệu mới.
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 rounded-full"
            onClick={() => void refreshDirectory()}
          >
            Thử lại
          </Button>
        </div>
      )}

      {initialError ? (
        <EmptyState
          icon={WifiOff}
          title="Không tải được danh sách lao động"
          description="Thiết bị chưa có dữ liệu đã lưu và hiện không thể kết nối PocketBase."
          action={
            <Button type="button" className="rounded-full" onClick={() => void refreshDirectory()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Thử lại
            </Button>
          }
        />
      ) : (
        <StaffWorkerDirectory
          workers={workers}
          viewer={viewer}
          loading={loading}
          mode={mode}
          onSelectWorker={openWorker}
          managedFactoryNames={managedFactoryNames}
        />
      )}

      <WorkerEmploymentDrawer
        user={selected?.user ?? null}
        actor={viewer}
        histories={selected?.histories ?? []}
        factories={factories}
        mainHouses={mainHouses}
        users={staffUsers}
        managedFactoryIds={managedFactoryIds}
        permissions={{
          canEditHistory: selected?.canEditHistory ?? false,
          canAddOldHistory: viewer?.role === "admin",
          canReportAdvance: selected?.canReportAdvance ?? false,
          canUpdateBank: selected?.canUpdateBank ?? false,
          canReportLeave: selected?.canReportLeave ?? false,
          canReportJoin: selected?.canReportJoin ?? false,
          canViewPayroll: selected?.canViewPayroll ?? false,
        }}
        open={drawerOpen}
        onClose={closeDrawer}
        onDataChanged={refreshDirectory}
      />

      {isAllMode && (
        <>
          <QuickWorkerAccountDialog
            open={quickCreateOpen}
            onOpenChange={setQuickCreateOpen}
            actor={viewer}
            factories={factories}
            mainHouses={mainHouses}
            staffUsers={staffUsers}
            onCreated={async (userId) => {
              await refreshDirectory();
              navigate({ to: "/staff/workers/$workerId", params: { workerId: userId } });
            }}
          />

          <RegisterDialog
            open={registerOpen}
            actor={viewer}
            onClose={() => setRegisterOpen(false)}
            users={staffUsers}
            factories={factories}
            mainHouses={mainHouses}
            onCreated={refreshDirectory}
            defaultRecruiterId={viewer?.id || ""}
            actorRoleLabel="Nhân sự"
          />
        </>
      )}
    </PageContainer>
  );
}
