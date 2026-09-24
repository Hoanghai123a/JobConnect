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
