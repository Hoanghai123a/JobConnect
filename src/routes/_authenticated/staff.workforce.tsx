import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, CalendarCheck, ClipboardCheck, Users } from "lucide-react";
import { RecruitmentChart } from "@/components/workforce/RecruitmentChart";
import { WorkforceInsightsCharts } from "@/components/workforce/WorkforceInsightsCharts";
import { fetchFactories, type FactoryRecord } from "@/lib/factories";
import {
  fetchCachedStaffWorkspace,
  fetchStaffWorkspace,
  filterHistoriesForStaffScope,
  type StaffWorkspaceResult,
} from "@/lib/staff-permissions";
import { useStaffCacheSignal } from "@/lib/use-staff-cache-signal";
import { useAuth } from "@/lib/auth";
import { pb, type UserRecord } from "@/lib/pocketbase";
import type { EmploymentHistoryRecord } from "@/lib/employment";

export const Route = createFileRoute("/_authenticated/staff/workforce")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const currentUser = pb.authStore.record as UserRecord | null;
    if (currentUser?.role !== "staff") {
      throw redirect({ to: currentUser?.role === "admin" ? "/admin/workforce" : "/" });
    }
  },
  component: StaffWorkforceDashboardPage,
});

function getScopedHistories(viewer: UserRecord, workspace: StaffWorkspaceResult) {
  const uniqueHistories = new Map<string, EmploymentHistoryRecord>();

  for (const worker of workspace.workers) {
    const visibleHistories = filterHistoriesForStaffScope(
      viewer,
      worker.histories,
      workspace.managedFactoryIds,
    );
    for (const history of visibleHistories) uniqueHistories.set(history.id, history);
  }

  return [...uniqueHistories.values()];
}

function getScopedUsers(
  viewer: UserRecord,
  histories: EmploymentHistoryRecord[],
  fetchedUsers: UserRecord[],
) {
  const recruiterIds = new Set(
    histories.map((history) => history.recruiter_staff).filter((id): id is string => Boolean(id)),
  );
  const usersById = new Map(
    fetchedUsers.filter((user) => recruiterIds.has(user.id)).map((user) => [user.id, user]),
  );

  for (const history of histories) {
    const recruiter = history.expand?.recruiter_staff as UserRecord | undefined;
    if (recruiter?.id && recruiterIds.has(recruiter.id)) usersById.set(recruiter.id, recruiter);
  }

  if (recruiterIds.has(viewer.id)) usersById.set(viewer.id, viewer);

  return [...usersById.values()].sort((a, b) =>
    (a.full_name || a.username || "").localeCompare(b.full_name || b.username || "", "vi"),
  );
}

function getScopedFactories(
  histories: EmploymentHistoryRecord[],
  fetchedFactories: FactoryRecord[],
) {
  const factoryIds = new Set(
    histories.map((history) => history.factory).filter((id): id is string => Boolean(id)),
  );
  const factoriesById = new Map(
    fetchedFactories
      .filter((factory) => factoryIds.has(factory.id))
      .map((factory) => [factory.id, factory]),
  );

  for (const history of histories) {
    const factory = history.expand?.factory as FactoryRecord | undefined;
    if (factory?.id && factoryIds.has(factory.id)) factoriesById.set(factory.id, factory);
  }

  return [...factoriesById.values()].sort((a, b) => a.name.localeCompare(b.name, "vi"));
}

function StaffWorkforceDashboardPage() {
  const { user } = useAuth();
  const viewer = user as UserRecord | null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [histories, setHistories] = useState<EmploymentHistoryRecord[]>([]);
  const [factories, setFactories] = useState<FactoryRecord[]>([]);
  const [staffUsers, setStaffUsers] = useState<UserRecord[]>([]);
  const [reloadToken, setReloadToken] = useState(0);

  const load = useCallback(async () => {
    if (!viewer?.id || viewer.role !== "staff") return;

    setLoading(true);
    setError("");
    try {
      const [workspace, factoryRows, staffRows] = await Promise.all([
        fetchStaffWorkspace(viewer),
        fetchFactories().catch(() => [] as FactoryRecord[]),
        pb
          .collection("users")
          .getList<UserRecord>(1, 200, {
            filter: `role="staff" || role="admin"`,
            sort: "full_name,username",
          })
          .then((result) => result.items)
          .catch(() => [] as UserRecord[]),
      ]);
      const scopedHistories = getScopedHistories(viewer, workspace);

      setHistories(scopedHistories);
      setFactories(getScopedFactories(scopedHistories, factoryRows));
      setStaffUsers(getScopedUsers(viewer, scopedHistories, staffRows));
    } catch {
      setHistories([]);
      setFactories([]);
      setStaffUsers([]);
      setError("Không tải được dữ liệu nhân lực. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }, [viewer]);

  useEffect(() => {
    load();
  }, [load, reloadToken]);

  const cacheSignal = useStaffCacheSignal();
  useEffect(() => {
    if (!viewer?.id || viewer.role !== "staff" || cacheSignal === 0) return;

    const timer = setTimeout(async () => {
      const workspace = await fetchCachedStaffWorkspace(viewer);
      if (!workspace) return;

      const scopedHistories = getScopedHistories(viewer, workspace);
      setHistories(scopedHistories);
      setFactories((current) => getScopedFactories(scopedHistories, current));
      setStaffUsers((current) => getScopedUsers(viewer, scopedHistories, current));
    }, 150);

    return () => clearTimeout(timer);
  }, [cacheSignal, viewer]);

  const visibleFactories = useMemo(() => {
    const factoryIds = new Set(histories.map((history) => history.factory));
    return factories.filter((factory) => factoryIds.has(factory.id));
  }, [factories, histories]);

  const totalWorkers = useMemo(
    () => new Set(histories.map((history) => history.user)).size,
    [histories],
  );
  const workingUsers = useMemo(
    () =>
      new Set(
        histories
          .filter((history) => history.status === "working" && !history.leave_date)
          .map((history) => history.user),
      ).size,
    [histories],
  );
  const recruitedLastSevenDays = useMemo(() => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    return histories.filter((history) => {
      if (!history.join_date) return false;
      const joinDate = new Date(history.join_date);
      return !Number.isNaN(joinDate.getTime()) && joinDate >= sevenDaysAgo;
    }).length;
  }, [histories]);

  if (viewer?.role !== "staff") return null;

  return (
    <main
      data-staff-dashboard-content="nhan-luc"
      className="hidden min-h-[calc(100dvh-5rem)] min-w-0 bg-background desktop:block"
    >
      <div className="mx-auto w-full max-w-[110rem] space-y-6 px-8 py-7">
        <section id="nhan-luc" className="space-y-4 scroll-mt-28">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Nhân lực</h2>
              <p className="text-sm text-muted-foreground">
                Theo dõi tình hình tuyển dụng và lao động trong 7 ngày gần nhất.
              </p>
            </div>
          </div>

          <div className="sticky top-20 z-20 -mx-2 bg-background/95 px-2 py-2 backdrop-blur">
            <div className="grid grid-cols-4 gap-4">
              <DesktopSummaryCard label="Tổng lao động" value={totalWorkers} icon={Users} />
              <DesktopSummaryCard label="Còn đi làm" value={workingUsers} icon={CalendarCheck} />
              <DesktopSummaryCard
                label="Tuyển mới 7 ngày"
                value={recruitedLastSevenDays}
                icon={ClipboardCheck}
              />
              <DesktopSummaryCard
                label="Nhà máy"
                value={visibleFactories.length}
                icon={Building2}
              />
            </div>
          </div>

          <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-soft">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">Biểu đồ tuyển dụng 7 ngày</h3>
                <p className="text-xs text-muted-foreground">
                  Cột thể hiện tuyển mới, đường thể hiện số lao động còn đi làm.
                </p>
              </div>
              <Link
                to="/staff/workers"
                className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                Xem chi tiết
              </Link>
            </div>

            {loading ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                Đang tải dữ liệu nhân lực...
              </div>
            ) : error ? (
              <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-destructive/40 bg-destructive/5 text-center">
                <p className="text-sm text-destructive">{error}</p>
                <button
                  type="button"
                  onClick={() => setReloadToken((value) => value + 1)}
                  className="rounded-xl bg-primary px-4 py-2 text-xs font-medium text-primary-foreground"
                >
                  Thử lại
                </button>
              </div>
            ) : histories.length === 0 ? (
              <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed text-sm text-muted-foreground">
                Chưa có dữ liệu nhân lực.
              </div>
            ) : (
              <RecruitmentChart
                histories={histories}
                users={staffUsers}
                factories={visibleFactories}
              />
            )}
          </div>

          {!loading && !error && (
            <WorkforceInsightsCharts
              histories={histories}
              users={staffUsers}
              factories={visibleFactories}
            />
          )}
        </section>
      </div>
    </main>
  );
}

function DesktopSummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
