import { pb, type UserRecord } from "./pocketbase";
import {
  fetchEmploymentHistories,
  getLatestEmploymentHistory,
  isHistoryWithinLast90Days,
  type EmploymentHistoryRecord,
} from "./employment";
import { fetchFactoryManagers, isFactoryAssignmentActive } from "./factories";
import { relationInFilter } from "./delegations";

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

export async function fetchStaffWorkspace(viewer: UserRecord) {
  const [histories, managers] = await Promise.all([
    fetchEmploymentHistories(),
    fetchFactoryManagers(viewer.id),
  ]);

  const managedFactoryIds = new Set(
    managers.filter((item) => isFactoryAssignmentActive(item)).map((item) => item.factory),
  );

  const grouped = new Map<string, EmploymentHistoryRecord[]>();

  for (const history of histories) {
    const bucket = grouped.get(history.user) || [];
    bucket.push(history);
    grouped.set(history.user, bucket);
  }

  const userIds = [...grouped.keys()];
  if (!userIds.length) {
    return {
      managedFactoryIds,
      workers: [] as StaffWorkerRecord[],
    };
  }

  const userRes = await pb.collection("users").getList(1, 500, {
    filter: relationInFilter("id", userIds),
    sort: "full_name,username",
  });
  const users = userRes.items as unknown as UserRecord[];

  const workerMap = new Map(users.map((item) => [item.id, item]));

  const workers = [...grouped.entries()]
    .map(([userId, userHistories]) => {
      const user = workerMap.get(userId);
      if (!user) return null;

      const latestHistory = getLatestEmploymentHistory(userHistories);
      const activeHistory =
        userHistories.find((item) => item.status === "working" && !item.leave_date) || null;
      const recentRecruiter = isRecentRecruiter(viewer, userHistories);
      const reasons = new Set<StaffVisibilityReason>();
      for (const history of userHistories) {
        if (!isHistoryWithinLast90Days(history) && !recentRecruiter && viewer.role !== "admin") {
          continue;
        }
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

      const sortedHistories = [...userHistories].sort(compareRecentHistories);

      return {
        user,
        histories: sortedHistories,
        latestHistory,
        recentHistories: getRecentRecruiterHistories(userHistories),
        reasons: [...reasons],
        isRecentRecruiter: recentRecruiter,
        canReportAdvance: canReportAdvance(viewer, userHistories),
        canViewPayroll: canViewPayroll(viewer, userHistories),
        canReportLeave: canReportLeave(viewer, activeHistory, userHistories, managedFactoryIds),
        canReportJoin: canReportJoin(viewer, userHistories, managedFactoryIds),
      } satisfies StaffWorkerRecord;
    })
    .filter(Boolean)
    .sort((a, b) => {
      const nameA = (a!.user.full_name || a!.user.username || "").toLowerCase();
      const nameB = (b!.user.full_name || b!.user.username || "").toLowerCase();
      return nameA.localeCompare(nameB, "vi");
    }) as StaffWorkerRecord[];

  return {
    managedFactoryIds,
    workers,
  };
}
