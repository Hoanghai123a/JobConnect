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
  canOperateLatestHistory: boolean;
}

export function canAccessStaffWorkspace(user?: Partial<UserRecord> | null) {
  return user?.role === "staff" || user?.role === "admin";
}

export function getStaffReasonsForHistory(
  staffId: string,
  history: EmploymentHistoryRecord,
  managedFactoryIds: Set<string>,
) {
  const reasons = new Set<StaffVisibilityReason>();
  if (managedFactoryIds.has(history.factory)) reasons.add("qlnm");
  if (history.recruiter_staff === staffId) reasons.add("nvtd");
  return [...reasons];
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
    if (!isHistoryWithinLast90Days(history)) continue;

    const reasons =
      viewer.role === "admin"
        ? (["qlnm", "nvtd"] as StaffVisibilityReason[])
        : getStaffReasonsForHistory(viewer.id, history, managedFactoryIds);
    if (!reasons.length && viewer.role !== "admin") continue;

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

  const users = (await pb.collection("users").getFullList({
    filter: relationInFilter("id", userIds),
    sort: "full_name,username",
  })) as unknown as UserRecord[];

  const workerMap = new Map(users.map((item) => [item.id, item]));

  const workers = [...grouped.entries()]
    .map(([userId, userHistories]) => {
      const user = workerMap.get(userId);
      if (!user) return null;

      const latestHistory = getLatestEmploymentHistory(userHistories);
      const reasons = new Set<StaffVisibilityReason>();
      for (const history of userHistories) {
        for (const reason of getStaffReasonsForHistory(viewer.id, history, managedFactoryIds)) {
          reasons.add(reason);
        }
      }

      if (viewer.role === "admin" && reasons.size === 0) {
        reasons.add("qlnm");
        reasons.add("nvtd");
      }

      return {
        user,
        histories: userHistories.sort(
          (a, b) => new Date(b.join_date || b.created || 0).getTime() - new Date(a.join_date || a.created || 0).getTime(),
        ),
        latestHistory,
        recentHistories: userHistories,
        reasons: [...reasons],
        canOperateLatestHistory:
          viewer.role === "admin" || latestHistory?.recruiter_staff === viewer.id,
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
