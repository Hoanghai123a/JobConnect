import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, ShieldCheck, UserRoundSearch } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/status-chip";
import { ScopeChip } from "@/components/staff/WorkerQuickDrawer";
import { WorkerEmploymentDrawer } from "@/components/employment/WorkerEmploymentDrawer";
import {
  fetchCachedStaffWorkspace,
  fetchStaffWorkspace,
  hasActiveOrRecentlyLeftEmployment,
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

export const Route = createFileRoute("/_authenticated/staff/recruited")({
  component: StaffRecruitedPage,
});

type RecruitedScope = "all" | "working" | "left";
const RECRUITED_PAGE_SIZE = 20;

function formatDate(value?: string) {
  if (!value) return "—";
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value;
}

function StaffRecruitedPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [workers, setWorkers] = useState<StaffWorkerRecord[]>([]);
  const [factories, setFactories] = useState<FactoryRecord[]>([]);
  const [mainHouses, setMainHouses] = useState<MainHouseRecord[]>([]);
  const [managedFactoryIds, setManagedFactoryIds] = useState<Set<string>>(new Set());
  const [staffUsers, setStaffUsers] = useState<UserRecord[]>([]);
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<RecruitedScope>("all");
  const [visibleCount, setVisibleCount] = useState(RECRUITED_PAGE_SIZE);
  const [selected, setSelected] = useState<StaffWorkerRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

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
            setWorkers(cachedResult.workers.filter((w) => w.reasons.includes("nvtd")));
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
      setWorkers(workspace.workers.filter((w) => w.reasons.includes("nvtd")));
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
  }, [user?.id]);

  useEffect(() => {
    loadWorkers();
  }, [loadWorkers]);

  const cacheSignal = useStaffCacheSignal();
  useEffect(() => {
    if (!user?.id || cacheSignal === 0) return;
    const timer = setTimeout(async () => {
      const ws = await fetchCachedStaffWorkspace(user as UserRecord);
      if (ws) {
        setWorkers(ws.workers.filter((w) => w.reasons.includes("nvtd")));
        setManagedFactoryIds(ws.managedFactoryIds);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [cacheSignal, user?.id]);

  const filteredWorkers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return workers
      .filter((worker) => {
        if (!hasActiveOrRecentlyLeftEmployment(worker.histories)) return false;

        const latest = worker.latestHistory;
        const isWorking = latest?.status === "working" && !latest.leave_date;
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

        if (scope === "working" && !isWorking) return false;
        if (scope === "left" && isWorking) return false;

        return true;
      })
      .sort((a, b) => {
        const aTime = new Date(a.latestHistory?.join_date || "").getTime();
        const bTime = new Date(b.latestHistory?.join_date || "").getTime();
        const aValid = !Number.isNaN(aTime);
        const bValid = !Number.isNaN(bTime);
        if (aValid && bValid && aTime !== bTime) return bTime - aTime;
        if (!aValid && bValid) return 1;
        if (aValid && !bValid) return -1;
        return a.user.id.localeCompare(b.user.id);
      });
  }, [scope, search, workers]);

  const visibleWorkers = useMemo(
    () => filteredWorkers.slice(0, visibleCount),
    [filteredWorkers, visibleCount],
  );

  const updateSearch = (value: string) => {
    setSearch(value);
    setVisibleCount(RECRUITED_PAGE_SIZE);
  };

  const updateScope = (value: RecruitedScope) => {
    setScope(value);
    setVisibleCount(RECRUITED_PAGE_SIZE);
  };

  return (
    <PageContainer title="Người tôi tuyển" subtitle="Lao động bạn trực tiếp tuyển vào">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => updateSearch(event.target.value)}
          placeholder="Tìm mã NV, họ tên, CCCD, nhà máy..."
          className="rounded-full pl-9"
        />
      </div>

      <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <ScopeChip label="Tất cả" active={scope === "all"} onClick={() => updateScope("all")} />
        <ScopeChip
          label="Đang làm"
          active={scope === "working"}
          onClick={() => updateScope("working")}
        />
        <ScopeChip label="Đã nghỉ" active={scope === "left"} onClick={() => updateScope("left")} />
      </div>

      <div className="text-xs text-muted-foreground">
        Đang hiển thị {Math.min(visibleCount, filteredWorkers.length)}/{filteredWorkers.length} lao
        động bạn tuyển.
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border/60 bg-card p-4 text-sm text-muted-foreground">
          Đang tải danh sách...
        </div>
      ) : filteredWorkers.length === 0 ? (
        <EmptyState
          icon={UserRoundSearch}
          title="Không có hồ sơ phù hợp"
          description="Chưa có lao động nào do bạn tuyển, hoặc thử đổi bộ lọc."
        />
      ) : (
        <>
          {visibleWorkers.map((worker) => {
            const latest = worker.latestHistory;
            const isWorking = latest?.status === "working" && !latest.leave_date;
            const statusTone = isWorking ? "success" : "neutral";

            return (
              <button
                key={worker.user.id}
                type="button"
                onClick={() => openWorker(worker)}
                className="list-card border-l-primary block w-full text-left"
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
                      {latest?.expand?.factory?.name || "Chưa có nhà máy"}
                    </div>
                    {latest?.expand?.main_house?.name && (
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        Nhà chính: {latest.expand.main_house.name}
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
                  <StatusChip tone="primary">Bạn là người tuyển</StatusChip>
                  {worker.reasons.includes("qlnm") && (
                    <StatusChip tone="info">Thuộc nhà máy phụ trách</StatusChip>
                  )}
                  {(worker.canReportAdvance || worker.canReportLeave || worker.canReportJoin) && (
                    <StatusChip tone="success">Có thể thao tác</StatusChip>
                  )}
                </div>

                {worker.histories.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-border/60 pt-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Lịch sử đi làm ({worker.histories.length})
                    </div>
                    {worker.histories.map((h) => (
                      <div
                        key={h.id}
                        className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {h.expand?.factory?.name || "Nhà máy"} · Vào {formatDate(h.join_date)}
                          {isCurrentlyWorking(h)
                            ? " · Đang làm"
                            : ` · Nghỉ ${formatDate(h.leave_date)}`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </button>
            );
          })}

          {visibleCount < filteredWorkers.length && (
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-full"
              onClick={() => setVisibleCount((count) => count + RECRUITED_PAGE_SIZE)}
            >
              Tải thêm người lao động
            </Button>
          )}
        </>
      )}

      <WorkerEmploymentDrawer
        user={selected?.user ?? null}
        actor={user as UserRecord}
        histories={selected?.histories ?? []}
        factories={factories}
        mainHouses={mainHouses}
        users={staffUsers}
        permissions={{
          canEditHistory: selected?.canEditHistory ?? false,
          canAddOldHistory: user?.role === "admin",
          canReportAdvance: selected?.canReportAdvance ?? false,
          canUpdateBank: selected?.canUpdateBank ?? false,
        }}
        open={drawerOpen}
        onClose={closeDrawer}
        onDataChanged={loadWorkers}
      />
    </PageContainer>
  );
}
