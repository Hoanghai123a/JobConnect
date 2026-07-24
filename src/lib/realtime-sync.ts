import type { UnsubscribeFunc } from "pocketbase";
import { pb, type UserRecord } from "./pocketbase";
import type { EmploymentHistoryRecord } from "./employment";
import type { CccdVersionRecord } from "./cccd-versions";
import type { FactoryRecord } from "./factories";
import type { MainHouseRecord } from "./main-houses";
import { buildScopedHistoryFilter } from "./staff-permissions";
import { syncStaffData } from "./staff-cache";
import {
  deleteCachedHistory,
  deleteCachedUser,
  deleteCachedCccdVersion,
  deleteCachedFactory,
  deleteCachedMainHouse,
  upsertCachedHistoryIfNewer,
  upsertCachedUserIfNewer,
  upsertCachedCccdVersionIfNewer,
  updateCachedFactory,
  updateCachedMainHouse,
  readCachedHistory,
  readCachedUser,
  getCachedUserIds,
  factoryExistsInCache,
  mainHouseExistsInCache,
} from "./staff-cache";

const SIGNAL_EVENT = "jobconnect:staff-cache-changed";
const CATCHUP_DEBOUNCE_MS = 5000;

type Action = "create" | "update" | "delete";
interface RealtimeEvent<T> {
  action: Action;
  record: T;
}

interface SyncState {
  viewerId: string;
  managedFactoryIds: Set<string>;
  unsubs: UnsubscribeFunc[];
  catchupTimer: number | null;
  visibilityHandler: (() => void) | null;
  onlineHandler: (() => void) | null;
}

let state: SyncState | null = null;

function dispatchSignal(detail: { collection: string; action: Action; id: string }) {
  try {
    window.dispatchEvent(new CustomEvent(SIGNAL_EVENT, { detail }));
  } catch {
    // ignore dispatch failures (e.g. SSR / no window)
  }
}

function isHistoryInScope(
  viewer: { id: string; role?: string },
  record: EmploymentHistoryRecord,
  managedFactoryIds: Set<string>,
): boolean {
  if (viewer.role === "admin") return true;
  if (record.recruiter_staff === viewer.id) return true;
  return managedFactoryIds.has(record.factory);
}

async function handleHistoryEvent(
  event: RealtimeEvent<EmploymentHistoryRecord>,
  viewer: { id: string; role?: string },
  managedFactoryIds: Set<string>,
) {
  const { action, record } = event;
  if (!record?.id) return;

  if (action === "delete") {
    await deleteCachedHistory(record.id);
    dispatchSignal({ collection: "employment_histories", action, id: record.id });
    return;
  }

  const inScope = isHistoryInScope(viewer, record, managedFactoryIds);
  if (!inScope) {
    const cached = await readCachedHistory(record.id);
    if (cached) {
      await deleteCachedHistory(record.id);
      dispatchSignal({ collection: "employment_histories", action: "delete", id: record.id });
    }
    return;
  }

  let relatedUser = record.expand?.user;
  if (!relatedUser && record.user) {
    relatedUser = await pb.collection("users").getOne<UserRecord>(record.user).catch(() => undefined);
  }

  const userChanged = relatedUser ? await upsertCachedUserIfNewer(relatedUser) : false;
  const historyChanged = await upsertCachedHistoryIfNewer(record);
  if (!historyChanged && !userChanged) {
    console.debug("[realtime-sync] skip stale echo history", record.id);
    return;
  }
  dispatchSignal({ collection: "employment_histories", action, id: record.id });
}

async function handleUserEvent(event: RealtimeEvent<UserRecord>) {
  const { action, record } = event;
  if (!record?.id) return;

  if (action === "delete") {
    await deleteCachedUser(record.id);
    dispatchSignal({ collection: "users", action, id: record.id });
    return;
  }

  const userIds = await getCachedUserIds();
  if (!userIds.has(record.id)) {
    const cached = await readCachedUser(record.id);
    if (!cached) return;
  }

  const changed = await upsertCachedUserIfNewer(record);
  if (!changed) {
    console.debug("[realtime-sync] skip stale echo user", record.id);
    return;
  }
  dispatchSignal({ collection: "users", action, id: record.id });
}

async function handleCccdVersionEvent(event: RealtimeEvent<CccdVersionRecord>) {
  const { action, record } = event;
  if (!record?.id) return;

  if (action === "delete") {
    await deleteCachedCccdVersion(record.id);
    dispatchSignal({ collection: "cccd_versions", action, id: record.id });
    return;
  }

  const userIds = await getCachedUserIds();
  if (!userIds.has(record.user)) return;

  const changed = await upsertCachedCccdVersionIfNewer(record);
  if (!changed) return;
  dispatchSignal({ collection: "cccd_versions", action, id: record.id });
}

async function handleFactoryEvent(event: RealtimeEvent<FactoryRecord>) {
  const { action, record } = event;
  if (!record?.id) return;

  if (action === "delete") {
    await deleteCachedFactory(record.id);
    dispatchSignal({ collection: "factories", action, id: record.id });
    return;
  }

  const exists = await factoryExistsInCache(record.id);
  if (!exists) return;

  await updateCachedFactory(record);
  dispatchSignal({ collection: "factories", action, id: record.id });
}

async function handleMainHouseEvent(event: RealtimeEvent<MainHouseRecord>) {
  const { action, record } = event;
  if (!record?.id) return;

  if (action === "delete") {
    await deleteCachedMainHouse(record.id);
    dispatchSignal({ collection: "main_houses", action, id: record.id });
    return;
  }

  const exists = await mainHouseExistsInCache(record.id);
  if (!exists) return;

  await updateCachedMainHouse(record);
  dispatchSignal({ collection: "main_houses", action, id: record.id });
}

export async function startStaffRealtimeSync(
  viewer: UserRecord,
  managedFactoryIds: Set<string>,
): Promise<void> {
  if (state && state.viewerId === viewer.id) {
    return;
  }
  if (state) {
    await stopStaffRealtimeSync();
  }

  const unsubs: UnsubscribeFunc[] = [];

  try {
    const historyFilter = buildScopedHistoryFilter(viewer, managedFactoryIds);
    const historyUnsub = await pb
      .collection("employment_histories")
      .subscribe(
        "*",
        (e) =>
          handleHistoryEvent(
            e as RealtimeEvent<EmploymentHistoryRecord>,
            { id: viewer.id, role: viewer.role },
            managedFactoryIds,
          ).catch((err) => console.warn("[realtime-sync] history handler", err)),
        {
          filter: historyFilter || undefined,
          expand: "user,factory,recruiter_staff,main_house",
        },
      );
    unsubs.push(historyUnsub);

    const userUnsub = await pb
      .collection("users")
      .subscribe("*", (e) =>
        handleUserEvent(e as RealtimeEvent<UserRecord>).catch((err) =>
          console.warn("[realtime-sync] user handler", err),
        ),
      );
    unsubs.push(userUnsub);

    const cccdUnsub = await pb
      .collection("cccd_versions")
      .subscribe("*", (e) =>
        handleCccdVersionEvent(e as RealtimeEvent<CccdVersionRecord>).catch((err) =>
          console.warn("[realtime-sync] cccd handler", err),
        ),
      );
    unsubs.push(cccdUnsub);

    const factoryUnsub = await pb
      .collection("factories")
      .subscribe("*", (e) =>
        handleFactoryEvent(e as RealtimeEvent<FactoryRecord>).catch((err) =>
          console.warn("[realtime-sync] factory handler", err),
        ),
      );
    unsubs.push(factoryUnsub);

    const mainHouseUnsub = await pb
      .collection("main_houses")
      .subscribe("*", (e) =>
        handleMainHouseEvent(e as RealtimeEvent<MainHouseRecord>).catch((err) =>
          console.warn("[realtime-sync] main-house handler", err),
        ),
      );
    unsubs.push(mainHouseUnsub);
  } catch (error) {
    console.warn("[realtime-sync] failed to subscribe", error);
    for (const unsub of unsubs) {
      try {
        await unsub();
      } catch {
        // ignore unsubscribe errors during cleanup
      }
    }
    return;
  }

  const visibilityHandler = () => {
    if (document.visibilityState === "visible") scheduleCatchUp(viewer);
  };
  const onlineHandler = () => scheduleCatchUp(viewer);
  document.addEventListener("visibilitychange", visibilityHandler);
  window.addEventListener("online", onlineHandler);

  state = {
    viewerId: viewer.id,
    managedFactoryIds,
    unsubs,
    catchupTimer: null,
    visibilityHandler,
    onlineHandler,
  };
}

export async function stopStaffRealtimeSync(): Promise<void> {
  if (!state) return;
  const current = state;
  state = null;

  if (current.catchupTimer !== null) {
    window.clearTimeout(current.catchupTimer);
  }
  if (current.visibilityHandler) {
    document.removeEventListener("visibilitychange", current.visibilityHandler);
  }
  if (current.onlineHandler) {
    window.removeEventListener("online", current.onlineHandler);
  }
  for (const unsub of current.unsubs) {
    try {
      await unsub();
    } catch (error) {
      console.warn("[realtime-sync] unsubscribe failed", error);
    }
  }
}

function scheduleCatchUp(viewer: UserRecord) {
  if (!state) return;
  if (state.catchupTimer !== null) {
    window.clearTimeout(state.catchupTimer);
  }
  state.catchupTimer = window.setTimeout(() => {
    if (state) state.catchupTimer = null;
    catchUpStaffRealtimeSync(viewer).catch((err) =>
      console.warn("[realtime-sync] catch-up failed", err),
    );
  }, CATCHUP_DEBOUNCE_MS);
}

export async function catchUpStaffRealtimeSync(viewer: UserRecord): Promise<void> {
  if (!state) return;
  try {
    const historyFilter = buildScopedHistoryFilter(viewer, state.managedFactoryIds);
    await syncStaffData({
      historyFilter,
      useCache: true,
      includeCccdVersions: true,
    });
    dispatchSignal({ collection: "employment_histories", action: "update", id: "__catchup__" });
    console.debug("[realtime-sync] catch-up done");
  } catch (error) {
    console.warn("[realtime-sync] catch-up error", error);
  }
}
