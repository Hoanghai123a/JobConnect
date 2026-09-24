import { pb } from "./pocketbase";
import type { UserRecord } from "./pocketbase";
import { getSeen } from "./seen";
import {
  readPreviewCache,
  writePreviewCache,
  type RoomPreview,
} from "./chat-cache";

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

export async function batchLoadRoomPreviews(
  viewer: UserRecord,
  roomIds: string[],
): Promise<Map<string, RoomPreview>> {
  if (roomIds.length === 0) {
    return new Map();
  }

  try {
    const cached = await readPreviewCache(viewer, roomIds);
    const cachedIds = new Set(cached.keys());
    const missingIds = roomIds.filter((id) => !cachedIds.has(id));

    if (missingIds.length === 0) {
      return cached;
    }

    const roomFilter = missingIds.map((id) => `room = "${id}"`).join(" || ");
    const allMessages = await pb
      .collection("group_chat_messages")
      .getFullList<ChatMessage>({
        filter: roomFilter,
        sort: "-created",
        expand: "user",
      });

    const byRoom = new Map<string, ChatMessage[]>();
    for (const msg of allMessages) {
      const existing = byRoom.get(msg.room) || [];
      existing.push(msg);
      byRoom.set(msg.room, existing);
    }

    const previews: RoomPreview[] = [];
    for (const roomId of missingIds) {
      const messages = byRoom.get(roomId) || [];
      const lastMessage = messages[0] || null;

      const seenTimestamp = getSeen(`chat:${roomId}`, viewer.id);
      const seenIso = seenTimestamp
        ? new Date(seenTimestamp).toISOString()
        : null;

      let unreadCount = 0;
      if (seenIso) {
        unreadCount = messages.filter(
          (m) => m.created > seenIso && m.user !== viewer.id,
        ).length;
      } else {
        unreadCount = messages.filter((m) => m.user !== viewer.id).length;
      }

      previews.push({
        roomId,
        lastMessage,
        unreadCount,
        totalMessages: messages.length,
        generatedAt: new Date().toISOString(),
      });
    }

    await writePreviewCache(viewer, previews);

    const result = new Map(cached);
    for (const preview of previews) {
      result.set(preview.roomId, preview);
    }

    return result;
  } catch (error) {
    console.error("batchLoadRoomPreviews error:", error);
    return new Map();
  }
}
