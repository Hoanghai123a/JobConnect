import { useEffect } from "react";
import { pb } from "./pocketbase";
import type { UserRecord } from "./pocketbase";

export function useChatRealtime(params: {
  viewer: UserRecord | null;
  isAdmin: boolean;
  onMembersChanged?: () => void;
  onRequestsChanged?: () => void;
}) {
  const { viewer, isAdmin, onMembersChanged, onRequestsChanged } = params;

  useEffect(() => {
    if (!viewer) return;

    const unsubscribers: Array<() => void> = [];

    pb.collection("group_chat_messages")
      .subscribe("*", (event) => {
        const roomId = (event.record as any).room;

        window.dispatchEvent(
          new CustomEvent("jobconnect:chat-cache-changed", {
            detail: {
              collection: "group_chat_messages",
              roomId,
              action: event.action,
              record: event.record,
            },
          }),
        );
      })
      .then((unsub) => {
        unsubscribers.push(unsub);
      })
      .catch((err) => {
        console.error("Failed to subscribe to messages:", err);
      });

    pb.collection("chat_room_members")
      .subscribe("*", () => {
        onMembersChanged?.();
      })
      .then((unsub) => {
        unsubscribers.push(unsub);
      })
      .catch((err) => {
        console.error("Failed to subscribe to members:", err);
      });

    pb.collection("chat_join_requests")
      .subscribe("*", () => {
        onRequestsChanged?.();
      })
      .then((unsub) => {
        unsubscribers.push(unsub);
      })
      .catch((err) => {
        console.error("Failed to subscribe to requests:", err);
      });

    return () => {
      for (const unsub of unsubscribers) {
        unsub();
      }
    };
  }, [viewer?.id, isAdmin, onMembersChanged, onRequestsChanged]);
}
