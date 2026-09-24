import { useState, useEffect, useCallback, useRef } from "react";
import type { UserRecord } from "./pocketbase";
import { pb } from "./pocketbase";
import { readMessageCache, writeMessageCache } from "./chat-cache";
import {
  trackCacheHit,
  trackCacheMiss,
  trackApiCall,
  trackLoadTime,
  trackCacheWrite,
} from "./chat-performance";

type ChatMessage = {
  id: string;
  user: string;
  room?: string;
  content: string;
  created: string;
  is_anonymous?: boolean;
  image?: string[]; // Field chứa danh sách ảnh
  expand?: {
    user?: {
      id: string;
      username: string;
      full_name: string;
      avatar?: string;
      chat_blocked?: boolean;
    };
  };
};

/**
 * Hook quản lý messages với cache-first pattern
 * - Load từ IndexedDB trước (instant render)
 * - Fetch fresh data từ server background
 * - Update cache và UI với data mới
 */
export function useChatRoomMessages(params: {
  viewer: UserRecord | null;
  roomId: string;
  pageSize?: number;
  isGuest?: boolean;
}) {
  const { viewer, roomId, pageSize = 50, isGuest = false } = params;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);

  // Track nếu đã load cache để tránh flash
  const cacheLoadedRef = useRef(false);

  /**
   * Load messages cho một page cụ thể
   * @param pageNo - Page number (1-indexed)
   * @param fromCache - Load từ cache trước không?
   */
  const loadMessages = useCallback(
    async (pageNo: number, fromCache = true) => {
      const startTime = performance.now();

      try {
        // BƯỚC 1: Load từ cache nếu có (chỉ page 1)
        if (fromCache && pageNo === 1 && viewer && !isGuest) {
          const cached = await readMessageCache(viewer, roomId, pageSize, 0);
          if (cached.messages.length > 0) {
            console.log(`[Cache] Loaded ${cached.messages.length} messages from cache for room ${roomId}`);
            setMessages(cached.messages);
            setHasMore(cached.hasMore);
            setLoading(false);
            cacheLoadedRef.current = true;

            // Track cache hit
            trackCacheHit();
            trackLoadTime(performance.now() - startTime);
          } else {
            // Track cache miss
            trackCacheMiss();
          }
        }

        // BƯỚC 2: Fetch fresh data từ server
        const apiStartTime = performance.now();
        const res = await pb.collection("group_chat_messages").getList(pageNo, pageSize, {
          filter: `room = "${roomId}"`,
          sort: "-created",
          expand: "user",
        });

        // Track API call
        const apiTime = performance.now() - apiStartTime;
        trackApiCall(true, JSON.stringify(res).length);

        const items = ((res.items as unknown as ChatMessage[]) || []).reverse();

        // BƯỚC 3: Write vào cache (chỉ page 1)
        if (pageNo === 1 && viewer && !isGuest) {
          await writeMessageCache(viewer, roomId, items, Date.now().toString());
          console.log(`[Cache] Wrote ${items.length} messages to cache for room ${roomId}`);
          trackCacheWrite(items.length);
        }

        // BƯỚC 4: Update UI với fresh data
        setMessages(items);
        setTotalCount(res.totalItems || 0);
        setHasMore((res.totalPages || 1) > pageNo);
        setPage(pageNo);
        setLoading(false);

        // Track total load time
        trackLoadTime(performance.now() - startTime);

        return {
          items,
          totalItems: res.totalItems || 0,
          totalPages: res.totalPages || 1,
        };
      } catch (error) {
        console.error("[useChatRoomMessages] Load error:", error);
        setLoading(false);

        // Track API error
        trackApiCall(false);

        throw error;
      }
    },
    [viewer, roomId, pageSize, isGuest],
  );

  /**
   * Load trang đầu tiên
   */
  const loadInitial = useCallback(async () => {
    cacheLoadedRef.current = false;
    setLoading(true);
    try {
      await loadMessages(1, true);
    } catch (error) {
      console.error("[useChatRoomMessages] loadInitial error:", error);
      throw error;
    }
  }, [loadMessages]);

  /**
   * Load thêm messages cũ (pagination)
   */
  const loadMore = useCallback(async () => {
    if (!hasMore || loading) return;

    const nextPage = page + 1;
    try {
      const pageData = await loadMessages(nextPage, false);

      // Merge với messages hiện tại (prepend vì sort reverse)
      setMessages((current) => {
        const merged = [...pageData.items, ...current];
        // Deduplicate based on ID
        const unique = Array.from(new Map(merged.map((m) => [m.id, m])).values());
        return unique;
      });
    } catch (error) {
      console.error("[useChatRoomMessages] loadMore error:", error);
      throw error;
    }
  }, [hasMore, loading, page, loadMessages]);

  /**
   * Auto-load khi mount hoặc roomId thay đổi
   */
  useEffect(() => {
    void loadInitial();
  }, [roomId]); // Chỉ depend vào roomId, không depend vào loadInitial để tránh loop

  return {
    messages,
    setMessages, // Export để component có thể update (optimistic UI, realtime)
    loading,
    hasMore,
    totalCount,
    setTotalCount, // Export để component có thể update count
    page,
    setPage, // Export để component có thể set page
    setHasMore, // Export để component có thể set hasMore
    loadMore,
    reload: loadInitial,
  };
}
