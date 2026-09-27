/**
 * Image Cache Service - Cache ảnh trong IndexedDB
 * Giảm bandwidth và tăng tốc load ảnh đã xem
 */

const CACHE_DB = "chat_image_cache";
const CACHE_STORE = "images";
const CACHE_VERSION = 1;
const MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000; // 7 ngày

interface CachedImage {
  url: string;
  blob: Blob;
  timestamp: number;
  size: number;
}

class ImageCacheService {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  private async init() {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(CACHE_DB, CACHE_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(CACHE_STORE)) {
          const store = db.createObjectStore(CACHE_STORE, { keyPath: "url" });
          store.createIndex("timestamp", "timestamp", { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  async get(url: string): Promise<Blob | null> {
    await this.init();
    if (!this.db) return null;

    return new Promise((resolve) => {
      const tx = this.db!.transaction(CACHE_STORE, "readonly");
      const store = tx.objectStore(CACHE_STORE);
      const request = store.get(url);

      request.onsuccess = () => {
        const result = request.result as CachedImage | undefined;
        if (!result) {
          resolve(null);
          return;
        }

        // Check expiry
        const age = Date.now() - result.timestamp;
        if (age > MAX_CACHE_AGE) {
          void this.delete(url);
          resolve(null);
          return;
        }

        resolve(result.blob);
      };

      request.onerror = () => resolve(null);
    });
  }

  async set(url: string, blob: Blob): Promise<void> {
    await this.init();
    if (!this.db) return;

    // Check cache size trước khi thêm
    const currentSize = await this.getTotalSize();
    if (currentSize + blob.size > MAX_CACHE_SIZE) {
      await this.evictOldest();
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(CACHE_STORE, "readwrite");
      const store = tx.objectStore(CACHE_STORE);

      const cached: CachedImage = {
        url,
        blob,
        timestamp: Date.now(),
        size: blob.size,
      };

      const request = store.put(cached);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async delete(url: string): Promise<void> {
    await this.init();
    if (!this.db) return;

    return new Promise((resolve) => {
      const tx = this.db!.transaction(CACHE_STORE, "readwrite");
      const store = tx.objectStore(CACHE_STORE);
      store.delete(url);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  private async getTotalSize(): Promise<number> {
    await this.init();
    if (!this.db) return 0;

    return new Promise((resolve) => {
      const tx = this.db!.transaction(CACHE_STORE, "readonly");
      const store = tx.objectStore(CACHE_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        const items = request.result as CachedImage[];
        const total = items.reduce((sum, item) => sum + item.size, 0);
        resolve(total);
      };

      request.onerror = () => resolve(0);
    });
  }

  private async evictOldest(): Promise<void> {
    await this.init();
    if (!this.db) return;

    return new Promise((resolve) => {
      const tx = this.db!.transaction(CACHE_STORE, "readwrite");
      const store = tx.objectStore(CACHE_STORE);
      const index = store.index("timestamp");
      const request = index.openCursor();

      let evicted = 0;
      const TARGET_EVICT = 10; // Xóa 10 ảnh cũ nhất

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result as IDBCursorWithValue;
        if (cursor && evicted < TARGET_EVICT) {
          cursor.delete();
          evicted++;
          cursor.continue();
        } else {
          resolve();
        }
      };

      request.onerror = () => resolve();
    });
  }

  async clear(): Promise<void> {
    await this.init();
    if (!this.db) return;

    return new Promise((resolve) => {
      const tx = this.db!.transaction(CACHE_STORE, "readwrite");
      const store = tx.objectStore(CACHE_STORE);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }
}

export const imageCache = new ImageCacheService();
