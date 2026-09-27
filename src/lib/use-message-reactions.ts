import { useState, useEffect, useCallback } from "react";
import { pb } from "./pocketbase";
import type { UserRecord } from "./pocketbase";

/**
 * Message Reactions Hook
 * Quản lý reactions (emoji) cho chat messages
 */

export type MessageReaction = {
  id: string;
  message: string;
  user: string;
  emoji: string;
  created: string;
  expand?: {
    user?: {
      id: string;
      username: string;
      full_name: string;
    };
  };
};

export type ReactionSummary = {
  emoji: string;
  count: number;
  userIds: string[];
  hasMyReaction: boolean;
};

/**
 * Hook để quản lý reactions cho một message
 */
export function useMessageReactions(params: {
  viewer: UserRecord | null;
  messageId: string;
  isGuest?: boolean;
}) {
  const { viewer, messageId, isGuest = false } = params;

  const [reactions, setReactions] = useState<MessageReaction[]>([]);
  const [loading, setLoading] = useState(true);

  /**
   * Load reactions cho message
   */
  const loadReactions = useCallback(async () => {
    if (isGuest) {
      setReactions([]);
      setLoading(false);
      return;
    }

    try {
      const res = await pb.collection("chat_message_reactions").getFullList<MessageReaction>({
        filter: `message = "${messageId}"`,
        expand: "user",
        sort: "created",
      });

      setReactions(res);
    } catch (error) {
      console.error("[Reactions] Load error:", error);
      setReactions([]);
    } finally {
      setLoading(false);
    }
  }, [messageId, isGuest]);

  /**
   * Add reaction (optimistic UI)
   */
  const addReaction = useCallback(
    async (emoji: string) => {
      if (!viewer || isGuest) return;

      // Check if already reacted with this emoji
      const existingReaction = reactions.find(
        (r) => r.user === viewer.id && r.emoji === emoji,
      );

      if (existingReaction) {
        // Remove reaction instead
        await removeReaction(existingReaction.id);
        return;
      }

      // Optimistic UI
      const tempId = `temp_${Date.now()}`;
      const tempReaction: MessageReaction = {
        id: tempId,
        message: messageId,
        user: viewer.id,
        emoji,
        created: new Date().toISOString(),
        expand: {
          user: {
            id: viewer.id,
            username: viewer.username,
            full_name: viewer.full_name,
          },
        },
      };

      setReactions((current) => [...current, tempReaction]);

      try {
        // Create reaction
        const created = await pb.collection("chat_message_reactions").create<MessageReaction>({
          message: messageId,
          user: viewer.id,
          emoji,
        });

        // Replace temp with real reaction
        setReactions((current) =>
          current.map((r) => (r.id === tempId ? { ...created, expand: tempReaction.expand } : r)),
        );
      } catch (error) {
        console.error("[Reactions] Add error:", error);
        // Rollback optimistic update
        setReactions((current) => current.filter((r) => r.id !== tempId));
      }
    },
    [viewer, messageId, reactions, isGuest],
  );

  /**
   * Remove reaction
   */
  const removeReaction = useCallback(
    async (reactionId: string) => {
      if (!viewer || isGuest) return;

      // Optimistic UI
      setReactions((current) => current.filter((r) => r.id !== reactionId));

      try {
        await pb.collection("chat_message_reactions").delete(reactionId);
      } catch (error) {
        console.error("[Reactions] Remove error:", error);
        // Reload on error
        void loadReactions();
      }
    },
    [viewer, isGuest, loadReactions],
  );

  /**
   * Get reaction summary grouped by emoji
   */
  const getReactionSummary = useCallback((): ReactionSummary[] => {
    const grouped = new Map<string, ReactionSummary>();

    for (const reaction of reactions) {
      const existing = grouped.get(reaction.emoji);

      if (existing) {
        existing.count++;
        existing.userIds.push(reaction.user);
        if (viewer && reaction.user === viewer.id) {
          existing.hasMyReaction = true;
        }
      } else {
        grouped.set(reaction.emoji, {
          emoji: reaction.emoji,
          count: 1,
          userIds: [reaction.user],
          hasMyReaction: viewer ? reaction.user === viewer.id : false,
        });
      }
    }

    return Array.from(grouped.values());
  }, [reactions, viewer]);

  // Load reactions on mount
  useEffect(() => {
    void loadReactions();
  }, [loadReactions]);

  // Realtime subscription
  useEffect(() => {
    if (isGuest) return;

    const unsubscribe = pb
      .collection("chat_message_reactions")
      .subscribe<MessageReaction>("*", (e) => {
        if (e.record.message !== messageId) return;

        if (e.action === "create") {
          setReactions((current) => {
            // Avoid duplicates
            if (current.some((r) => r.id === e.record.id)) return current;
            return [...current, e.record];
          });
        } else if (e.action === "delete") {
          setReactions((current) => current.filter((r) => r.id !== e.record.id));
        }
      });

    return () => {
      void unsubscribe.then((unsub) => unsub());
    };
  }, [messageId, isGuest]);

  return {
    reactions,
    loading,
    addReaction,
    removeReaction,
    getReactionSummary,
    reload: loadReactions,
  };
}

/**
 * Common emoji reactions
 */
export const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
