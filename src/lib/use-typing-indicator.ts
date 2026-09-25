import { useEffect, useState, useCallback, useRef } from "react";
import { pb } from "./pocketbase";
import type { UserRecord } from "./pocketbase";

/**
 * Typing Indicator Hook
 * Real-time typing status cho chat rooms
 */

const TYPING_TIMEOUT = 3000; // 3 giây không gõ thì clear typing status
const DEBOUNCE_DELAY = 500; // Debounce 500ms trước khi gửi typing event

type TypingStatus = {
  user: string;
  room: string;
  username: string;
  timestamp: number;
};

/**
 * Broadcast typing status (debounced)
 */
export function useTypingBroadcast(params: {
  viewer: UserRecord | null;
  roomId: string;
  isGuest?: boolean;
}) {
  const { viewer, roomId, isGuest = false } = params;
  const timeoutRef = useRef<number | null>(null);
  const debounceRef = useRef<number | null>(null);

  const sendTyping = useCallback(async () => {
    if (!viewer || isGuest) return;

    try {
      // Broadcast typing event qua collection đơn giản
      // Sử dụng localStorage cho lightweight real-time tracking
      const key = `typing:${roomId}`;
      const status: TypingStatus = {
        user: viewer.id,
        room: roomId,
        username: viewer.full_name || viewer.username,
        timestamp: Date.now(),
      };

      localStorage.setItem(key, JSON.stringify(status));

      // Auto-clear sau TYPING_TIMEOUT
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => {
        localStorage.removeItem(key);
      }, TYPING_TIMEOUT);
    } catch (error) {
      console.error("[Typing] Failed to broadcast:", error);
    }
  }, [viewer?.id, viewer?.full_name, viewer?.username, roomId, isGuest]);

  const notifyTyping = useCallback(() => {
    if (!viewer || isGuest) return;

    // Debounce typing events
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void sendTyping();
    }, DEBOUNCE_DELAY);
  }, [viewer?.id, isGuest, sendTyping]);

  const clearTyping = useCallback(() => {
    if (!viewer || isGuest) return;

    const key = `typing:${roomId}`;
    localStorage.removeItem(key);

    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, [viewer?.id, roomId, isGuest]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTyping();
    };
  }, [clearTyping]);

  return { notifyTyping, clearTyping };
}

/**
 * Listen to typing status của users khác
 */
export function useTypingListener(params: {
  viewer: UserRecord | null;
  roomId: string;
  isGuest?: boolean;
}) {
  const { viewer, roomId, isGuest = false } = params;
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  useEffect(() => {
    if (!viewer || isGuest) return;

    const key = `typing:${roomId}`;

    // Poll localStorage mỗi 1 giây để detect typing status
    const interval = window.setInterval(() => {
      try {
        const stored = localStorage.getItem(key);
        if (!stored) {
          setTypingUsers([]);
          return;
        }

        const status: TypingStatus = JSON.parse(stored);

        // Ignore own typing
        if (status.user === viewer.id) {
          setTypingUsers([]);
          return;
        }

        // Check if still fresh (within TYPING_TIMEOUT)
        const age = Date.now() - status.timestamp;
        if (age < TYPING_TIMEOUT) {
          setTypingUsers([status.username]);
        } else {
          setTypingUsers([]);
          localStorage.removeItem(key);
        }
      } catch (error) {
        console.error("[Typing] Failed to read status:", error);
        setTypingUsers([]);
      }
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [viewer?.id, roomId, isGuest]);

  return { typingUsers };
}
