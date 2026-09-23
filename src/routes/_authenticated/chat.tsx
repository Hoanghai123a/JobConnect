import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pb, type UserRecord } from "@/lib/pocketbase";
import { useAuth } from "@/lib/auth";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import { AppHeader } from "@/components/layout/BottomNav";
import { markSeen, getSeen } from "@/lib/seen";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { DataLoadingState } from "@/components/ui/data-loading-state";
import { StatusChip } from "@/components/ui/status-chip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import {
  Check,
  ChevronLeft,
  Clock3,
  CornerDownLeft,
  MessageSquareText,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  SmilePlus,
  Trash2,
  UserPlus,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ResponsiveOverlay } from "@/components/layout/ResponsiveOverlay";

export const Route = createFileRoute("/_authenticated/chat")({
  component: GroupChatPage,
});

type ChatUser = UserRecord & { chat_blocked?: boolean };

type ChatRoom = {
  id: string;
  name: string;
  description?: string;
  is_default?: boolean;
  created_by?: string;
  created?: string;
  updated?: string;
};

type ChatRoomMember = {
  id: string;
  room: string;
  user: string;
};

type ChatRoomBan = {
  id: string;
  room: string;
  user: string;
  banned_by: string;
  created: string;
};

type JoinRequest = {
  id: string;
  room: string;
  user: string;
  status: "pending" | "approved" | "rejected";
  handled_by?: string;
  handled_at?: string;
  created?: string;
  expand?: {
    user?: ChatUser;
    room?: ChatRoom;
  };
};

type ChatMessage = {
  id: string;
  user: string;
  room?: string;
  content: string;
  created: string;
  is_anonymous?: boolean;
  expand?: { user?: ChatUser };
};

const PAGE_SIZE = 50;
const QUICK_EMOJIS = ["😀", "😂", "❤️", "👍", "🙏", "🎉", "😢", "😮", "🔥", "✅"];
const GUEST_CHAT_ROOM: ChatRoom = {
  id: "q7g5csz1o870d2y",
  name: "Trò chuyện chung",
  description: "Xem tin nhắn công khai. Đăng nhập để chat.",
  is_default: true,
};
// ID của phòng mặc định trên server để Guest có thể xem
const DEFAULT_ROOM_ID = "q7g5csz1o870d2y";

function sortMessages(items: ChatMessage[]) {
  return [...items].sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());
}

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const map = new Map<string, ChatMessage>();
  for (const row of current) map.set(row.id, row);
  for (const row of incoming) map.set(row.id, row);
  return sortMessages(Array.from(map.values()));
}

function chatSeenScope(roomId: string) {
  return `chat:${roomId}`;
}
function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (message) return String(message);
  }
  return fallback;
}

function GroupChatPage() {
  const { user, isAdmin } = useAuth();
  const isGuest = !user;
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [memberships, setMemberships] = useState<ChatRoomMember[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [meFresh, setMeFresh] = useState<ChatUser | null>(null);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedSearch(search);
  const [pendingRequests, setPendingRequests] = useState<JoinRequest[]>([]);
  const [myRequests, setMyRequests] = useState<JoinRequest[]>([]);
  const [showRequestsDialog, setShowRequestsDialog] = useState(false);
  const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set());
  const [showRoomForm, setShowRoomForm] = useState<null | {
    mode: "create" | "edit";
    room?: ChatRoom;
  }>(null);
  const [roomForm, setRoomForm] = useState<{ name: string; description: string; is_default: boolean }>({
    name: "",
    description: "",
    is_default: false,
  });

  const activeRoom = useMemo(
    () => rooms.find((r) => r.id === activeRoomId) || null,
    [rooms, activeRoomId],
  );

  const myMemberRoomIds = useMemo(
    () => new Set(memberships.filter((m) => m.user === user?.id).map((m) => m.room)),
    [memberships, user?.id],
  );

  const myPendingRoomIds = useMemo(
    () =>
      new Set(
        myRequests.filter((r) => r.status === "pending" && r.user === user?.id).map((r) => r.room),
      ),
    [myRequests, user?.id],
  );

  const loadMe = useCallback(async () => {
    if (!user?.id) {
      setMeFresh(null);
      return;
    }
    try {
      const mine = (await pb.collection("users").getOne(user.id)) as ChatUser;
      setMeFresh(mine);
    } catch {
      // ignore
    }
  }, [user?.id]);

  const loadRooms = useCallback(async () => {
    if (isGuest) {
      try {
        // Guest có thể xem tất cả phòng có is_default = true
        const res = await pb.collection("chat_rooms").getFullList({
          filter: 'is_default = true',
          sort: "name"
        });
        setRooms(res as unknown as ChatRoom[]);
      } catch (error) {
        // Fallback về phòng hardcode nếu lỗi
        setRooms([GUEST_CHAT_ROOM]);
      }
      return;
    }
    try {
      const res = await pb.collection("chat_rooms").getFullList({ sort: "-is_default,name" });
      setRooms(res as unknown as ChatRoom[]);
    } catch (error) {
      toast.error(getErrorMessage(error, "Lỗi tải danh sách phòng"));
    }
  }, [isGuest]);

  const loadMemberships = useCallback(async () => {
    if (!user?.id) {
      setMemberships([]);
      return;
    }
    try {
      const filter = isAdmin ? "" : `user = "${user.id}"`;
      const res = await pb.collection("chat_room_members").getFullList({
        ...(filter ? { filter } : {}),
      });
      setMemberships(res as unknown as ChatRoomMember[]);
    } catch {
      // silent
    }
  }, [user?.id, isAdmin]);

  const loadJoinRequests = useCallback(async () => {
    if (!user?.id) {
      setPendingRequests([]);
      setMyRequests([]);
      return;
    }
    try {
      if (isAdmin) {
        const res = await pb.collection("chat_join_requests").getFullList({
          filter: 'status = "pending"',
          sort: "-created",
          expand: "user,room",
        });
        setPendingRequests(res as unknown as JoinRequest[]);
      }
      const mine = await pb.collection("chat_join_requests").getFullList({
        filter: `user = "${user.id}"`,
        sort: "-created",
      });
      setMyRequests(mine as unknown as JoinRequest[]);
    } catch {
      // silent
    }
  }, [user?.id, isAdmin]);

  const loadAll = useCallback(async () => {
    setRoomsLoading(true);
    try {
      await Promise.all([loadRooms(), loadMemberships(), loadJoinRequests(), loadMe()]);
    } finally {
      setRoomsLoading(false);
    }
  }, [loadRooms, loadMemberships, loadJoinRequests, loadMe]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Realtime subscriptions thay cho polling
  useEffect(() => {
    if (isGuest) return;

    // Subscribe chat_room_members
    const unsubMembers = pb.collection("chat_room_members").subscribe("*", () => {
      void loadMemberships();
    });

    // Subscribe chat_join_requests
    const unsubRequests = pb.collection("chat_join_requests").subscribe("*", () => {
      void loadJoinRequests();
    });

    return () => {
      void unsubMembers.then((unsub) => unsub());
      void unsubRequests.then((unsub) => unsub());
    };
  }, [isGuest, loadMemberships, loadJoinRequests]);

  const visibleRooms = useMemo(() => {
    if (isGuest) return rooms;
    if (isAdmin) return rooms;
    // User thường: hiển thị phòng mặc định + các phòng đã join
    return rooms.filter((r) => r.is_default || myMemberRoomIds.has(r.id));
  }, [rooms, myMemberRoomIds, isAdmin, isGuest]);

  const searchResults = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return [];

    if (isGuest) {
      // Guest chỉ tìm trong phòng đã load (phòng mặc định)
      return [];
    }

    // User: tìm các phòng chưa join (loại trừ phòng mặc định và phòng đã join)
    return rooms.filter(
      (r) =>
        !r.is_default &&
        !myMemberRoomIds.has(r.id) &&
        (r.name.toLowerCase().includes(q) || (r.description || "").toLowerCase().includes(q)),
    );
  }, [debouncedSearch, rooms, myMemberRoomIds, isGuest]);

  const openRoom = (room: ChatRoom) => {
    setActiveRoomId(room.id);
  };

  const closeRoom = () => setActiveRoomId(null);

  const openCreateRoom = () => {
    setRoomForm({ name: "", description: "", is_default: false });
    setShowRoomForm({ mode: "create" });
  };

  const openEditRoom = (room: ChatRoom) => {
    setRoomForm({
      name: room.name,
      description: room.description || "",
      is_default: room.is_default || false
    });
    setShowRoomForm({ mode: "edit", room });
  };

  const submitRoomForm = async () => {
    const name = roomForm.name.trim();
    if (!name) {
      toast.error("Tên phòng bắt buộc");
      return;
    }
    try {
      if (showRoomForm?.mode === "edit" && showRoomForm.room) {
        await pb.collection("chat_rooms").update(showRoomForm.room.id, {
          name,
          description: roomForm.description.trim(),
          is_default: roomForm.is_default,
        });
        toast.success("Đã cập nhật phòng");
      } else {
        await pb.collection("chat_rooms").create({
          name,
          description: roomForm.description.trim(),
          is_default: roomForm.is_default,
          created_by: user?.id || "",
        });
        toast.success("Đã tạo phòng mới");
      }
      setShowRoomForm(null);
      await loadRooms();
    } catch (error) {
      toast.error(getErrorMessage(error, "Lỗi lưu phòng"));
    }
  };

  const deleteRoom = async (room: ChatRoom) => {
    if (room.is_default) {
      toast.error("Không thể xoá nhóm mặc định");
      return;
    }
    if (!confirm(`Xoá phòng "${room.name}"? Tất cả tin nhắn sẽ bị mất.`)) return;
    try {
      await pb.collection("chat_rooms").delete(room.id);
      toast.success("Đã xoá phòng");
      setShowRoomForm(null);
      if (activeRoomId === room.id) setActiveRoomId(null);
      await loadAll();
    } catch (error) {
      toast.error(getErrorMessage(error, "Lỗi xoá phòng"));
    }
  };

  const requestJoin = async (room: ChatRoom) => {
    if (!user?.id) return;
    try {
      await pb.collection("chat_join_requests").create({
        room: room.id,
        user: user.id,
        status: "pending",
      });
      toast.success(`Đã gửi yêu cầu vào "${room.name}"`);
      setSearch("");
      await loadJoinRequests();
    } catch (error) {
      toast.error(getErrorMessage(error, "Lỗi gửi yêu cầu"));
    }
  };

  const toggleRequestSelected = (id: string) => {
    setSelectedRequests((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRequests = async (approve: boolean) => {
    if (!selectedRequests.size) return;
    const ids = Array.from(selectedRequests);
    try {
      for (const id of ids) {
        const req = pendingRequests.find((r) => r.id === id);
        if (!req) continue;
        await pb.collection("chat_join_requests").update(id, {
          status: approve ? "approved" : "rejected",
          handled_by: user?.id || "",
          handled_at: new Date().toISOString().replace("T", " ").slice(0, 19),
        });
        if (approve) {
          const already = memberships.find((m) => m.room === req.room && m.user === req.user);
          if (!already) {
            await pb.collection("chat_room_members").create({
              room: req.room,
              user: req.user,
            });
          }
        }
      }
      toast.success(approve ? "Đã duyệt" : "Đã từ chối");
      setSelectedRequests(new Set());
      await Promise.all([loadJoinRequests(), loadMemberships()]);
    } catch (error) {
      toast.error(getErrorMessage(error, "Lỗi xử lý yêu cầu"));
    }
  };

  if (activeRoom) {
    return (
      <RoomChatView
        room={activeRoom}
        user={user}
        meFresh={meFresh}
        isAdmin={isAdmin}
        onBack={closeRoom}
        onRefreshMe={loadMe}
      />
    );
  }

  const pendingCount = pendingRequests.length;

  return (
    <div className="pb-nav">
      <AppHeader
        title="Trò chuyện"
        subtitle={
          roomsLoading
            ? "Đang tải..."
            : `${visibleRooms.length} phòng${isAdmin && pendingCount ? ` · ${pendingCount} yêu cầu` : ""}`
        }
        right={
          isAdmin ? (
            <button
              onClick={openCreateRoom}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm active:scale-95"
              aria-label="Tạo phòng"
            >
              <Plus className="h-4 w-4" />
            </button>
          ) : null
        }
      />
      <div className="space-y-3 px-3 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          {!isGuest && (
            <Input
              placeholder="Tìm phòng chat để xin tham gia..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-2xl pl-10"
            />
          )}
        </div>

        {!isGuest && search.trim() && (
          <Card className="space-y-2 rounded-2xl p-3">
            <div className="text-xs font-semibold text-muted-foreground">
              Kết quả tìm kiếm ({searchResults.length})
            </div>
            {searchResults.length === 0 ? (
              <div className="text-xs text-muted-foreground">Không có phòng phù hợp</div>
            ) : (
              searchResults.map((room) => {
                const pending = myPendingRoomIds.has(room.id);
                return (
                  <div
                    key={room.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-card px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{room.name}</div>
                      {room.description && (
                        <div className="truncate text-[11px] text-muted-foreground">
                          {room.description}
                        </div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant={pending ? "outline" : "default"}
                      disabled={pending}
                      onClick={() => void requestJoin(room)}
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      {pending ? "Đã gửi" : "Xin vào"}
                    </Button>
                  </div>
                );
              })
            )}
          </Card>
        )}

        {isAdmin && pendingCount > 0 && (
          <button
            type="button"
            onClick={() => {
              setSelectedRequests(new Set());
              setShowRequestsDialog(true);
            }}
            className="flex w-full items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-left shadow-sm active:scale-[0.99]"
          >
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 text-white">
                <UserPlus className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-amber-900">Yêu cầu tham gia</div>
                <div className="text-[11px] text-amber-800">
                  {pendingCount} yêu cầu đang chờ duyệt
                </div>
              </div>
            </div>
            <StatusChip tone="warning">{pendingCount}</StatusChip>
          </button>
        )}

        {roomsLoading ? (
          <DataLoadingState variant="list" label="Đang tải danh sách phòng chat..." rows={3} />
        ) : visibleRooms.length === 0 ? (
          <EmptyState
            icon={MessageSquareText}
            title="Chưa có phòng nào"
            description={
              isAdmin
                ? "Bấm nút + để tạo phòng chat mới."
                : "Tìm phòng chat phía trên để xin tham gia."
            }
          />
        ) : (
          <div className="space-y-2">
            {visibleRooms.map((room) => (
              <RoomListItem
                key={room.id}
                room={room}
                userId={user?.id}
                isGuest={isGuest}
                isAdmin={isAdmin}
                onOpen={() => openRoom(room)}
                onEdit={() => openEditRoom(room)}
              />
            ))}
          </div>
        )}
      </div>

      <ResponsiveOverlay
        open={showRoomForm !== null}
        onOpenChange={(open) => !open && setShowRoomForm(null)}
        title={showRoomForm?.mode === "edit" ? "Sửa phòng chat" : "Tạo phòng chat"}
        description="Đặt tên và mô tả ngắn để người dùng dễ tìm phòng."
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium">Tên phòng *</label>
            <Input
              value={roomForm.name}
              onChange={(e) => setRoomForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="VD: Thông báo, Nhà xưởng A..."
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium">Mô tả</label>
            <Textarea
              value={roomForm.description}
              onChange={(e) => setRoomForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Mô tả ngắn về phòng này..."
              rows={3}
              className="mt-1 rounded-xl"
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="is-default"
              checked={roomForm.is_default}
              onCheckedChange={(checked) =>
                setRoomForm((f) => ({ ...f, is_default: checked as boolean }))
              }
            />
            <label
              htmlFor="is-default"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Phòng mặc định (tất cả user đều thấy)
            </label>
          </div>
        </div>
        <DialogFooter>
          {showRoomForm?.mode === "edit" && showRoomForm.room && !showRoomForm.room.is_default && (
            <Button
              variant="destructive"
              onClick={() => showRoomForm.room && void deleteRoom(showRoomForm.room)}
              className="sm:mr-auto"
            >
              <Trash2 className="h-4 w-4" />
              Xoá phòng
            </Button>
          )}
          <Button variant="outline" onClick={() => setShowRoomForm(null)}>
            Huỷ
          </Button>
          <Button onClick={() => void submitRoomForm()}>
            <Check className="h-4 w-4" />
            Lưu
          </Button>
        </DialogFooter>
      </ResponsiveOverlay>

      <ResponsiveOverlay
        open={showRequestsDialog}
        onOpenChange={(open) => !open && setShowRequestsDialog(false)}
        title="Yêu cầu tham gia phòng"
        description="Chọn nhiều yêu cầu để duyệt hoặc từ chối cùng lúc."
        presentation="full"
      >
        {pendingRequests.length === 0 ? (
          <EmptyState
            icon={UserPlus}
            title="Không có yêu cầu"
            description="Tất cả yêu cầu đã được xử lý."
          />
        ) : (
          <>
            <label className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
              <Checkbox
                checked={
                  selectedRequests.size === pendingRequests.length && pendingRequests.length > 0
                }
                onCheckedChange={(c) =>
                  setSelectedRequests(c ? new Set(pendingRequests.map((r) => r.id)) : new Set())
                }
              />
              Chọn tất cả ({pendingRequests.length})
            </label>

            <div className="space-y-2">
              {pendingRequests.map((req) => {
                const u = req.expand?.user;
                const room = req.expand?.room;
                return (
                  <label
                    key={req.id}
                    className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card px-3 py-2 shadow-sm"
                  >
                    <Checkbox
                      checked={selectedRequests.has(req.id)}
                      onCheckedChange={() => toggleRequestSelected(req.id)}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">
                        {u?.full_name || u?.username || "Ẩn danh"}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        Xin vào: <span className="font-medium">{room?.name || "?"}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <StatusChip tone="warning">Chờ duyệt</StatusChip>
                        {req.created && (
                          <StatusChip tone="neutral">
                            {new Date(req.created).toLocaleDateString("vi-VN")}
                          </StatusChip>
                        )}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            {selectedRequests.size > 0 && (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-primary/10 px-3 py-2">
                <span className="text-xs font-medium text-primary">
                  {selectedRequests.size} đã chọn
                </span>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void handleRequests(true)}>
                    <Check className="h-3.5 w-3.5" /> Duyệt
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => void handleRequests(false)}
                  >
                    <X className="h-3.5 w-3.5" /> Từ chối
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </ResponsiveOverlay>
    </div>
  );
}

function RoomListItem({
  room,
  userId,
  isGuest,
  isAdmin,
  onOpen,
  onEdit,
}: {
  room: ChatRoom;
  userId?: string;
  isGuest: boolean;
  isAdmin: boolean;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const [lastMessage, setLastMessage] = useState<ChatMessage | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const pressTimerRef = useRef<number | null>(null);
  const previewInFlightRef = useRef(false);

  const loadPreview = useCallback(async () => {
    if (previewInFlightRef.current) return;
    previewInFlightRef.current = true;
    try {
      const res = await pb.collection("group_chat_messages").getList(1, 1, {
        filter: `room = "${room.id}"`,
        sort: "-created",
        expand: "user",
      });
      const items = (res.items as unknown as ChatMessage[]) || [];
      setLastMessage(items[0] || null);

      // Guest không có unread count
      if (userId && !isGuest) {
        const seen = getSeen(chatSeenScope(room.id), userId);
        const seenIso = seen ? new Date(seen).toISOString().replace("T", " ") : "";
        const countRes = await pb.collection("group_chat_messages").getList(1, 1, {
          filter: seenIso
            ? `room = "${room.id}" && created > "${seenIso}" && user != "${userId}"`
            : `room = "${room.id}" && user != "${userId}"`,
        });
        setUnreadCount(countRes.totalItems || 0);
      } else {
        setUnreadCount(0);
      }
    } catch {
      // silent
    } finally {
      previewInFlightRef.current = false;
    }
  }, [room.id, userId, isGuest]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  // Realtime subscription cho tin nhắn mới trong room
  useEffect(() => {
    if (isGuest) return;

    const unsubscribe = pb.collection("group_chat_messages").subscribe("*", (e) => {
      if (e.record && (e.record as any).room === room.id) {
        void loadPreview();
      }
    });

    return () => {
      void unsubscribe.then((unsub) => unsub());
    };
  }, [room.id, isGuest, loadPreview]);

  const startPress = () => {
    if (!isAdmin) return;
    if (pressTimerRef.current) window.clearTimeout(pressTimerRef.current);
    pressTimerRef.current = window.setTimeout(() => {
      onEdit();
    }, 520);
  };

  const stopPress = () => {
    if (!pressTimerRef.current) return;
    window.clearTimeout(pressTimerRef.current);
    pressTimerRef.current = null;
  };

  return (
    <button
      type="button"
      onClick={onOpen}
      onPointerDown={startPress}
      onPointerUp={stopPress}
      onPointerCancel={stopPress}
      onPointerLeave={stopPress}
      onContextMenu={(e) => {
        if (!isAdmin) return;
        e.preventDefault();
        onEdit();
      }}
      className="flex w-full items-start gap-3 rounded-2xl border border-border/60 bg-card px-3 py-3 text-left shadow-sm transition active:scale-[0.99]"
    >
      <div
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-primary-foreground shadow-sm",
          room.is_default ? "bg-primary" : "bg-accent-foreground/80",
        )}
      >
        <Users className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{room.name}</span>
          {room.is_default && (
            <StatusChip tone="info" className="h-5 px-1.5 text-[10px]">
              Mặc định
            </StatusChip>
          )}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {lastMessage
            ? `${lastMessage.expand?.user?.full_name || lastMessage.expand?.user?.username || "Ai đó"}: ${lastMessage.content}`
            : room.description || "Chưa có tin nhắn"}
        </div>
      </div>
      {unreadCount > 0 && (
        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </button>
  );
}

function RoomChatView({
  room,
  user,
  meFresh,
  isAdmin,
  onBack,
  onRefreshMe,
}: {
  room: ChatRoom;
  user: UserRecord | null;
  meFresh: ChatUser | null;
  isAdmin: boolean;
  onBack: () => void;
  onRefreshMe: () => Promise<void>;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [content, setContent] = useState("");
  const [showEmojis, setShowEmojis] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [actionMessage, setActionMessage] = useState<ChatMessage | null>(null);
  const [roomBans, setRoomBans] = useState<ChatRoomBan[]>([]);
  const [isAnonymous, setIsAnonymous] = useState(() => {
    // Load từ localStorage, mặc định là false (hiện họ tên)
    const saved = localStorage.getItem("chat_anonymous_mode");
    return saved === "true";
  });
  const [showAnonymousToast, setShowAnonymousToast] = useState(false);
  const [messageTimeVisible, setMessageTimeVisible] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const pressTimerRef = useRef<number | null>(null);
  const pageRef = useRef(1);
  const isGuest = !user;

  const toggleAnonymous = () => {
    const newValue = !isAnonymous;
    setIsAnonymous(newValue);
    localStorage.setItem("chat_anonymous_mode", String(newValue));

    // Hiển thị toast
    setShowAnonymousToast(true);
    setTimeout(() => setShowAnonymousToast(false), 1500);
  };

  const fetchMessagePage = useCallback(
    async (pageNo: number) => {
      if (isGuest) {
        // Guest xem tin nhắn từ phòng mặc định (dùng ID cố định)
        try {
          const res = await pb.collection("group_chat_messages").getList(pageNo, PAGE_SIZE, {
            filter: `room = "${DEFAULT_ROOM_ID}"`,
            sort: "-created",
            expand: "user",
          });
          return {
            items: ((res.items as unknown as ChatMessage[]) || []).reverse(),
            totalItems: res.totalItems || 0,
            totalPages: res.totalPages || 1,
          };
        } catch (error) {
          // Nếu không load được, trả về empty
          console.error("Guest cannot load messages:", error);
          return {
            items: [],
            totalItems: 0,
            totalPages: 1,
          };
        }
      }
      const res = await pb.collection("group_chat_messages").getList(pageNo, PAGE_SIZE, {
        filter: `room = "${room.id}"`,
        sort: "-created",
        expand: "user",
      });
      return {
        items: ((res.items as unknown as ChatMessage[]) || []).reverse(),
        totalItems: res.totalItems || 0,
        totalPages: res.totalPages || 1,
      };
    },
    [room.id, isGuest],
  );

  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      console.log("[Chat] loadInitial started for room:", room.id);

      // Kiểm tra xem user có bị ban khỏi phòng này không
      if (!isGuest && user && !isAdmin) {
        const bans = await pb.collection("chat_room_bans").getFullList({
          filter: `room="${room.id}" && user="${user.id}"`,
        });

        if (bans.length > 0) {
          toast.error("Bạn đã bị chặn khỏi phòng này");
          onBack();
          return;
        }
      }

      const pageData = await fetchMessagePage(1);
      console.log("[Chat] fetchMessagePage returned:", pageData);
      if (!isGuest) await onRefreshMe();
      setMessages(pageData.items);
      setTotalCount(pageData.totalItems);
      setHasMore(pageData.totalPages > 1);
      setPage(1);
      pageRef.current = 1;
      const latest = pageData.items[pageData.items.length - 1];
      if (!isGuest) {
        markSeen(
          chatSeenScope(room.id),
          user?.id,
          latest ? new Date(latest.created).getTime() : Date.now(),
        );
      }
      window.setTimeout(() => endRef.current?.scrollIntoView({ behavior: "auto" }), 0);
      console.log("[Chat] loadInitial completed successfully");
    } catch (error) {
      console.error("[Chat] loadInitial error:", error);
      toast.error(getErrorMessage(error, "Lỗi tải trò chuyện"));
    } finally {
      setLoading(false);
    }
  }, [fetchMessagePage, isGuest, onRefreshMe, room.id, user?.id]);

  // Load messages khi vào phòng
  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  // Load danh sách bans trong phòng
  useEffect(() => {
    if (isGuest || !isAdmin) return;

    const loadBans = async () => {
      try {
        const bans = await pb.collection("chat_room_bans").getFullList<ChatRoomBan>({
          filter: `room="${room.id}"`,
        });
        setRoomBans(bans);
      } catch (error) {
        console.error("[Chat] Failed to load room bans:", error);
      }
    };

    void loadBans();
  }, [isGuest, isAdmin, room.id]);

  // Realtime subscription để theo dõi bans và đá user ra khỏi phòng
  useEffect(() => {
    if (isGuest || !user) return;

    console.log("[Chat] Setting up ban monitoring for user:", user.id);

    let unsubscribe: (() => void) | null = null;

    pb.collection("chat_room_bans")
      .subscribe("*", (event) => {
        console.log("[Chat] Ban event:", event.action, event.record);

        // Kiểm tra nếu user này bị ban khỏi phòng này
        if (
          event.action === "create" &&
          event.record.room === room.id &&
          event.record.user === user.id
        ) {
          toast.error("Bạn đã bị chặn khỏi phòng này");
          // Đá user ra khỏi phòng
          onBack();
        }

        // Cập nhật danh sách bans cho admin
        if (isAdmin) {
          pb.collection("chat_room_bans")
            .getFullList<ChatRoomBan>({
              filter: `room="${room.id}"`,
            })
            .then(setRoomBans)
            .catch((error) => console.error("[Chat] Failed to refresh bans:", error));
        }
      })
      .then((unsub) => {
        unsubscribe = unsub;
      });

    return () => {
      console.log("[Chat] Cleaning up ban monitoring");
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [isGuest, user, room.id, isAdmin, onBack]);

  // Realtime subscription để nhận tin nhắn mới
  useEffect(() => {
    if (isGuest) return; // Guest không subscribe realtime

    console.log("[Chat] Setting up realtime subscription for room:", room.id);

    let unsubscribe: (() => void) | null = null;

    pb.collection("group_chat_messages")
      .subscribe(
        "*",
        (event) => {
          console.log("[Chat] Realtime event:", event.action, event.record);

          // Chỉ xử lý tin nhắn của phòng này
          if (event.record.room !== room.id) return;

          if (event.action === "create") {
            // Bỏ qua tin nhắn của chính mình vì Optimistic UI đã thêm rồi
            if (event.record.user === user?.id) {
              console.log("[Chat] Skipping own message from realtime (already added by optimistic UI)");
              return;
            }

            // Kiểm tra xem tin nhắn đã có trong list chưa (tránh duplicate)
            setMessages((current) => {
              if (current.some((m) => m.id === event.record.id)) {
                console.log("[Chat] Message already exists:", event.record.id);
                return current;
              }

              // Thêm tin nhắn mới vào cuối
              const newMessage: ChatMessage = {
                ...event.record,
                expand: event.record.expand,
              } as ChatMessage;

              console.log("[Chat] Adding message from another user:", event.record.id);
              return [...current, newMessage];
            });

            setTotalCount((current) => current + 1);

            // Scroll xuống tin nhắn mới (chỉ tin nhắn từ người khác đến đây)
            window.setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
          } else if (event.action === "delete") {
            setMessages((current) => current.filter((m) => m.id !== event.record.id));
            setTotalCount((current) => Math.max(0, current - 1));
          }
        },
        { expand: "user" },
      )
      .then((unsub) => {
        unsubscribe = unsub;
      });

    return () => {
      console.log("[Chat] Cleaning up realtime subscription for room:", room.id);
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [isGuest, room.id, user?.id]);

  const loadOlder = async () => {
    if (!hasMore || loadingOlder) return;
    const box = scrollRef.current;
    const previousHeight = box?.scrollHeight || 0;
    const nextPage = page + 1;
    setLoadingOlder(true);
    try {
      const pageData = await fetchMessagePage(nextPage);
      setMessages((current) => mergeMessages(pageData.items, current));
      setPage(nextPage);
      pageRef.current = nextPage;
      setHasMore(nextPage < pageData.totalPages);
      window.setTimeout(() => {
        if (!box) return;
        box.scrollTop = box.scrollHeight - previousHeight;
      }, 0);
    } catch (error) {
      toast.error(getErrorMessage(error, "Không tải được tin nhắn cũ"));
    } finally {
      setLoadingOlder(false);
    }
  };

  const onScrollMessages = () => {
    if ((scrollRef.current?.scrollTop || 0) <= 16) {
      void loadOlder();
    }
  };

  const blocked = !!meFresh?.chat_blocked;
  const stats = useMemo(
    () => ({
      total: totalCount || messages.length,
      loaded: messages.length,
    }),
    [messages.length, totalCount],
  );

  const send = async () => {
    const text = content.trim();
    if (!text) {
      toast.error("Nội dung không được để trống");
      return;
    }

    // Guest không thể gửi tin nhắn
    if (isGuest) {
      toast.error("Vui lòng đăng nhập để gửi tin nhắn");
      return;
    }

    if (!isAdmin && blocked) {
      toast.error("Bạn đang bị chặn trong trò chuyện");
      return;
    }

    // Kiểm tra có bị chặn khỏi phòng này không
    if (!isAdmin && user && roomBans.some((ban) => ban.user === user.id)) {
      toast.error("Bạn đã bị chặn khỏi phòng này");
      return;
    }

    setSending(true);
    try {
      const newMessage = await pb.collection("group_chat_messages").create({
        user: user.id,
        room: room.id,
        content: text,
        is_anonymous: isAnonymous,
      });

      // Thêm tin nhắn vào UI ngay lập tức (Optimistic UI)
      const messageWithUser: ChatMessage = {
        ...newMessage,
        expand: { user },
      } as ChatMessage;

      setMessages((current) => [...current, messageWithUser]);
      setTotalCount((current) => current + 1);
      setContent("");
      setShowEmojis(false);

      // Scroll xuống tin nhắn mới
      window.setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (error) {
      toast.error(getErrorMessage(error, "Lỗi gửi tin nhắn"));
    } finally {
      setSending(false);
    }
  };

  const appendEmoji = (emoji: string) => {
    setContent((current) => `${current}${emoji}`);
    inputRef.current?.focus();
  };

  const deleteMessage = async (id: string) => {
    // Guest không thể xóa tin nhắn
    if (isGuest) {
      toast.error("Vui lòng đăng nhập để xóa tin nhắn");
      return;
    }

    try {
      await pb.collection("group_chat_messages").delete(id);
      setActionMessage(null);
      toast.success("Đã xóa tin nhắn");
      // Realtime subscription sẽ tự động xóa tin nhắn khỏi danh sách
    } catch (error) {
      toast.error(getErrorMessage(error, "Lỗi xoá tin nhắn"));
    }
  };

  const toggleBlock = async (target: ChatUser) => {
    try {
      await pb.collection("users").update(target.id, { chat_blocked: !target.chat_blocked });
      toast.success(target.chat_blocked ? "Đã bỏ chặn" : "Đã chặn");
      setActionMessage(null);
      // Không cần refresh - chỉ thay đổi trạng thái user
    } catch (error) {
      toast.error(getErrorMessage(error, "Lỗi chặn user"));
    }
  };

  const banUserFromRoom = async (targetUserId: string) => {
    try {
      await pb.collection("chat_room_bans").create({
        room: room.id,
        user: targetUserId,
        banned_by: user?.id,
      });
      toast.success("Đã chặn user khỏi phòng");
      setActionMessage(null);

      // Reload bans list
      const bans = await pb.collection("chat_room_bans").getFullList<ChatRoomBan>({
        filter: `room="${room.id}"`,
      });
      setRoomBans(bans);
    } catch (error) {
      toast.error(getErrorMessage(error, "Lỗi chặn user khỏi phòng"));
    }
  };

  const unbanUserFromRoom = async (targetUserId: string) => {
    try {
      // Tìm ban record
      const bans = await pb.collection("chat_room_bans").getFullList({
        filter: `room="${room.id}" && user="${targetUserId}"`,
      });

      if (bans.length > 0) {
        await pb.collection("chat_room_bans").delete(bans[0].id);
        toast.success("Đã bỏ chặn user khỏi phòng");
        setActionMessage(null);

        // Reload bans list
        const updatedBans = await pb.collection("chat_room_bans").getFullList<ChatRoomBan>({
          filter: `room="${room.id}"`,
        });
        setRoomBans(updatedBans);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "Lỗi bỏ chặn user"));
    }
  };

  const startPress = (message: ChatMessage) => {
    if (!isAdmin) return;
    if (pressTimerRef.current) window.clearTimeout(pressTimerRef.current);
    pressTimerRef.current = window.setTimeout(() => setActionMessage(message), 520);
  };

  const stopPress = () => {
    if (!pressTimerRef.current) return;
    window.clearTimeout(pressTimerRef.current);
    pressTimerRef.current = null;
  };

  const titleBadge = isGuest
    ? "Offline"
    : isAdmin
      ? "Admin"
      : blocked
        ? "Đang bị chặn"
        : "Hoạt động";

  return (
    <div
      className="flex min-h-0 flex-col overflow-hidden"
      style={{ height: "calc(100dvh - 5.5rem - env(safe-area-inset-bottom))" }}
    >
      <header
        className="sticky top-0 z-30 flex items-center gap-2 border-b border-border/60 bg-card/90 px-3 backdrop-blur-xl"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.5rem)", paddingBottom: "0.5rem" }}
      >
        <button
          onClick={onBack}
          className="-ml-1 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition active:scale-95 active:bg-muted"
          aria-label="Quay lại"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold leading-tight tracking-tight">
            {room.name}
          </h1>
          <div className="truncate text-[11px] leading-tight text-muted-foreground">
            {`Đã tải ${stats.loaded}/${stats.total} tin`}
          </div>
        </div>
        {isAdmin && (
          <Link to="/admin/chat-bans">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              title="Quản lý chặn"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </Link>
        )}
        <StatusChip tone={blocked ? "danger" : "success"}>{titleBadge}</StatusChip>
      </header>
      <main className="flex min-h-0 flex-1 flex-col gap-2 px-3 py-2">
        {!isAdmin && blocked && (
          <Card className="shrink-0 border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Bạn đang bị chặn trong trò chuyện. Chỉ xem được nội dung.
          </Card>
        )}

        <Card className="min-h-0 flex-1 overflow-hidden rounded-2xl">
          <div
            ref={scrollRef}
            onScroll={onScrollMessages}
            className="h-full space-y-2 overflow-y-auto overscroll-contain px-3 py-3"
          >
            {hasMore && (
              <button
                type="button"
                onClick={() => void loadOlder()}
                disabled={loadingOlder}
                className="mx-auto block rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground"
              >
                {loadingOlder ? "Đang tải..." : "Tải thêm 50 tin cũ"}
              </button>
            )}

            {loading && messages.length === 0 ? (
              <DataLoadingState variant="list" label="Đang tải hội thoại..." rows={4} />
            ) : messages.length === 0 ? (
              <EmptyState
                icon={MessageSquareText}
                title="Chưa có tin nhắn"
                description="Gửi tin đầu tiên để bắt đầu hội thoại nhóm."
              />
            ) : (
              messages.map((m) => {
                const author = m.expand?.user;
                const mine = !isGuest && m.user === user?.id;
                const actionOpen = actionMessage?.id === m.id;
                const time = new Date(m.created).toLocaleString("vi-VN");
                return (
                  <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                    <div
                      className={cn("max-w-[82%] space-y-1", mine ? "items-end" : "items-start")}
                    >
                      {!mine && (
                        <div className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {m.is_anonymous
                              ? "Ẩn danh"
                              : (author?.full_name || author?.username || "Ẩn danh")}
                          </span>
                          {!m.is_anonymous && author?.role === "admin" && (
                            <>
                              <span>·</span>
                              <span>Admin</span>
                            </>
                          )}
                          {author?.chat_blocked && (
                            <StatusChip tone="danger" className="h-5 px-2 text-[10px]">
                              Đã chặn
                            </StatusChip>
                          )}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setMessageTimeVisible(messageTimeVisible === m.id ? null : m.id);
                        }}
                        onPointerDown={() => startPress(m)}
                        onPointerUp={stopPress}
                        onPointerCancel={stopPress}
                        onPointerLeave={stopPress}
                        onContextMenu={(event) => {
                          if (!isAdmin) return;
                          event.preventDefault();
                          setActionMessage(m);
                        }}
                        className={cn(
                          "block rounded-2xl px-3 py-2 text-left shadow-sm",
                          mine
                            ? "bg-primary text-primary-foreground"
                            : "border border-border bg-card text-foreground",
                        )}
                      >
                        <div className="whitespace-pre-wrap text-[14px] leading-relaxed">
                          {m.content}
                        </div>
                        {messageTimeVisible === m.id && (
                          <div
                            className={cn(
                              "mt-1 flex items-center gap-1 text-[10px]",
                              mine
                                ? "justify-end text-primary-foreground/70"
                                : "text-muted-foreground",
                            )}
                          >
                            <Clock3 className="h-3 w-3" />
                            {time}
                          </div>
                        )}
                      </button>

                      {isAdmin && author && actionOpen && (
                        <div className="space-y-1.5 rounded-lg border border-border bg-background p-2 shadow-soft">
                          {m.is_anonymous && author.id !== user?.id && (
                            <div className="flex items-center gap-1.5 border-b border-border pb-1.5 text-xs text-muted-foreground">
                              <span className="font-medium text-foreground">
                                {author.full_name || author.username || "Không rõ"}
                              </span>
                              <span>·</span>
                              <span className="italic text-amber-600">Ẩn danh</span>
                              {author.role === "admin" && (
                                <>
                                  <span>·</span>
                                  <span>Admin</span>
                                </>
                              )}
                            </div>
                          )}
                          <div className="flex items-center gap-1">
                            {author.id !== user?.id && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void toggleBlock(author)}
                                >
                                  <ShieldCheck className="h-3.5 w-3.5" />
                                  {author.chat_blocked ? "Bỏ chặn toàn cục" : "Chặn toàn cục"}
                                </Button>
                                {roomBans.some((ban) => ban.user === author.id) ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void unbanUserFromRoom(author.id)}
                                  >
                                    <ShieldCheck className="h-3.5 w-3.5" />
                                    Bỏ chặn khỏi phòng
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => void banUserFromRoom(author.id)}
                                  >
                                    <ShieldCheck className="h-3.5 w-3.5" />
                                    Chặn khỏi phòng
                                  </Button>
                                )}
                              </>
                            )}
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => void deleteMessage(m.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Xóa
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setActionMessage(null)}>
                              Đóng
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={endRef} />
          </div>
        </Card>

        <div className="shrink-0">
          <Card className="space-y-2 rounded-2xl border-border/80 bg-background/95 p-2 shadow-lg backdrop-blur">
            {isGuest ? (
              <div className="rounded-xl border border-dashed border-blue-200 bg-blue-50 p-3 text-center text-sm text-blue-700">
                📖 Chế độ xem. <span className="font-medium">Đăng nhập để gửi tin nhắn.</span>
              </div>
            ) : !isAdmin && blocked ? (
              <div className="rounded-xl border border-dashed border-red-200 bg-red-50 p-3 text-sm text-red-700">
                Đang bị chặn nên không thể gửi tin nhắn.
              </div>
            ) : (
              <>
                {showEmojis && (
                  <div className="flex gap-1 overflow-x-auto pb-1">
                    {QUICK_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => appendEmoji(emoji)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-base transition hover:bg-muted"
                        aria-label={`Thêm ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => {
                      setShowEmojis((value) => !value);
                      inputRef.current?.focus();
                    }}
                    aria-label="Icon"
                    className="h-10 w-10 rounded-full"
                  >
                    <SmilePlus className="h-4 w-4" />
                  </Button>
                  <div className="relative">
                    {showAnonymousToast && (
                      <div className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2 zoom-in-95 duration-300 whitespace-nowrap rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background shadow-lg">
                        {isAnonymous ? "Đang ẩn danh" : "Hiện họ tên"}
                      </div>
                    )}
                    <Button
                      type="button"
                      size="icon"
                      variant={isAnonymous ? "default" : "outline"}
                      onClick={toggleAnonymous}
                      aria-label={isAnonymous ? "Đang ẩn danh" : "Hiện họ tên"}
                      className="h-10 w-10 rounded-full"
                      title={isAnonymous ? "Đang gửi ẩn danh - Click để hiện họ tên" : "Đang hiện họ tên - Click để ẩn danh"}
                    >
                      <UserRound className="h-4 w-4" />
                    </Button>
                  </div>
                  <Textarea
                    ref={inputRef}
                    rows={1}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.altKey) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                    placeholder="Nhập tin nhắn..."
                    maxLength={500}
                    className="min-h-10 resize-none rounded-2xl py-2 text-sm"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() => {
                      setContent((prev) => prev + "\n");
                      inputRef.current?.focus();
                    }}
                    aria-label="Xuống dòng"
                    className="h-10 w-10 rounded-full"
                  >
                    <CornerDownLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    onClick={() => void send()}
                    disabled={sending}
                    aria-label="Gửi"
                    className="h-10 w-10 rounded-full"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}
