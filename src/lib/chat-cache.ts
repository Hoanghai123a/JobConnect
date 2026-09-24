import type { UserRecord } from "./pocketbase";

const DB_NAME = "jobconnect-chat-cache";
const DB_VERSION = 1;
const ROOMS = "rooms";
const MESSAGES = "messages";
const PREVIEWS = "previews";
const META = "meta";

export type RoomPreview = {
  roomId: string;
  lastMessage: ChatMessage | null;
  unreadCount: number;
  totalMessages: number;
  generatedAt: string;
};

type ChatRoom = {
  id: string;
  name: string;
  description: string;
  is_default: boolean;
  created_by: string;
  created: string;
  updated: string;
};

type ChatMessage = {
  id: string;
  room: string;
  user: string;
  content: string;
  is_anonymous: boolean;
  created: string;
  updated: string;
  expand?: {
    user?: {
      id: string;
      username: string;
      full_name: string;
      avatar?: string;
    };
  };
};

type RoomRecord = {
  key: string;
  viewerKey: string;
  roomId: string;
  fingerprint: string;
  updatedAt: string;
  room: ChatRoom;
};

type MessageRecord = {
  key: string;
  roomKey: string;
  viewerKey: string;
  roomId: string;
  messageId: string;
  fingerprint: string;
  created: string;
  message: ChatMessage;
};

type PreviewRecord = {
  key: string;
  viewerKey: string;
  roomId: string;
  fingerprint: string;
  generatedAt: string;
  lastMessage: ChatMessage | null;
  unreadCount: number;
  totalMessages: number;
};

type MetaRecord = {
  key: string;
  fingerprint: string;
  lastSync: string;
};

function viewerKey(viewer: Pick<UserRecord, "id" | "role">) {
  return `${viewer.id}|${viewer.role || ""}`;
}

function roomKey(viewer: Pick<UserRecord, "id" | "role">, roomId: string) {
  return `${viewerKey(viewer)}|${roomId}`;
}

function messageKey(
  viewer: Pick<UserRecord, "id" | "role">,
  roomId: string,
  messageId: string,
) {
  return `${viewerKey(viewer)}|${roomId}|${messageId}`;
}

function openChatDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(ROOMS)) {
        db.createObjectStore(ROOMS, { keyPath: "key" });
      }

      if (!db.objectStoreNames.contains(MESSAGES)) {
        const messageStore = db.createObjectStore(MESSAGES, { keyPath: "key" });
        messageStore.createIndex("by_room", "roomKey");
        messageStore.createIndex("by_created", "created");
      }

      if (!db.objectStoreNames.contains(PREVIEWS)) {
        db.createObjectStore(PREVIEWS, { keyPath: "key" });
      }

      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestValue<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function readPreviewCache(
  viewer: Pick<UserRecord, "id" | "role">,
  roomIds: string[],
): Promise<Map<string, RoomPreview>> {
  try {
    const db = await openChatDb();
    const tx = db.transaction(PREVIEWS, "readonly");
    const store = tx.objectStore(PREVIEWS);

    const records = await Promise.all(
      roomIds.map(
        (roomId) =>
          requestValue(store.get(roomKey(viewer, roomId))) as Promise<
            PreviewRecord | undefined
          >,
      ),
    );

    const result = new Map<string, RoomPreview>();
    for (const record of records) {
      if (record) {
        result.set(record.roomId, {
          roomId: record.roomId,
          lastMessage: record.lastMessage,
          unreadCount: record.unreadCount,
          totalMessages: record.totalMessages,
          generatedAt: record.generatedAt,
        });
      }
    }

    return result;
  } catch {
    return new Map();
  }
}

export async function writePreviewCache(
  viewer: Pick<UserRecord, "id" | "role">,
  previews: RoomPreview[],
): Promise<void> {
  const db = await openChatDb();
  const tx = db.transaction(PREVIEWS, "readwrite");
  const store = tx.objectStore(PREVIEWS);
  const vKey = viewerKey(viewer);

  for (const preview of previews) {
    store.put({
      key: roomKey(viewer, preview.roomId),
      viewerKey: vKey,
      roomId: preview.roomId,
      fingerprint: "",
      generatedAt: preview.generatedAt,
      lastMessage: preview.lastMessage,
      unreadCount: preview.unreadCount,
      totalMessages: preview.totalMessages,
    } satisfies PreviewRecord);
  }

  await transactionDone(tx);
}

export async function readMessageCache(
  viewer: Pick<UserRecord, "id" | "role">,
  roomId: string,
  limit = 50,
  offset = 0,
): Promise<{
  messages: ChatMessage[];
  hasMore: boolean;
  total: number;
}> {
  try {
    const db = await openChatDb();
    const tx = db.transaction(MESSAGES, "readonly");
    const store = tx.objectStore(MESSAGES);
    const index = store.index("by_room");
    const rKey = roomKey(viewer, roomId);

    const allRecords: MessageRecord[] = [];
    const cursorRequest = index.openCursor(IDBKeyRange.only(rKey), "prev");

    await new Promise<void>((resolve, reject) => {
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (cursor) {
          allRecords.push(cursor.value as MessageRecord);
          cursor.continue();
        } else {
          resolve();
        }
      };
      cursorRequest.onerror = () => reject(cursorRequest.error);
    });

    const total = allRecords.length;
    const sliced = allRecords.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    return {
      messages: sliced.map((r) => r.message),
      hasMore,
      total,
    };
  } catch {
    return { messages: [], hasMore: false, total: 0 };
  }
}

export async function writeMessageCache(
  viewer: Pick<UserRecord, "id" | "role">,
  roomId: string,
  messages: ChatMessage[],
  fingerprint: string,
): Promise<void> {
  const db = await openChatDb();
  const tx = db.transaction(MESSAGES, "readwrite");
  const store = tx.objectStore(MESSAGES);
  const vKey = viewerKey(viewer);
  const rKey = roomKey(viewer, roomId);

  for (const message of messages) {
    store.put({
      key: messageKey(viewer, roomId, message.id),
      roomKey: rKey,
      viewerKey: vKey,
      roomId,
      messageId: message.id,
      fingerprint,
      created: message.created,
      message,
    } satisfies MessageRecord);
  }

  await transactionDone(tx);
}

export async function readRoomCache(
  viewer: Pick<UserRecord, "id" | "role">,
  roomIds: string[],
): Promise<ChatRoom[]> {
  try {
    const db = await openChatDb();
    const tx = db.transaction(ROOMS, "readonly");
    const store = tx.objectStore(ROOMS);

    const records = await Promise.all(
      roomIds.map(
        (roomId) =>
          requestValue(store.get(roomKey(viewer, roomId))) as Promise<
            RoomRecord | undefined
          >,
      ),
    );

    return records.filter((r): r is RoomRecord => Boolean(r)).map((r) => r.room);
  } catch {
    return [];
  }
}

export async function writeRoomCache(
  viewer: Pick<UserRecord, "id" | "role">,
  rooms: ChatRoom[],
  fingerprint: string,
): Promise<void> {
  const db = await openChatDb();
  const tx = db.transaction(ROOMS, "readwrite");
  const store = tx.objectStore(ROOMS);
  const vKey = viewerKey(viewer);

  for (const room of rooms) {
    store.put({
      key: roomKey(viewer, room.id),
      viewerKey: vKey,
      roomId: room.id,
      fingerprint,
      updatedAt: room.updated,
      room,
    } satisfies RoomRecord);
  }

  await transactionDone(tx);
}

export async function invalidateChatCache(
  viewer: Pick<UserRecord, "id" | "role">,
  roomId?: string,
): Promise<void> {
  const db = await openChatDb();

  if (roomId) {
    const tx = db.transaction([PREVIEWS, MESSAGES], "readwrite");
    const rKey = roomKey(viewer, roomId);

    tx.objectStore(PREVIEWS).delete(rKey);

    const messageStore = tx.objectStore(MESSAGES);
    const index = messageStore.index("by_room");
    const cursorRequest = index.openCursor(IDBKeyRange.only(rKey));

    await new Promise<void>((resolve, reject) => {
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      cursorRequest.onerror = () => reject(cursorRequest.error);
    });

    await transactionDone(tx);
  } else {
    const tx = db.transaction([ROOMS, MESSAGES, PREVIEWS, META], "readwrite");
    const vKey = viewerKey(viewer);

    for (const storeName of [ROOMS, MESSAGES, PREVIEWS]) {
      const store = tx.objectStore(storeName);
      const cursorRequest = store.openCursor();

      await new Promise<void>((resolve, reject) => {
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (cursor) {
            const record = cursor.value as { viewerKey: string };
            if (record.viewerKey === vKey) {
              cursor.delete();
            }
            cursor.continue();
          } else {
            resolve();
          }
        };
        cursorRequest.onerror = () => reject(cursorRequest.error);
      });
    }

    tx.objectStore(META).delete(vKey);
    await transactionDone(tx);
  }
}

export async function cleanupOldMessages(
  viewer: Pick<UserRecord, "id" | "role">,
  daysToKeep = 7,
): Promise<void> {
  const db = await openChatDb();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  const cutoffIso = cutoffDate.toISOString();

  const tx = db.transaction(MESSAGES, "readwrite");
  const store = tx.objectStore(MESSAGES);
  const index = store.index("by_created");
  const range = IDBKeyRange.upperBound(cutoffIso);
  const cursorRequest = index.openCursor(range);

  const vKey = viewerKey(viewer);

  await new Promise<void>((resolve, reject) => {
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor) {
        const record = cursor.value as MessageRecord;
        if (record.viewerKey === vKey) {
          cursor.delete();
        }
        cursor.continue();
      } else {
        resolve();
      }
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);
  });

  await transactionDone(tx);
}

export async function readChatMeta(
  viewer: Pick<UserRecord, "id" | "role">,
): Promise<{ fingerprint: string; lastSync: string } | null> {
  try {
    const db = await openChatDb();
    const tx = db.transaction(META, "readonly");
    const record = (await requestValue(
      tx.objectStore(META).get(viewerKey(viewer)),
    )) as MetaRecord | undefined;

    return record
      ? { fingerprint: record.fingerprint, lastSync: record.lastSync }
      : null;
  } catch {
    return null;
  }
}

export async function writeChatMeta(
  viewer: Pick<UserRecord, "id" | "role">,
  fingerprint: string,
): Promise<void> {
  const db = await openChatDb();
  const tx = db.transaction(META, "readwrite");
  const key = viewerKey(viewer);

  tx.objectStore(META).put({
    key,
    fingerprint,
    lastSync: new Date().toISOString(),
  } satisfies MetaRecord);

  await transactionDone(tx);
}

// ===== Smart Cache Eviction (LRU) =====

const MAX_CACHED_ROOMS = 20; // Giữ tối đa 20 phòng
const MAX_MESSAGES_PER_ROOM = 200; // Mỗi phòng 200 tin
const MAX_PREVIEW_AGE_DAYS = 7; // Preview cache 7 ngày

type RoomStats = {
  roomId: string;
  lastAccess: number;
  messageCount: number;
};

async function getCachedRoomsSorted(
  viewer: Pick<UserRecord, "id" | "role">
): Promise<RoomStats[]> {
  const db = await openChatDb();
  const tx = db.transaction([MESSAGES, META], "readonly");
  const vKey = viewerKey(viewer);

  const rooms = new Map<string, { messageCount: number }>();

  // Collect message counts per room
  const messageStore = tx.objectStore(MESSAGES);
  const cursorRequest = messageStore.openCursor();

  await new Promise<void>((resolve, reject) => {
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor) {
        const record = cursor.value as MessageRecord;
        if (record.viewerKey === vKey) {
          const existing = rooms.get(record.roomId) || { messageCount: 0 };
          existing.messageCount++;
          rooms.set(record.roomId, existing);
        }
        cursor.continue();
      } else {
        resolve();
      }
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);
  });

  // Get last access times from meta (stub - in real app would need separate lastAccess store)
  // For now, use current time as placeholder
  const now = Date.now();

  // Sort by message count (proxy for usage) - most used first
  return Array.from(rooms.entries())
    .map(([roomId, stats]) => ({
      roomId,
      lastAccess: now, // Placeholder
      messageCount: stats.messageCount,
    }))
    .sort((a, b) => b.messageCount - a.messageCount);
}

async function deleteCachedRoom(
  viewer: Pick<UserRecord, "id" | "role">,
  roomId: string
): Promise<void> {
  const db = await openChatDb();
  const tx = db.transaction([MESSAGES, PREVIEWS], "readwrite");
  const rKey = roomKey(viewer, roomId);

  // Delete messages
  const messageStore = tx.objectStore(MESSAGES);
  const index = messageStore.index("by_room");
  const cursorRequest = index.openCursor(IDBKeyRange.only(rKey));

  await new Promise<void>((resolve, reject) => {
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);
  });

  // Delete preview
  tx.objectStore(PREVIEWS).delete(rKey);

  await transactionDone(tx);
}

async function trimRoomMessages(
  viewer: Pick<UserRecord, "id" | "role">,
  roomId: string,
  keepCount: number
): Promise<void> {
  const db = await openChatDb();
  const tx = db.transaction(MESSAGES, "readwrite");
  const rKey = roomKey(viewer, roomId);

  const messages: Array<{ key: string; created: string }> = [];
  const messageStore = tx.objectStore(MESSAGES);
  const index = messageStore.index("by_room");
  const cursorRequest = index.openCursor(IDBKeyRange.only(rKey));

  await new Promise<void>((resolve, reject) => {
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor) {
        const record = cursor.value as MessageRecord;
        messages.push({
          key: record.key,
          created: record.created,
        });
        cursor.continue();
      } else {
        resolve();
      }
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);
  });

  // Sort by created (newest first)
  messages.sort((a, b) =>
    new Date(b.created).getTime() - new Date(a.created).getTime()
  );

  // Delete old messages
  const toDelete = messages.slice(keepCount);
  for (const msg of toDelete) {
    await requestValue(messageStore.delete(msg.key));
  }

  await transactionDone(tx);

  if (toDelete.length > 0) {
    console.log(`[Cache] Trimmed ${toDelete.length} old messages from room ${roomId}`);
  }
}

async function cleanupOldPreviews(
  viewer: Pick<UserRecord, "id" | "role">,
  maxAgeDays: number
): Promise<void> {
  const db = await openChatDb();
  const tx = db.transaction(PREVIEWS, "readwrite");
  const vKey = viewerKey(viewer);

  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

  const store = tx.objectStore(PREVIEWS);
  const cursorRequest = store.openCursor();
  let deleted = 0;

  await new Promise<void>((resolve, reject) => {
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor) {
        const record = cursor.value as PreviewRecord;
        if (record.viewerKey === vKey) {
          const generatedAt = new Date(record.generatedAt).getTime();
          if (generatedAt < cutoff) {
            cursor.delete();
            deleted++;
          }
        }
        cursor.continue();
      } else {
        resolve();
      }
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);
  });

  await transactionDone(tx);

  if (deleted > 0) {
    console.log(`[Cache] Deleted ${deleted} old previews`);
  }
}

export async function evictOldCache(
  viewer: Pick<UserRecord, "id" | "role">
): Promise<void> {
  try {
    const rooms = await getCachedRoomsSorted(viewer);

    console.log(`[Cache] Found ${rooms.length} cached rooms`);

    // 1. Delete old rooms (keep only MAX_CACHED_ROOMS most recent)
    const roomsToDelete = rooms.slice(MAX_CACHED_ROOMS);
    if (roomsToDelete.length > 0) {
      console.log(`[Cache] Deleting ${roomsToDelete.length} old rooms`);
      for (const room of roomsToDelete) {
        await deleteCachedRoom(viewer, room.roomId);
      }
    }

    // 2. Trim messages in kept rooms
    const keptRooms = rooms.slice(0, MAX_CACHED_ROOMS);
    for (const room of keptRooms) {
      if (room.messageCount > MAX_MESSAGES_PER_ROOM) {
        await trimRoomMessages(viewer, room.roomId, MAX_MESSAGES_PER_ROOM);
      }
    }

    // 3. Clean up old previews
    await cleanupOldPreviews(viewer, MAX_PREVIEW_AGE_DAYS);

    console.log(`[Cache] Eviction complete`);
  } catch (error) {
    console.error("[Cache] Eviction error:", error);
  }
}
