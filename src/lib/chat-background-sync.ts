import { pb } from "./pocketbase";
import type { UserRecord } from "./pocketbase";
import { writeMessageCache, writePreviewCache } from "./chat-cache";
import { getSeen } from "./seen";

/**
 * Background Sync Service
 * Sync cache khi app inactive và prefetch messages cho rooms thường xuyên mở
 */

const SYNC_INTERVAL = 5 * 60 * 1000; // 5 phút
const PREFETCH_RECENT_ROOMS = 3; // Prefetch 3 rooms gần nhất
const ROOM_VISIT_KEY = "chat_room_visits";

type RoomVisit = {
  roomId: string;
  lastVisit: number;
  visitCount: number;
};

/**
 * Track room visit cho prefetch intelligence
 */
export function trackRoomVisit(roomId: string): void {
  try {
    const stored = localStorage.getItem(ROOM_VISIT_KEY);
    const visits: RoomVisit[] = stored ? JSON.parse(stored) : [];

    // Tìm room hiện tại
    const existingIndex = visits.findIndex((v) => v.roomId === roomId);

    if (existingIndex >= 0) {
      // Update existing visit
      visits[existingIndex] = {
        roomId,
        lastVisit: Date.now(),
        visitCount: visits[existingIndex].visitCount + 1,
      };
    } else {
      // Add new visit
      visits.push({
        roomId,
        lastVisit: Date.now(),
        visitCount: 1,
      });
    }

    // Sort by lastVisit descending và giữ tối đa 10 rooms
    visits.sort((a, b) => b.lastVisit - a.lastVisit);
    const trimmed = visits.slice(0, 10);

    localStorage.setItem(ROOM_VISIT_KEY, JSON.stringify(trimmed));
  } catch (error) {
    console.error("[BackgroundSync] Failed to track room visit:", error);
  }
}

/**
 * Get most visited rooms (cho prefetch)
 */
export function getMostVisitedRooms(limit = PREFETCH_RECENT_ROOMS): string[] {
  try {
    const stored = localStorage.getItem(ROOM_VISIT_KEY);
    if (!stored) return [];

    const visits: RoomVisit[] = JSON.parse(stored);

    // Sort by visitCount descending, then lastVisit
    visits.sort((a, b) => {
      if (b.visitCount !== a.visitCount) {
        return b.visitCount - a.visitCount;
      }
      return b.lastVisit - a.lastVisit;
    });

    return visits.slice(0, limit).map((v) => v.roomId);
  } catch (error) {
    console.error("[BackgroundSync] Failed to get visited rooms:", error);
    return [];
  }
}

/**
 * Prefetch messages cho một room
 */
async function prefetchRoomMessages(
  viewer: UserRecord,
  roomId: string,
  pageSize = 50,
): Promise<boolean> {
  try {
    console.log(`[BackgroundSync] Prefetching messages for room: ${roomId}`);

    const res = await pb.collection("group_chat_messages").getList(1, pageSize, {
      filter: `room = "${roomId}"`,
      sort: "-created",
      expand: "user",
    });

    const items = ((res.items as any[]) || []).reverse();

    // Write vào cache
    await writeMessageCache(viewer, roomId, items, Date.now().toString());

    console.log(`[BackgroundSync] Prefetched ${items.length} messages for room ${roomId}`);
    return true;
  } catch (error) {
    console.error(`[BackgroundSync] Failed to prefetch room ${roomId}:`, error);
    return false;
  }
}

/**
 * Prefetch preview cho một room
 */
async function prefetchRoomPreview(
  viewer: UserRecord,
  roomId: string,
): Promise<boolean> {
  try {
    console.log(`[BackgroundSync] Prefetching preview for room: ${roomId}`);

    // Get latest message
    const messages = await pb.collection("group_chat_messages").getList(1, 1, {
      filter: `room = "${roomId}"`,
      sort: "-created",
      expand: "user",
    });

    if (messages.items.length === 0) {
      return false;
    }

    const latestMessage = messages.items[0] as any;

    // Calculate unread count based on last_seen_timestamp
    const seenTimestamp = getSeen(`chat:${roomId}`, viewer.id);
    const seenIso = seenTimestamp ? new Date(seenTimestamp).toISOString() : null;

    let unreadCount = 0;
    if (seenIso && latestMessage.created > seenIso && latestMessage.user !== viewer.id) {
      // Count messages after last seen (excluding own messages)
      const unreadRes = await pb.collection("group_chat_messages").getList(1, 50, {
        filter: `room = "${roomId}" && created > "${seenIso}" && user != "${viewer.id}"`,
        sort: "-created",
      });
      unreadCount = unreadRes.totalItems || 0;
    }

    // Write preview cache
    await writePreviewCache(
      viewer,
      roomId,
      {
        roomId,
        lastMessageContent: latestMessage.content || "",
        lastMessageUser: latestMessage.expand?.user?.full_name || "Unknown",
        lastMessageTime: latestMessage.created,
        unreadCount,
        updated: latestMessage.updated || latestMessage.created,
      },
      Date.now().toString(),
    );

    console.log(`[BackgroundSync] Prefetched preview for room ${roomId} (unread: ${unreadCount})`);
    return true;
  } catch (error) {
    console.error(`[BackgroundSync] Failed to prefetch preview for room ${roomId}:`, error);
    return false;
  }
}

/**
 * Background sync cho most visited rooms
 */
export async function syncMostVisitedRooms(viewer: UserRecord): Promise<void> {
  if (!viewer) return;

  console.log("[BackgroundSync] Starting background sync for most visited rooms");

  const roomIds = getMostVisitedRooms();
  if (roomIds.length === 0) {
    console.log("[BackgroundSync] No rooms to sync");
    return;
  }

  console.log(`[BackgroundSync] Syncing ${roomIds.length} rooms:`, roomIds);

  // Prefetch messages và previews parallel
  const results = await Promise.allSettled([
    ...roomIds.map((roomId) => prefetchRoomMessages(viewer, roomId)),
    ...roomIds.map((roomId) => prefetchRoomPreview(viewer, roomId)),
  ]);

  const successful = results.filter((r) => r.status === "fulfilled" && r.value).length;
  const failed = results.length - successful;

  console.log(`[BackgroundSync] Sync complete: ${successful} succeeded, ${failed} failed`);
}

/**
 * Start background sync interval
 */
export function startBackgroundSync(viewer: UserRecord | null): (() => void) | null {
  if (!viewer) return null;

  console.log("[BackgroundSync] Starting background sync service");

  // Initial sync sau 10 giây
  const initialTimeout = window.setTimeout(() => {
    void syncMostVisitedRooms(viewer);
  }, 10000);

  // Periodic sync mỗi SYNC_INTERVAL
  const syncInterval = window.setInterval(() => {
    void syncMostVisitedRooms(viewer);
  }, SYNC_INTERVAL);

  // Return cleanup function
  return () => {
    console.log("[BackgroundSync] Stopping background sync service");
    clearTimeout(initialTimeout);
    clearInterval(syncInterval);
  };
}

/**
 * Sync on visibility change (khi user quay lại tab)
 */
export function setupVisibilitySync(viewer: UserRecord | null): (() => void) | null {
  if (!viewer) return null;

  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      console.log("[BackgroundSync] Tab became visible, syncing...");
      void syncMostVisitedRooms(viewer);
    }
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}
