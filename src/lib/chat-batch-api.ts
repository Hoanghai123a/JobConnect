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

    // ✅ Tối ưu: Load song song cho mỗi phòng (chỉ tin cuối + count unread)
    const previewPromises = missingIds.map(async (roomId) => {
      try {
        // 1. Lấy tin nhắn cuối cùng (chỉ 1 tin)
        let lastMessage: ChatMessage | null = null;
        try {
          lastMessage = await pb
            .collection("group_chat_messages")
            .getFirstListItem<ChatMessage>(`room = "${roomId}"`, {
              sort: "-created",
              expand: "user",
            });
        } catch (err) {
          // Phòng chưa có tin nhắn nào - OK
          lastMessage = null;
        }

        // 2. Đếm total messages (chỉ count, không fetch data)
        const totalResult = await pb
          .collection("group_chat_messages")
          .getList(1, 1, {
            filter: `room = "${roomId}"`,
          });
        const totalMessages = totalResult.totalItems;

        // 3. Đếm unread messages
        const seenTimestamp = getSeen(`chat:${roomId}`, viewer.id);
        const seenIso = seenTimestamp
          ? new Date(seenTimestamp).toISOString()
          : null;

        let unreadCount = 0;
        if (seenIso) {
          // Đếm tin nhắn sau lần seen cuối, không phải của mình
          const unreadResult = await pb
            .collection("group_chat_messages")
            .getList(1, 1, {
              filter: `room = "${roomId}" && created > "${seenIso}" && user != "${viewer.id}"`,
            });
          unreadCount = unreadResult.totalItems;
        } else {
          // Chưa từng seen - đếm tất cả tin không phải của mình
          const unreadResult = await pb
            .collection("group_chat_messages")
            .getList(1, 1, {
              filter: `room = "${roomId}" && user != "${viewer.id}"`,
            });
          unreadCount = unreadResult.totalItems;
        }

        return {
          roomId,
          lastMessage,
          unreadCount,
          totalMessages,
          generatedAt: new Date().toISOString(),
        };
      } catch (err) {
        console.error(`Preview error for room ${roomId}:`, err);
        // Fallback: phòng lỗi vẫn trả về preview rỗng
        return {
          roomId,
          lastMessage: null,
          unreadCount: 0,
          totalMessages: 0,
          generatedAt: new Date().toISOString(),
        };
      }
    });

    // Chờ tất cả preview load xong
    const previews = await Promise.all(previewPromises);

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
