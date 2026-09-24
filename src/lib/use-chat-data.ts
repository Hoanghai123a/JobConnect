import { useState, useEffect, useCallback } from "react";
import type { UserRecord } from "./pocketbase";
import { pb } from "./pocketbase";
import { batchLoadRoomPreviews } from "./chat-batch-api";
import { invalidateChatCache, cleanupOldMessages, type RoomPreview } from "./chat-cache";

type ChatRoom = {
  id: string;
  name: string;
  description: string;
  is_default: boolean;
  created_by: string;
  created: string;
  updated: string;
};

type ChatRoomMember = {
  id: string;
  room: string;
  user: string;
  created: string;
};

type JoinRequest = {
  id: string;
  room: string;
  user: string;
  status: string;
  created: string;
};

export type ChatRoomListData = {
  rooms: ChatRoom[];
  previews: Map<string, RoomPreview>;
  memberships: ChatRoomMember[];
  pendingRequests: JoinRequest[];
  myRequests: JoinRequest[];
};

export function useChatRoomList(params: {
  viewer: UserRecord | null;
  isAdmin: boolean;
  isGuest: boolean;
  reloadToken?: number;
}) {
  const { viewer, isAdmin, isGuest, reloadToken } = params;

  const [data, setData] = useState<ChatRoomListData | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    if (!viewer && !isGuest) {
      setLoading(false);
      return;
    }

    try {
      const isFirstLoad = !data;
      if (isFirstLoad) {
        setLoading(true);
      } else {
        setUpdating(true);
      }

      const [rooms, memberships, pendingRequests, myRequests] = await Promise.all([
        isGuest
          ? pb.collection("chat_rooms").getFullList<ChatRoom>({
              filter: "is_default = true",
            })
          : pb.collection("chat_rooms").getFullList<ChatRoom>(),

        isAdmin
          ? pb.collection("chat_room_members").getFullList<ChatRoomMember>()
          : viewer
          ? pb.collection("chat_room_members").getFullList<ChatRoomMember>({
              filter: `user = "${viewer.id}"`,
            })
          : Promise.resolve([]),

        isAdmin
          ? pb.collection("chat_join_requests").getFullList<JoinRequest>({
              filter: 'status = "pending"',
            })
          : Promise.resolve([]),

        viewer
          ? pb.collection("chat_join_requests").getFullList<JoinRequest>({
              filter: `user = "${viewer.id}"`,
            })
          : Promise.resolve([]),
      ]);

      const roomIds = rooms.map((r) => r.id);
      let previews = new Map<string, RoomPreview>();

      if (viewer && roomIds.length > 0) {
        previews = await batchLoadRoomPreviews(viewer, roomIds);
      }

      setData({
        rooms,
        previews,
        memberships,
        pendingRequests,
        myRequests,
      });
      setError("");
    } catch (err) {
      console.error("useChatRoomList error:", err);
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
      setUpdating(false);
    }
  }, [viewer, isAdmin, isGuest, data]);

  useEffect(() => {
    void loadData();
  }, [viewer?.id, isAdmin, isGuest, reloadToken]);

  return { data, loading, updating, error };
}
