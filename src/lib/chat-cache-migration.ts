/**
 * IndexedDB Migration Utilities
 * Quản lý schema version và migration logic cho chat cache
 */

const MIGRATION_KEY = "chat_cache_migration_version";

type MigrationFunction = (db: IDBDatabase) => void | Promise<void>;

/**
 * Schema migrations - mỗi version có một migration function
 */
const MIGRATIONS: Record<number, MigrationFunction> = {
  1: (db) => {
    // Version 1: Initial schema (đã có trong chat-cache.ts)
    // Không cần làm gì vì chat-cache.ts đã tạo schema
    console.log("[Migration] Version 1: Initial schema already created");
  },

  2: async (db) => {
    // Version 2 (future): Example - thêm index mới
    console.log("[Migration] Version 2: Adding new indexes");

    // Ví dụ: Thêm index "by_updated" cho messages
    if (db.objectStoreNames.contains("messages")) {
      const transaction = db.transaction(["messages"], "readwrite");
      const store = transaction.objectStore("messages");

      if (!store.indexNames.contains("by_updated")) {
        // Note: Không thể add index trong onupgradeneeded callback
        // Migration này chỉ là placeholder cho tương lai
        console.log("[Migration] Would add by_updated index in onupgradeneeded");
      }
    }
  },
};

/**
 * Get current migration version từ localStorage
 */
export function getCurrentMigrationVersion(): number {
  const version = localStorage.getItem(MIGRATION_KEY);
  return version ? parseInt(version, 10) : 0;
}

/**
 * Set migration version vào localStorage
 */
export function setMigrationVersion(version: number): void {
  localStorage.setItem(MIGRATION_KEY, version.toString());
}

/**
 * Run migrations từ currentVersion đến targetVersion
 */
export async function runMigrations(
  db: IDBDatabase,
  fromVersion: number,
  toVersion: number,
): Promise<void> {
  console.log(`[Migration] Running migrations from v${fromVersion} to v${toVersion}`);

  for (let version = fromVersion + 1; version <= toVersion; version++) {
    const migration = MIGRATIONS[version];
    if (migration) {
      console.log(`[Migration] Executing migration v${version}`);
      await migration(db);
      setMigrationVersion(version);
    }
  }

  console.log(`[Migration] Completed all migrations to v${toVersion}`);
}

/**
 * Migrate data từ localStorage seen timestamps sang IndexedDB (nếu cần)
 * Note: Hiện tại seen timestamps vẫn dùng localStorage qua lib/seen.ts
 */
export async function migrateSeenTimestampsToIndexedDB(): Promise<void> {
  // TODO: Nếu trong tương lai muốn chuyển seen timestamps sang IndexedDB
  // thì implement logic ở đây
  console.log("[Migration] Seen timestamps migration not implemented yet");
}

/**
 * Clear tất cả cache data (emergency reset)
 */
export async function clearAllChatCache(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase("jobconnect-chat-cache");

    request.onsuccess = () => {
      console.log("[Migration] Chat cache cleared successfully");
      localStorage.removeItem(MIGRATION_KEY);
      resolve();
    };

    request.onerror = () => {
      console.error("[Migration] Failed to clear chat cache:", request.error);
      reject(request.error);
    };

    request.onblocked = () => {
      console.warn("[Migration] Cache clear blocked - close all tabs");
      reject(new Error("Database clear blocked"));
    };
  });
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  dbSize: number;
  messageCount: number;
  roomCount: number;
  previewCount: number;
}> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("jobconnect-chat-cache");

    request.onsuccess = () => {
      const db = request.result;

      Promise.all([
        countRecords(db, "messages"),
        countRecords(db, "rooms"),
        countRecords(db, "previews"),
      ])
        .then(([messageCount, roomCount, previewCount]) => {
          db.close();
          resolve({
            dbSize: 0, // Browser không expose database size
            messageCount,
            roomCount,
            previewCount,
          });
        })
        .catch(reject);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Count records trong một object store
 */
function countRecords(db: IDBDatabase, storeName: string): Promise<number> {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(storeName)) {
      resolve(0);
      return;
    }

    const transaction = db.transaction([storeName], "readonly");
    const store = transaction.objectStore(storeName);
    const countRequest = store.count();

    countRequest.onsuccess = () => resolve(countRequest.result);
    countRequest.onerror = () => reject(countRequest.error);
  });
}
