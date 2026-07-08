import { type UserRecord } from "./pocketbase";
import {
  getLatestEmploymentHistory,
  isHistoryWithinLast90Days,
  type EmploymentHistoryRecord,
} from "./employment";
import { fetchFactoryManagers, isFactoryAssignmentActive } from "./factories";
import {
  readCachedStaffData,
  syncStaffData,
  fetchUsersBatched,
} from "./staff-cache";
import { escapePb, relationInFilter } from "./delegations";

export type StaffVisibilityReason = "qlnm" | "nvtd";

export interface StaffWorkerRecord {
  user: UserRecord;
  histories: EmploymentHistoryRecord[];
  latestHistory: EmploymentHistoryRecord | null;
  recentHistories: EmploymentHistoryRecord[];
  reasons: StaffVisibilityReason[];
  isRecentRecruiter: boolean;
  canReportAdvance: boolean;
  canViewPayroll: boolean;
  canReportLeave: boolean;
  canReportJoin: boolean;
}

const RECENT_RECRUITER_HISTORY_LIMIT = 3;

export function canAccessStaffWorkspace(user?: Partial<UserRecord> | null) {
  return user?.role === "staff" || user?.role === "admin";
}

export function getStaffReasonsForHistory(
  _staffId: string,
  history: EmploymentHistoryRecord,
  managedFactoryIds: Set<string>,
) {
  const reasons = new Set<StaffVisibilityReason>();
  if (managedFactoryIds.has(history.factory)) reasons.add("qlnm");
  return [...reasons];
}

function toTimestamp(value?: string) {
  const time = new Date(value || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function compareRecentHistories(a: EmploymentHistoryRecord, b: EmploymentHistoryRecord) {
  const joinDiff = toTimestamp(b.join_date) - toTimestamp(a.join_date);
  if (joinDiff !== 0) return joinDiff;

  return toTimestamp(b.leave_date || b.created) - toTimestamp(a.leave_date || a.created);
}

function toDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function buildScopedHistoryFilter(viewer: UserRecord, managedFactoryIds: Set<string>) {
  if (viewer.role === "admin") return "";

  const qlnmFilters: string[] = [];
  if (managedFactoryIds.size > 0) {
    const referenceDate = new Date();
    const windowStart = new Date(referenceDate);
    windowStart.setDate(windowStart.getDate() - 90);
    const dateFilter = [
      `join_date <= "${toDateOnly(referenceDate)}"`,
      `(status="working" || leave_date >= "${toDateOnly(windowStart)}")`,
    ].join(" && ");
    qlnmFilters.push(`(${relationInFilter("factory", [...managedFactoryIds])}) && (${dateFilter})`);
  }

  const recruiterFilter = `recruiter_staff="${escapePb(viewer.id)}"`;
  return [...qlnmFilters, recruiterFilter].map((item) => `(${item})`).join(" || ");
}

export function getRecentRecruiterHistories(histories: EmploymentHistoryRecord[]) {
  return [...histories].sort(compareRecentHistories).slice(0, RECENT_RECRUITER_HISTORY_LIMIT);
}

export function isRecentRecruiter(
  viewer: Partial<UserRecord> | null | undefined,
  histories: EmploymentHistoryRecord[],
) {
  if (!viewer?.id || viewer.role !== "staff") return false;
  return getRecentRecruiterHistories(histories).some(
    (history) => history.recruiter_staff === viewer.id,
  );
}

export function canViewHistoryInStaffScope(
  viewer: Partial<UserRecord> | null | undefined,
  history: EmploymentHistoryRecord,
  allWorkerHistories: EmploymentHistoryRecord[],
  managedFactoryIds: Set<string>,
) {
  if (viewer?.role === "admin") return true;
  if (!viewer?.id || viewer.role !== "staff") return false;

  const recentRecruiterHistoryIds = new Set(
    getRecentRecruiterHistories(allWorkerHistories)
      .filter((item) => item.recruiter_staff === viewer.id)
      .map((item) => item.id),
  );
  if (recentRecruiterHistoryIds.has(history.id)) return true;

  return managedFactoryIds.has(history.factory) && isHistoryWithinLast90Days(history);
}

export function filterHistoriesForStaffScope(
  viewer: Partial<UserRecord> | null | undefined,
  histories: EmploymentHistoryRecord[],
  managedFactoryIds: Set<string>,
) {
  return histories.filter((history) =>
    canViewHistoryInStaffScope(viewer, history, histories, managedFactoryIds),
  );
}

export function canReportAdvance(
  viewer: Partial<UserRecord> | null | undefined,
  histories: EmploymentHistoryRecord[],
) {
  return viewer?.role === "admin" || isRecentRecruiter(viewer, histories);
}

export function canViewPayroll(
  viewer: Partial<UserRecord> | null | undefined,
  histories: EmploymentHistoryRecord[],
) {
  return canReportAdvance(viewer, histories);
}

export function canReportLeave(
  viewer: Partial<UserRecord> | null | undefined,
  activeHistory: EmploymentHistoryRecord | null,
  histories: EmploymentHistoryRecord[],
  managedFactoryIds: Set<string>,
) {
  if (!viewer?.id || !activeHistory) return false;
  if (viewer.role === "admin") return true;
  if (isRecentRecruiter(viewer, histories)) return true;
  return viewer.role === "staff" && managedFactoryIds.has(activeHistory.factory);
}

export function canReportJoin(
  viewer: Partial<UserRecord> | null | undefined,
  histories: EmploymentHistoryRecord[],
  managedFactoryIds: Set<string>,
  targetFactoryId?: string,
) {
  if (!viewer?.id) return false;
  if (viewer.role === "admin") return true;
  if (isRecentRecruiter(viewer, histories)) return true;
  if (viewer.role !== "staff") return false;
  if (!targetFactoryId) return managedFactoryIds.size > 0;
  return managedFactoryIds.has(targetFactoryId);
}

function buildWorkspace(
  viewer: UserRecord,
  histories: EmploymentHistoryRecord[],
  users: UserRecord[],
  managedFactoryIds: Set<string>,
) {
  const grouped = new Map<string, EmploymentHistoryRecord[]>();
  for (const history of histories) {
    const bucket = grouped.get(history.user) || [];
    bucket.push(history);
    grouped.set(history.user, bucket);
  }

  const workerMap = new Map(users.map((item) => [item.id, item]));

  const workers = [...grouped.entries()]
    .map(([userId, userHistories]) => {
      const user = workerMap.get(userId);
      if (!user) return null;

      const visibleHistories = filterHistoriesForStaffScope(
        viewer,
        userHistories,
        managedFactoryIds,
      );
      if (!visibleHistories.length) return null;

      const latestHistory = getLatestEmploymentHistory(visibleHistories);
      const activeHistory =
        visibleHistories.find((item) => item.status === "working" && !item.leave_date) || null;
      const recentRecruiter = isRecentRecruiter(viewer, visibleHistories);
      const reasons = new Set<StaffVisibilityReason>();
      for (const history of visibleHistories) {
        for (const reason of getStaffReasonsForHistory(viewer.id, history, managedFactoryIds)) {
          reasons.add(reason);
        }
      }
      if (recentRecruiter) reasons.add("nvtd");

      if (viewer.role === "admin" && reasons.size === 0) {
        reasons.add("qlnm");
        reasons.add("nvtd");
      }

      if (!reasons.size && viewer.role !== "admin") return null;

      const sortedHistories = [...visibleHistories].sort(compareRecentHistories);

      return {
        user,
        histories: sortedHistories,
        latestHistory,
        recentHistories: getRecentRecruiterHistories(visibleHistories),
        reasons: [...reasons],
        isRecentRecruiter: recentRecruiter,
        canReportAdvance: canReportAdvance(viewer, visibleHistories),
        canViewPayroll: canViewPayroll(viewer, visibleHistories),
        canReportLeave: canReportLeave(viewer, activeHistory, visibleHistories, managedFactoryIds),
        canReportJoin: canReportJoin(viewer, visibleHistories, managedFactoryIds),
      } satisfies StaffWorkerRecord;
    })
    .filter(Boolean)
    .sort((a, b) => {
      const nameA = (a!.user.full_name || a!.user.username || "").toLowerCase();
      const nameB = (b!.user.full_name || b!.user.username || "").toLowerCase();
      return nameA.localeCompare(nameB, "vi");
    }) as StaffWorkerRecord[];

  return { managedFactoryIds, workers };
}

export async function fetchStaffWorkspace(
  viewer: UserRecord,
  opts?: { onCacheReady?: (result: StaffWorkspaceResult) => void },
) {
  const managers = await fetchFactoryManagers(viewer.id);
  const managedFactoryIds = new Set(
    managers.filter((item) => isFactoryAssignmentActive(item)).map((item) => item.factory),
  );

  const useCache = viewer.role === "admin";
  const cached = useCache ? await readCachedStaffData() : null;
  if (cached) {
    const cachedResult = buildWorkspace(viewer, cached.histories, cached.users, managedFactoryIds);
    opts?.onCacheReady?.(cachedResult);
  }

  const synced = await syncStaffData({
    historyFilter: buildScopedHistoryFilter(viewer, managedFactoryIds),
    useCache,
    includeCccdVersions: useCache,
  });

  const userIds = [...new Set(synced.histories.map((h) => h.user).filter(Boolean))];
  const cachedUserIds = new Set(synced.users.map((u) => u.id));
  const missingIds = userIds.filter((id) => !cachedUserIds.has(id));
  if (missingIds.length) {
    const extra = await fetchUsersBatched(missingIds);
    synced.users.push(...extra);
  }

  return buildWorkspace(viewer, synced.histories, synced.users, managedFactoryIds);
}

export type StaffWorkspaceResult = ReturnType<typeof buildWorkspace>;
