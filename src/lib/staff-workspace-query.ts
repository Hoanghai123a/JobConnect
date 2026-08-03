import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchFactories, type FactoryRecord } from "./factories";
import { fetchMainHouses, type MainHouseRecord } from "./main-houses";
import { pb, type UserRecord } from "./pocketbase";
import { readCachedAuxData, writeCachedAuxData } from "./staff-cache";
import { fetchStaffWorkspace, type StaffWorkspaceResult } from "./staff-permissions";

const WORKSPACE_STALE_TIME = 30_000;
const AUX_STALE_TIME = 5 * 60_000;
const CACHE_GC_TIME = 30 * 60_000;

export const STAFF_WORKSPACE_QUERY_ROOT = ["staff-workspace"] as const;
export const STAFF_DIRECTORY_AUX_QUERY_ROOT = ["staff-directory-aux"] as const;
export const STAFF_DIRECTORY_STATE_PREFIX = "jobconnect:staff-worker-directory";

export interface StaffDirectoryAuxData {
  factories: FactoryRecord[];
  mainHouses: MainHouseRecord[];
  staffUsers: UserRecord[];
}

export function staffWorkspaceQueryKey(viewer: Pick<UserRecord, "id" | "role">) {
  return [...STAFF_WORKSPACE_QUERY_ROOT, viewer.id, viewer.role || ""] as const;
}

export function staffDirectoryAuxQueryKey(viewer: Pick<UserRecord, "id" | "role">) {
  return [...STAFF_DIRECTORY_AUX_QUERY_ROOT, viewer.id, viewer.role || ""] as const;
}

export function useStaffWorkspaceQuery(viewer: UserRecord | null) {
  const queryClient = useQueryClient();
  const queryKey = viewer
    ? staffWorkspaceQueryKey(viewer)
    : ([...STAFF_WORKSPACE_QUERY_ROOT, "anonymous", ""] as const);

  return useQuery({
    queryKey,
    enabled: Boolean(viewer?.id),
    queryFn: async (): Promise<StaffWorkspaceResult> => {
      if (!viewer) throw new Error("Chưa xác định tài khoản nhân sự");

      return fetchStaffWorkspace(viewer, {
        onCacheReady: (cachedWorkspace) => {
          queryClient.setQueryData(queryKey, cachedWorkspace);
        },
      });
    },
    staleTime: WORKSPACE_STALE_TIME,
    gcTime: CACHE_GC_TIME,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

export function useStaffDirectoryAuxQuery(viewer: UserRecord | null) {
  const queryClient = useQueryClient();
  const queryKey = viewer
    ? staffDirectoryAuxQueryKey(viewer)
    : ([...STAFF_DIRECTORY_AUX_QUERY_ROOT, "anonymous", ""] as const);

  return useQuery({
    queryKey,
    enabled: Boolean(viewer?.id),
    queryFn: async (): Promise<StaffDirectoryAuxData> => {
      if (!viewer) throw new Error("Chưa xác định tài khoản nhân sự");

      const cached = await readCachedAuxData();
      if (cached) queryClient.setQueryData(queryKey, cached);

      const [factoriesResult, mainHousesResult, staffUsersResult] = await Promise.allSettled([
        fetchFactories(),
        fetchMainHouses(),
        pb.collection("users").getFullList<UserRecord>({
          filter: `role="staff" || role="admin"`,
          sort: "full_name,username",
        }),
      ]);

      const failedResults = [factoriesResult, mainHousesResult, staffUsersResult].filter(
        (result) => result.status === "rejected",
      );
      if (failedResults.length === 3) {
        throw failedResults[0].reason;
      }

      const data: StaffDirectoryAuxData = {
        factories:
          factoriesResult.status === "fulfilled" ? factoriesResult.value : cached?.factories || [],
        mainHouses:
          mainHousesResult.status === "fulfilled"
            ? mainHousesResult.value
            : cached?.mainHouses || [],
        staffUsers:
          staffUsersResult.status === "fulfilled"
            ? staffUsersResult.value
            : cached?.staffUsers || [],
      };

      await writeCachedAuxData(data);
      return data;
    },
    staleTime: AUX_STALE_TIME,
    gcTime: CACHE_GC_TIME,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
