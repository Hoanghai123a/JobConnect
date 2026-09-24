import { useState, useEffect, useCallback } from "react";
import { pb } from "./pocketbase";

/**
 * Hook để detect online/offline state
 * Sử dụng navigator.onLine và PocketBase realtime connection status
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pbConnected, setPbConnected] = useState(true);

  useEffect(() => {
    const handleOnline = () => {
      console.log("[Offline] Browser is online");
      setIsOnline(true);
    };

    const handleOffline = () => {
      console.log("[Offline] Browser is offline");
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Check PocketBase connection health
    const checkPbHealth = setInterval(() => {
      // Nếu có authStore và realtime, check connection
      if (pb.realtime) {
        const connected = pb.realtime.isConnected ?? true;
        if (connected !== pbConnected) {
          console.log(`[Offline] PocketBase connection: ${connected ? "connected" : "disconnected"}`);
          setPbConnected(connected);
        }
      }
    }, 5000); // Check mỗi 5 giây

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(checkPbHealth);
    };
  }, [pbConnected]);

  // Trả về true chỉ khi cả browser và PocketBase đều online
  return isOnline && pbConnected;
}

/**
 * Queued message type
 */
export type QueuedMessage = {
  id: string; // Temp ID
  roomId: string;
  content: string;
  isAnonymous: boolean;
  userId: string;
  timestamp: number;
  retryCount: number;
  lastError?: string;
};

const QUEUE_STORAGE_KEY = "chat_offline_queue";
const MAX_RETRY_COUNT = 3;

/**
 * Load queue từ localStorage
 */
function loadQueue(): QueuedMessage[] {
  try {
    const stored = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!stored) return [];
    const queue = JSON.parse(stored) as QueuedMessage[];
    console.log(`[Offline] Loaded ${queue.length} queued messages from storage`);
    return queue;
  } catch (error) {
    console.error("[Offline] Failed to load queue:", error);
    return [];
  }
}

/**
 * Save queue vào localStorage
 */
function saveQueue(queue: QueuedMessage[]): void {
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    console.log(`[Offline] Saved ${queue.length} messages to queue`);
  } catch (error) {
    console.error("[Offline] Failed to save queue:", error);
  }
}

/**
 * Hook để quản lý offline message queue
 */
export function useOfflineQueue() {
  const [queue, setQueue] = useState<QueuedMessage[]>(() => loadQueue());
  const [processing, setProcessing] = useState(false);

  // Sync queue với localStorage mỗi khi thay đổi
  useEffect(() => {
    saveQueue(queue);
  }, [queue]);

  /**
   * Thêm message vào queue
   */
  const enqueue = useCallback((message: Omit<QueuedMessage, "retryCount" | "timestamp">) => {
    const queuedMessage: QueuedMessage = {
      ...message,
      timestamp: Date.now(),
      retryCount: 0,
    };

    setQueue((prev) => [...prev, queuedMessage]);
    console.log(`[Offline] Enqueued message: ${message.id}`);

    return queuedMessage;
  }, []);

  /**
   * Xóa message khỏi queue
   */
  const dequeue = useCallback((messageId: string) => {
    setQueue((prev) => {
      const filtered = prev.filter((m) => m.id !== messageId);
      console.log(`[Offline] Dequeued message: ${messageId}`);
      return filtered;
    });
  }, []);

  /**
   * Update message trong queue (sau retry failure)
   */
  const updateMessage = useCallback((messageId: string, updates: Partial<QueuedMessage>) => {
    setQueue((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, ...updates } : m))
    );
  }, []);

  /**
   * Process queue - gửi tất cả messages khi online
   */
  const processQueue = useCallback(
    async (
      sendFn: (message: QueuedMessage) => Promise<{ success: boolean; error?: string }>,
    ): Promise<{ sent: number; failed: number }> => {
      if (processing) {
        console.log("[Offline] Already processing queue");
        return { sent: 0, failed: 0 };
      }

      if (queue.length === 0) {
        console.log("[Offline] Queue is empty");
        return { sent: 0, failed: 0 };
      }

      setProcessing(true);
      console.log(`[Offline] Processing ${queue.length} queued messages`);

      let sent = 0;
      let failed = 0;

      // Process messages theo thứ tự
      for (const message of queue) {
        try {
          const result = await sendFn(message);

          if (result.success) {
            // Gửi thành công - xóa khỏi queue
            dequeue(message.id);
            sent++;
            console.log(`[Offline] Successfully sent queued message: ${message.id}`);
          } else {
            // Gửi thất bại
            const newRetryCount = message.retryCount + 1;

            if (newRetryCount >= MAX_RETRY_COUNT) {
              // Đã retry quá nhiều - xóa khỏi queue
              console.error(
                `[Offline] Max retries reached for message: ${message.id}, removing from queue`,
              );
              dequeue(message.id);
              failed++;
            } else {
              // Update retry count và error
              updateMessage(message.id, {
                retryCount: newRetryCount,
                lastError: result.error,
              });
              failed++;
              console.warn(
                `[Offline] Retry ${newRetryCount}/${MAX_RETRY_COUNT} failed for message: ${message.id}`,
              );
            }
          }
        } catch (error) {
          console.error(`[Offline] Error processing message ${message.id}:`, error);
          failed++;
        }
      }

      setProcessing(false);
      console.log(`[Offline] Queue processing complete: ${sent} sent, ${failed} failed`);

      return { sent, failed };
    },
    [queue, processing, dequeue, updateMessage],
  );

  /**
   * Clear toàn bộ queue (emergency)
   */
  const clearQueue = useCallback(() => {
    setQueue([]);
    localStorage.removeItem(QUEUE_STORAGE_KEY);
    console.log("[Offline] Queue cleared");
  }, []);

  return {
    queue,
    queueSize: queue.length,
    processing,
    enqueue,
    dequeue,
    processQueue,
    clearQueue,
  };
}
