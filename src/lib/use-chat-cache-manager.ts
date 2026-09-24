import { useEffect } from "react";
import type { UserRecord } from "./pocketbase";
import { invalidateChatCache, cleanupOldMessages, evictOldCache } from "./chat-cache";

/**
 * Custom hook quản lý cache invalidation và cleanup
 * Tách riêng để tránh React Hooks order violation
 */
export function useChatCacheManager(params: {
  viewer: UserRecord | null;
  onCacheInvalidated?: () => void;
}) {
  const { viewer, onCacheInvalidated } = params;

  // Smart cache invalidation: Listen event và invalidate cache khi có tin nhắn mới
  useEffect(() => {
    if (!viewer) return;

    const handleCacheChanged = async (e: Event) => {
      const customEvent = e as CustomEvent;
      const { roomId, action } = customEvent.detail || {};

      if (action === "create" || action === "update") {
        console.log(`[Cache] Invalidating preview cache for room: ${roomId}`);

        // Invalidate cache của room đó
        await invalidateChatCache(viewer, roomId);

        // Trigger callback để parent reload data
        onCacheInvalidated?.();
      }
    };

    window.addEventListener("jobconnect:chat-cache-changed", handleCacheChanged);

    return () => {
      window.removeEventListener("jobconnect:chat-cache-changed", handleCacheChanged);
    };
  }, [viewer, onCacheInvalidated]);

  // Auto-cleanup và Smart Cache Eviction
  useEffect(() => {
    if (!viewer) return;

    // Run cleanup old messages on mount
    void cleanupOldMessages(viewer, 7).then(() => {
      console.log("[Cache] Cleaned up old messages (>7 days)");
    });

    // ✅ Phase 4 Improvement #8: Smart Cache Eviction (LRU)
    // Run eviction on mount
    void evictOldCache(viewer).catch(console.error);

    // Run eviction every 24 hours
    const interval = setInterval(() => {
      void evictOldCache(viewer).catch(console.error);
    }, 24 * 60 * 60 * 1000);

    return () => clearInterval(interval);
  }, [viewer?.id]);
}
