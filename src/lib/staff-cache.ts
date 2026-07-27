import { pb, type UserRecord } from "./pocketbase";
import { relationInFilter } from "./delegations";
import type { EmploymentHistoryRecord } from "./employment";
import type { CccdVersionRecord } from "./cccd-versions";
import type { FactoryRecord } from "./factories";
import type { MainHouseRecord } from "./main-houses";

const DB_NAME = "jobconnect-staff-cache";
const DB_VERSION = 5;
const STORE_HISTORIES = "employment_histories";
const STORE_USERS = "users";
const STORE_CCCD_VERSIONS = "cccd_versions";
const STORE_FACTORIES = "factories";
const STORE_MAIN_HOUSES = "main_houses";
const STORE_STAFF_USERS = "staff_users";
const STORE_META = "_meta";
const BATCH_SIZE = 50;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_HISTORIES)) {
        db.createObjectStore(STORE_HISTORIES, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_USERS)) {
        db.createObjectStore(STORE_USERS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_CCCD_VERSIONS)) {
        db.createObjectStore(STORE_CCCD_VERSIONS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_FACTORIES)) {
        db.createObjectStore(STORE_FACTORIES, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_MAIN_HOUSES)) {
        db.createObjectStore(STORE_MAIN_HOUSES, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_STAFF_USERS)) {
        db.createObjectStore(STORE_STAFF_USERS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META);
      }
      if (request.oldVersion < 5) {
        for (const store of [
          STORE_HISTORIES, STORE_USERS, STORE_CCCD_VERSIONS,
          STORE_FACTORIES, STORE_MAIN_HOUSES, STORE_STAFF_USERS, STORE_META,
        ]) {
          if (db.objectStoreNames.contains(store)) request.transaction?.objectStore(store).clear();
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbGetAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPutMany<T>(db: IDBDatabase, store: string, items: T[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const os = tx.objectStore(store);
    for (const item of items) os.put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbPut(db: IDBDatabase, store: string, value: unknown, key?: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbGet<T>(db: IDBDatabase, store: string, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(db: IDBDatabase, store: string, key: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function usersFromExpandedHistories(histories: EmploymentHistoryRecord[]): UserRecord[] {
  const map = new Map<string, UserRecord>();
  for (const history of histories) {
    const user = history.expand?.user;
    if (user?.id) map.set(user.id, user);
  }
  return [...map.values()];
}

function idbClear(db: IDBDatabase, store: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function fetchUsersBatched(userIds: string[]): Promise<UserRecord[]> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return [];

  const results: UserRecord[] = [];
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);
    const items = (await pb.collection("users").getFullList({
      filter: relationInFilter("id", batch),
      sort: "full_name,username",
    })) as unknown as UserRecord[];
    results.push(...items);
  }
  return results;
}

async function getLastSyncAt(db: IDBDatabase): Promise<string> {
  const val = await idbGet<string>(db, STORE_META, "lastSyncAt");
  return val || "";
}

async function setLastSyncAt(db: IDBDatabase, timestamp: string): Promise<void> {
  await idbPut(db, STORE_META, timestamp, "lastSyncAt");
}

function getLatestUpdatedAt(
  records: Array<{ updated?: string }>,
  fallback = "",
): string {
  return records.reduce((latest, record) => {
    const updated = record.updated || "";
    return updated > latest ? updated : latest;
  }, fallback);
}

export async function readCachedStaffData(): Promise<{
  histories: EmploymentHistoryRecord[];
  users: UserRecord[];
} | null> {
  try {
    const db = await openDB();
    const lastSync = await getLastSyncAt(db);
    if (!lastSync) return null;

    const histories = await idbGetAll<EmploymentHistoryRecord>(db, STORE_HISTORIES);
    const users = await idbGetAll<UserRecord>(db, STORE_USERS);
    if (!histories.length) return null;
    return { histories, users };
  } catch {
    return null;
  }
}

export async function syncStaffData(opts?: {
  historyFilter?: string;
  useCache?: boolean;
  includeCccdVersions?: boolean;
  hydrateCache?: boolean;
}): Promise<{
  histories: EmploymentHistoryRecord[];
  users: UserRecord[];
}> {
  const db = await openDB();
  const useCache = opts?.useCache ?? true;
  const includeCccdVersions = opts?.includeCccdVersions ?? true;
  const lastSync = useCache ? await getLastSyncAt(db) : "";

  const filters = [opts?.historyFilter, lastSync ? `updated>="${lastSync}"` : ""].filter(Boolean);
  const historyFilter = filters.length ? filters.map((item) => `(${item})`).join(" && ") : "";
  const freshHistories = (await pb.collection("employment_histories").getFullList({
    filter: historyFilter,
    sort: "-join_date,-created",
    expand: "user,factory,recruiter_staff,main_house",
  })) as unknown as EmploymentHistoryRecord[];
  const expandedUsers = usersFromExpandedHistories(freshHistories);

  if (!useCache) {
    const userIds = [...new Set(freshHistories.map((h) => h.user).filter(Boolean))];
    const expandedUserIds = new Set(expandedUsers.map((u) => u.id));
    const missingIds = userIds.filter((id) => !expandedUserIds.has(id));
    const fetched = await fetchUsersBatched(missingIds).catch(() => []);
    const users = [...expandedUsers, ...fetched];

    if (opts?.hydrateCache) {
      if (freshHistories.length) {
        await idbPutMany(db, STORE_HISTORIES, freshHistories);
      }
      if (users.length) {
        await idbPutMany(db, STORE_USERS, users);
      }
      const latestHistoryUpdate = getLatestUpdatedAt(freshHistories);
      if (latestHistoryUpdate) {
        await setLastSyncAt(db, latestHistoryUpdate);
      }
    }

    return { histories: freshHistories, users };
  }

  if (freshHistories.length) {
    await idbPutMany(db, STORE_HISTORIES, freshHistories);
  }
  if (expandedUsers.length) {
    await idbPutMany(db, STORE_USERS, expandedUsers);
  }

  const allHistories = await idbGetAll<EmploymentHistoryRecord>(db, STORE_HISTORIES);

  const userIds = [...new Set(allHistories.map((h) => h.user).filter(Boolean))];

  // A user profile can change without touching employment_histories. Refresh every
  // worker already present in the permitted history scope so a page reload cannot
  // keep serving a stale IndexedDB user record. The query remains limited to the
  // scoped user ids instead of listing every recently updated account.
  const refreshedUsers = await fetchUsersBatched(userIds).catch((error) => {
    console.warn("[staff-cache] scoped user refresh failed", error);
    return [] as UserRecord[];
  });

  if (refreshedUsers.length) {
    await idbPutMany(db, STORE_USERS, refreshedUsers);
  }

  if (includeCccdVersions) {
    const cccdVerFilter = lastSync ? `updated>"${lastSync}"` : "";
    const freshCccdVersions = (await pb
      .collection("cccd_versions")
      .getFullList({
        filter: cccdVerFilter,
        sort: "-created",
      })
      .catch(() => [])) as unknown as CccdVersionRecord[];

    if (freshCccdVersions.length) {
      await idbPutMany(db, STORE_CCCD_VERSIONS, freshCccdVersions);
    }
  }

  const allUsers = await idbGetAll<UserRecord>(db, STORE_USERS);
  const latestHistoryUpdate = getLatestUpdatedAt(freshHistories, lastSync);
  if (latestHistoryUpdate) {
    await setLastSyncAt(db, latestHistoryUpdate);
  }

  return { histories: allHistories, users: allUsers };
}

export async function updateCachedHistory(record: EmploymentHistoryRecord): Promise<boolean> {
  try {
    const db = await openDB();
    await idbPut(db, STORE_HISTORIES, record);
    return true;
  } catch (error) {
    console.warn("[staff-cache] updateCachedHistory failed", error);
    return false;
  }
}

export async function updateCachedUser(record: UserRecord): Promise<boolean> {
  try {
    const db = await openDB();
    await idbPut(db, STORE_USERS, record);
    return true;
  } catch (error) {
    console.warn("[staff-cache] updateCachedUser failed", error);
    return false;
  }
}

export async function updateCachedCccdVersion(record: CccdVersionRecord): Promise<void> {
  try {
    const db = await openDB();
    await idbPut(db, STORE_CCCD_VERSIONS, record);
  } catch {}
}

export async function clearStaffCache(): Promise<void> {
  try {
    const db = await openDB();
    await idbClear(db, STORE_HISTORIES);
    await idbClear(db, STORE_USERS);
    await idbClear(db, STORE_CCCD_VERSIONS);
    await idbClear(db, STORE_FACTORIES);
    await idbClear(db, STORE_MAIN_HOUSES);
    await idbClear(db, STORE_STAFF_USERS);
    await idbClear(db, STORE_META);
  } catch {}
}

export function buildScopeFingerprint(viewerId: string, managedFactoryIds: Set<string>): string {
  return [viewerId, ...[...managedFactoryIds].sort()].join("|");
}

export async function isCacheScopeValid(currentFingerprint: string): Promise<boolean> {
  try {
    const db = await openDB();
    const stored = await idbGet<string>(db, STORE_META, "scopeFingerprint");
    return stored === currentFingerprint;
  } catch {
    return false;
  }
}

export async function saveScopeFingerprint(fingerprint: string): Promise<void> {
  try {
    const db = await openDB();
    await idbPut(db, STORE_META, fingerprint, "scopeFingerprint");
  } catch {}
}

export async function readCachedAuxData(): Promise<{
  factories: FactoryRecord[];
  mainHouses: MainHouseRecord[];
  staffUsers: UserRecord[];
} | null> {
  try {
    const db = await openDB();
    const factories = await idbGetAll<FactoryRecord>(db, STORE_FACTORIES);
    const mainHouses = await idbGetAll<MainHouseRecord>(db, STORE_MAIN_HOUSES);
    const staffUsers = await idbGetAll<UserRecord>(db, STORE_STAFF_USERS);
    if (!factories.length) return null;
    return { factories, mainHouses, staffUsers };
  } catch {
    return null;
  }
}

export async function writeCachedAuxData(data: {
  factories: FactoryRecord[];
  mainHouses: MainHouseRecord[];
  staffUsers: UserRecord[];
}): Promise<void> {
  try {
    const db = await openDB();
    await idbPutMany(db, STORE_FACTORIES, data.factories);
    await idbPutMany(db, STORE_MAIN_HOUSES, data.mainHouses);
    await idbPutMany(db, STORE_STAFF_USERS, data.staffUsers);
  } catch {}
}

export async function idbPutManyHistories(items: EmploymentHistoryRecord[]): Promise<void> {
  try {
    const db = await openDB();
    await idbPutMany(db, STORE_HISTORIES, items);
  } catch {}
}

export async function deleteCachedHistory(id: string): Promise<void> {
  try {
    const db = await openDB();
    await idbDelete(db, STORE_HISTORIES, id);
  } catch (error) {
    console.warn("[staff-cache] deleteCachedHistory failed", error);
  }
}

export async function deleteCachedUser(id: string): Promise<void> {
  try {
    const db = await openDB();
    await idbDelete(db, STORE_USERS, id);
  } catch (error) {
    console.warn("[staff-cache] deleteCachedUser failed", error);
  }
}

export async function deleteCachedCccdVersion(id: string): Promise<void> {
  try {
    const db = await openDB();
    await idbDelete(db, STORE_CCCD_VERSIONS, id);
  } catch (error) {
    console.warn("[staff-cache] deleteCachedCccdVersion failed", error);
  }
}

export async function deleteCachedFactory(id: string): Promise<void> {
  try {
    const db = await openDB();
    await idbDelete(db, STORE_FACTORIES, id);
  } catch (error) {
    console.warn("[staff-cache] deleteCachedFactory failed", error);
  }
}

export async function deleteCachedMainHouse(id: string): Promise<void> {
  try {
    const db = await openDB();
    await idbDelete(db, STORE_MAIN_HOUSES, id);
  } catch (error) {
    console.warn("[staff-cache] deleteCachedMainHouse failed", error);
  }
}

export async function readCachedHistory(id: string): Promise<EmploymentHistoryRecord | undefined> {
  try {
    const db = await openDB();
    return await idbGet<EmploymentHistoryRecord>(db, STORE_HISTORIES, id);
  } catch {
    return undefined;
  }
}

export async function readCachedUser(id: string): Promise<UserRecord | undefined> {
  try {
    const db = await openDB();
    return await idbGet<UserRecord>(db, STORE_USERS, id);
  } catch {
    return undefined;
  }
}

export async function getCachedUserIds(): Promise<Set<string>> {
  try {
    const db = await openDB();
    const histories = await idbGetAll<EmploymentHistoryRecord>(db, STORE_HISTORIES);
    const users = await idbGetAll<UserRecord>(db, STORE_USERS);
    const ids = new Set<string>();
    for (const h of histories) if (h.user) ids.add(h.user);
    for (const u of users) if (u.id) ids.add(u.id);
    return ids;
  } catch {
    return new Set();
  }
}

export async function upsertCachedHistoryIfNewer(
  record: EmploymentHistoryRecord,
): Promise<boolean> {
  try {
    const db = await openDB();
    const cached = await idbGet<EmploymentHistoryRecord>(db, STORE_HISTORIES, record.id);
    if (cached?.updated && record.updated && cached.updated >= record.updated) return false;
    await idbPut(db, STORE_HISTORIES, record);
    return true;
  } catch (error) {
    console.warn("[staff-cache] upsertCachedHistoryIfNewer failed", error);
    return false;
  }
}

export async function upsertCachedUserIfNewer(record: UserRecord): Promise<boolean> {
  try {
    const db = await openDB();
    const cached = await idbGet<UserRecord & { updated?: string }>(db, STORE_USERS, record.id);
    const recordUpdated = (record as UserRecord & { updated?: string }).updated;
    if (cached?.updated && recordUpdated && cached.updated >= recordUpdated) return false;
    await idbPut(db, STORE_USERS, record);
    return true;
  } catch (error) {
    console.warn("[staff-cache] upsertCachedUserIfNewer failed", error);
    return false;
  }
}

export async function upsertCachedCccdVersionIfNewer(record: CccdVersionRecord): Promise<boolean> {
  try {
    const db = await openDB();
    const cached = await idbGet<CccdVersionRecord>(db, STORE_CCCD_VERSIONS, record.id);
    if (cached?.updated && record.updated && cached.updated >= record.updated) return false;
    await idbPut(db, STORE_CCCD_VERSIONS, record);
    return true;
  } catch (error) {
    console.warn("[staff-cache] upsertCachedCccdVersionIfNewer failed", error);
    return false;
  }
}

export async function updateCachedFactory(record: FactoryRecord): Promise<void> {
  try {
    const db = await openDB();
    await idbPut(db, STORE_FACTORIES, record);
  } catch (error) {
    console.warn("[staff-cache] updateCachedFactory failed", error);
  }
}

export async function updateCachedMainHouse(record: MainHouseRecord): Promise<void> {
  try {
    const db = await openDB();
    await idbPut(db, STORE_MAIN_HOUSES, record);
  } catch (error) {
    console.warn("[staff-cache] updateCachedMainHouse failed", error);
  }
}

export async function factoryExistsInCache(id: string): Promise<boolean> {
  try {
    const db = await openDB();
    const rec = await idbGet<FactoryRecord>(db, STORE_FACTORIES, id);
    return !!rec;
  } catch {
    return false;
  }
}

export async function mainHouseExistsInCache(id: string): Promise<boolean> {
  try {
    const db = await openDB();
    const rec = await idbGet<MainHouseRecord>(db, STORE_MAIN_HOUSES, id);
    return !!rec;
  } catch {
    return false;
  }
}
