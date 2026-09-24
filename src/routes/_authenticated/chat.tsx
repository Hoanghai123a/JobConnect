import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pb, type UserRecord } from "@/lib/pocketbase";
import { useAuth } from "@/lib/auth";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import { AppHeader } from "@/components/layout/BottomNav";
import { markSeen, getSeen } from "@/lib/seen";
import { useChatRoomList } from "@/lib/use-chat-data";
import { useChatRealtime } from "@/lib/use-chat-realtime";
import { useChatCacheManager } from "@/lib/use-chat-cache-manager";
import { useChatRoomMessages } from "@/lib/use-chat-messages";
import { useOnlineStatus, useOfflineQueue } from "@/lib/use-offline-queue";
import { trackRoomVisit, startBackgroundSync, setupVisibilitySync } from "@/lib/chat-background-sync";
import { logPerformanceReport } from "@/lib/chat-performance";
import { useTypingBroadcast, useTypingListener } from "@/lib/use-typing-indicator";
import { useMessageSearch } from "@/lib/use-message-search";
import { useMessageReactions, REACTION_EMOJIS } from "@/lib/use-message-reactions";
import { MessageReactions, ReactionPicker } from "@/components/chat/MessageReactions";
import type { RoomPreview } from "@/lib/chat-cache";
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
  CircleX,
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

  // Data loading từ hook
  const [reloadToken, setReloadToken] = useState(0);
  const chatData = useChatRoomList({
    viewer: user,
    isAdmin,
    isGuest,
    reloadToken,
  });

  useChatRealtime({
    viewer: user,
    isAdmin,
    onMembersChanged: () => setReloadToken(t => t + 1),
    onRequestsChanged: () => setReloadToken(t => t + 1),
  });

  // Smart cache invalidation và auto-cleanup
  useChatCacheManager({
    viewer: user,
    onCacheInvalidated: () => setReloadToken(t => t + 1),
  });

  // Background sync service
  useEffect(() => {
    if (!user) return;

    console.log("[BackgroundSync] Setting up background sync service");

    const stopBackgroundSync = startBackgroundSync(user);
    const stopVisibilitySync = setupVisibilitySync(user);

    return () => {
      stopBackgroundSync?.();
      stopVisibilitySync?.();
    };
  }, [user?.id]);

  // Expose performance report để user có thể gọi từ console
  useEffect(() => {
    // @ts-ignore - Expose to window for debugging
    window.chatPerformanceReport = logPerformanceReport;

    console.log(
      "%c💡 Tip: Gọi window.chatPerformanceReport() để xem performance report",
      "color: #00aa00; font-weight: bold"
    );

    return () => {
      // @ts-ignore
      delete window.chatPerformanceReport;
    };
  }, []);

  // Extract data từ hook
  const rooms = chatData.data?.rooms || [];
  const previews = chatData.data?.previews || new Map();
  const memberships = chatData.data?.memberships || [];
  const pendingRequests = chatData.data?.pendingRequests || [];
  const myRequests = chatData.data?.myRequests || [];
  const roomsLoading = chatData.loading;

  // UI state
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [meFresh, setMeFresh] = useState<ChatUser | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedSearch(search);
  const [showRequestsDialog, setShowRequestsDialog] = useState(false);
  const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set());
  const [showRoomForm, setShowRoomForm] = useState<null | {
    mode: "create" | "edit";
    room?: ChatRoom;
  }>(null);
  const [roomToDelete, setRoomToDelete] = useState<ChatRoom | null>(null);
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

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

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
      setReloadToken((prev) => prev + 1);
    } catch (error) {
      toast.error(getErrorMessage(error, "Lỗi lưu phòng"));
    }
  };

  const deleteRoom = async (room: ChatRoom) => {
    console.log("[deleteRoom] Called with room:", room);
    if (room.is_default) {
      toast.error("Không thể xoá nhóm mặc định");
      return;
    }
    try {
      console.log("[deleteRoom] Deleting room:", room.id);
      await pb.collection("chat_rooms").delete(room.id);
      toast.success("Đã xoá phòng");
      setShowRoomForm(null);
      setRoomToDelete(null);
      if (activeRoomId === room.id) setActiveRoomId(null);
      setReloadToken((prev) => prev + 1);
    } catch (error) {
      console.error("[deleteRoom] Error:", error);
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
      setReloadToken((prev) => prev + 1);
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
      setReloadToken((prev) => prev + 1);
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
            <div className="flex items-center gap-2">
              <Link to="/admin/chat-bans">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9 w-9 p-0"
                  title="Quản lý chặn"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </Link>
              <button
                onClick={openCreateRoom}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm active:scale-95"
                aria-label="Tạo phòng"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
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
                preview={chatData.data?.previews.get(room.id)}
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
              type="button"
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (showRoomForm.room) {
                  setRoomToDelete(showRoomForm.room);
                }
              }}
              className="sm:mr-auto"
            >
              <Trash2 className="h-4 w-4" />
              Xoá phòng
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => setShowRoomForm(null)}>
            Huỷ
          </Button>
          <Button type="button" onClick={() => void submitRoomForm()}>
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

      {/* Confirm Delete Dialog */}
      <ResponsiveOverlay
        open={roomToDelete !== null}
        onOpenChange={(open) => !open && setRoomToDelete(null)}
        title="Xác nhận xóa phòng"
        description={`Bạn có chắc muốn xóa phòng "${roomToDelete?.name}"? Tất cả tin nhắn sẽ bị mất và không thể khôi phục.`}
      >
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setRoomToDelete(null)}>
            Hủy
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              if (roomToDelete) {
                void deleteRoom(roomToDelete);
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
            Xóa phòng
          </Button>
        </DialogFooter>
      </ResponsiveOverlay>
    </div>
  );
}

function RoomListItem({
  room,
  preview,
  userId,
  isGuest,
  isAdmin,
  onOpen,
  onEdit,
}: {
  room: ChatRoom;
  preview?: RoomPreview;
  userId?: string;
  isGuest: boolean;
  isAdmin: boolean;
  onOpen: () => void;
  onEdit: () => void;
}) {
  // NEW: Dùng preview từ props
  const lastMessage = preview?.lastMessage || null;
  const unreadCount = preview?.unreadCount || 0;
  const pressTimerRef = useRef<number | null>(null);

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
  // Lock viewport height để header không bị đẩy lên khi bàn phím xuất hiện
  const [viewportHeight, setViewportHeight] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return window.innerHeight;
    }
    return 0;
  });

  useEffect(() => {
    // Lưu chiều cao viewport ban đầu
    const initialHeight = window.innerHeight;
    setViewportHeight(initialHeight);

    // Ngăn body scroll khi bàn phím xuất hiện
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = `${initialHeight}px`;

    return () => {
      // Cleanup khi unmount
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.height = '';
    };
  }, []);

  // Hook mới: useChatRoomMessages với cache-first pattern
  const isGuest = !user;
  const {
    messages,
    setMessages,
    loading,
    hasMore,
    totalCount,
    setTotalCount,
    page,
    setPage,
    setHasMore,
    loadMore,
    reload: reloadMessages,
  } = useChatRoomMessages({
    viewer: user,
    roomId: room.id,
    pageSize: PAGE_SIZE,
    isGuest,
  });

  // Offline support
  const isOnline = useOnlineStatus();
  const { queue, queueSize, enqueue, processQueue } = useOfflineQueue();

  // Typing indicators
  const { notifyTyping, clearTyping } = useTypingBroadcast({ viewer: user, roomId: room.id, isGuest });
  const { typingUsers } = useTypingListener({ viewer: user, roomId: room.id, isGuest });

  // Message search
  const { query: searchQuery, results: searchResults, searching, search, clearSearch } = useMessageSearch({ viewer: user, roomId: room.id, isGuest });

  // UI states
  const [content, setContent] = useState("");
  const [showEmojis, setShowEmojis] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null); // messageId
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [actionMessage, setActionMessage] = useState<ChatMessage | null>(null);
  const [roomBans, setRoomBans] = useState<ChatRoomBan[]>([]);
  const [isAnonymous, setIsAnonymous] = useState(() => {
    // Load từ localStorage, mặc định là false (hiện họ tên)
    const saved = localStorage.getItem("chat_anonymous_mode");
    return saved === "true";
  });
  const [showAnonymousToast, setShowAnonymousToast] = useState(false);
  const [messageTimeVisible, setMessageTimeVisible] = useState<string | null>(null);

  // Refs
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const pressTimerRef = useRef<number | null>(null);
  const pageRef = useRef(1);

  const toggleAnonymous = () => {
    const newValue = !isAnonymous;
    setIsAnonymous(newValue);
    localStorage.setItem("chat_anonymous_mode", String(newValue));

    // Hiển thị toast
    setShowAnonymousToast(true);
    setTimeout(() => setShowAnonymousToast(false), 1500);
  };

  // Check ban status và mark seen khi messages load xong
  useEffect(() => {
    const handleMessagesLoaded = async () => {
      if (loading) return; // Chờ load xong

      // Track room visit cho background sync prefetch
      trackRoomVisit(room.id);

      // Check ban status (chỉ cho non-admin users)
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

      // Refresh user data
      if (!isGuest) {
        await onRefreshMe();
      }

      // Mark seen
      const latest = messages[messages.length - 1];
      if (!isGuest && latest) {
        markSeen(
          chatSeenScope(room.id),
          user?.id,
          new Date(latest.created).getTime(),
        );
      }

      // Auto-scroll to bottom (chỉ lần đầu load)
      window.setTimeout(() => endRef.current?.scrollIntoView({ behavior: "auto" }), 0);
    };

    void handleMessagesLoaded();
  }, [loading, messages.length]); // Trigger khi loading changes hoặc có messages mới

  // Auto-process offline queue khi online
  useEffect(() => {
    if (!isOnline || queueSize === 0 || isGuest) return;

    console.log(`[Offline] Online detected, processing ${queueSize} queued messages`);

    const sendQueuedMessage = async (queuedMsg: any) => {
      try {
        const savedMessage = await pb.collection("group_chat_messages").create({
          user: queuedMsg.userId,
          room: queuedMsg.roomId,
          content: queuedMsg.content,
          is_anonymous: queuedMsg.isAnonymous,
        });

        // Update UI - replace temp message với real message
        setMessages((current) =>
          current.map((m) =>
            m.id === queuedMsg.id
              ? ({ ...savedMessage, expand: { user: user! } } as ChatMessage)
              : m
          )
        );

        return { success: true };
      } catch (error) {
        console.error("[Offline] Failed to send queued message:", error);
        return { success: false, error: getErrorMessage(error, "Lỗi gửi") };
      }
    };

    void processQueue(sendQueuedMessage).then((result) => {
      if (result.sent > 0) {
        toast.success(`Đã gửi ${result.sent} tin nhắn đang chờ`);
      }
      if (result.failed > 0) {
        toast.error(`${result.failed} tin nhắn gửi thất bại`);
      }
    });
  }, [isOnline, queueSize, isGuest, user, processQueue]);

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
    setLoadingOlder(true);
    try {
      await loadMore();
      // Maintain scroll position after loading older messages
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

    // OPTIMISTIC UI: Tạo tin nhắn tạm thời với ID unique
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const optimisticMessage: ChatMessage = {
      id: tempId,
      room: room.id,
      user: user!.id,
      content: text,
      is_anonymous: isAnonymous,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      expand: { user: user! },
      _pending: true, // Flag để hiển thị loading state
    } as ChatMessage & { _pending?: boolean };

    // 1. Hiển thị tin nhắn ngay lập tức
    setMessages((current) => [...current, optimisticMessage]);
    setTotalCount((current) => current + 1);
    setContent("");
    setShowEmojis(false);
    setSending(true);

    // Scroll xuống tin nhắn mới ngay
    window.setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 100);

    // 2. Kiểm tra online/offline status
    if (!isOnline) {
      // OFFLINE: Queue message để gửi sau
      console.log("[Offline] Queuing message for later:", tempId);

      enqueue({
        id: tempId,
        roomId: room.id,
        content: text,
        isAnonymous,
        userId: user!.id,
      });

      // Mark message as queued (vẫn pending nhưng có icon khác)
      setMessages((current) =>
        current.map((m) =>
          m.id === tempId
            ? ({ ...m, _pending: true, _queued: true } as ChatMessage & { _queued?: boolean })
            : m
        )
      );

      toast.info("Tin nhắn sẽ được gửi khi online");
      setSending(false);
      return;
    }

    // 3. ONLINE: Gửi lên server background
    try {
      const savedMessage = await pb.collection("group_chat_messages").create({
        user: user!.id,
        room: room.id,
        content: text,
        is_anonymous: isAnonymous,
      });

      // 4. Replace tin nhắn tạm với tin nhắn thật từ server
      const messageWithUser: ChatMessage = {
        ...savedMessage,
        expand: { user: user! },
      } as ChatMessage;

      setMessages((current) =>
        current.map((m) => (m.id === tempId ? messageWithUser : m))
      );
    } catch (error) {
      // 5. Nếu lỗi, đánh dấu tin nhắn failed
      setMessages((current) =>
        current.map((m) =>
          m.id === tempId
            ? ({ ...m, _pending: false, _failed: true, _error: getErrorMessage(error, "Lỗi gửi") } as ChatMessage & { _failed?: boolean; _error?: string })
            : m
        )
      );
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
    : !isOnline
      ? "Offline"
      : isAdmin
        ? "Admin"
        : blocked
          ? "Đang bị chặn"
          : "Hoạt động";

  return (
    <div
      className="fixed inset-x-0 top-0 flex flex-col overflow-hidden bg-background"
      style={{
        height: viewportHeight > 0 ? `${viewportHeight}px` : "100vh",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)"
      }}
    >
      <header
        className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-card/90 px-3 backdrop-blur-xl"
        style={{ paddingTop: "0.5rem", paddingBottom: "0.5rem" }}
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
            {typingUsers.length > 0 ? (
              <span className="text-primary animate-pulse">
                {typingUsers[0]} đang gõ...
              </span>
            ) : (
              `Đã tải ${stats.loaded}/${stats.total} tin`
            )}
          </div>
        </div>
        {!isGuest && (
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setShowSearch(!showSearch)}
            className="h-9 w-9 rounded-full"
            title="Tìm tin nhắn"
          >
            <Search className="h-4 w-4" />
          </Button>
        )}
        <StatusChip tone={blocked ? "danger" : "success"}>{titleBadge}</StatusChip>
      </header>
      <main className="flex min-h-0 flex-1 flex-col gap-2 px-3 py-2">
        {!isAdmin && blocked && (
          <Card className="shrink-0 border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Bạn đang bị chặn trong trò chuyện. Chỉ xem được nội dung.
          </Card>
        )}

        {!isOnline && !isGuest && (
          <Card className="shrink-0 border-orange-200 bg-orange-50 p-3 text-sm text-orange-700">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-orange-500"></div>
              <span>
                Bạn đang offline.
                {queueSize > 0 && ` ${queueSize} tin nhắn sẽ được gửi khi online.`}
              </span>
            </div>
          </Card>
        )}

        {showSearch && !isGuest && (
          <Card className="shrink-0 space-y-2 rounded-2xl p-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Tìm tin nhắn..."
                  value={searchQuery}
                  onChange={(e) => search(e.target.value)}
                  className="rounded-xl pl-10"
                  autoFocus
                />
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  setShowSearch(false);
                  clearSearch();
                }}
                className="h-9 w-9 rounded-full"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {searching && (
              <div className="text-xs text-muted-foreground">Đang tìm...</div>
            )}
            {searchQuery && !searching && searchResults.length === 0 && (
              <div className="text-xs text-muted-foreground">Không tìm thấy tin nhắn nào</div>
            )}
            {searchResults.length > 0 && (
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {searchResults.map((result) => {
                  const author = result.message.expand?.user;
                  return (
                    <button
                      key={result.message.id}
                      type="button"
                      onClick={() => {
                        // Scroll to message (simplified - just close search)
                        setShowSearch(false);
                        clearSearch();
                        // TODO: Implement scroll to specific message
                      }}
                      className="w-full rounded-lg border border-border bg-background p-2 text-left text-xs hover:bg-muted"
                    >
                      <div className="font-medium text-foreground">
                        {author?.full_name || author?.username || "Ai đó"}
                      </div>
                      <div className="truncate text-muted-foreground">{result.message.content}</div>
                    </button>
                  );
                })}
              </div>
            )}
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
                const isPending = (m as any)._pending;
                const isFailed = (m as any)._failed;
                const isQueued = (m as any)._queued;
                const errorMsg = (m as any)._error;

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
                          "block rounded-2xl px-3 py-2 text-left shadow-sm transition-opacity",
                          mine
                            ? "bg-primary text-primary-foreground"
                            : "border border-border bg-card text-foreground",
                          isPending && "opacity-60",
                          isFailed && "opacity-50 border-red-300",
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-1 whitespace-pre-wrap text-[14px] leading-relaxed">
                            {m.content}
                          </div>
                          {isPending && !isQueued && (
                            <div className="flex-shrink-0 pt-0.5">
                              <svg className="h-4 w-4 animate-spin text-current opacity-70" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                            </div>
                          )}
                          {isQueued && (
                            <div className="flex-shrink-0 pt-0.5 text-orange-500" title="Đang chờ gửi khi online">
                              <Clock3 className="h-4 w-4" />
                            </div>
                          )}
                          {isFailed && (
                            <div className="flex-shrink-0 pt-0.5 text-red-500" title={errorMsg}>
                              <CircleX className="h-4 w-4" />
                            </div>
                          )}
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

                      {/* Message Reactions */}
                      {!isPending && !isFailed && (
                        <div className="px-1">
                          <MessageReactions
                            messageId={m.id}
                            viewer={user}
                            isGuest={isGuest}
                            mine={mine}
                          />
                        </div>
                      )}

                      {isFailed && mine && (
                        <button
                          onClick={() => {
                            // Retry gửi tin nhắn
                            setContent(m.content);
                            setMessages(current => current.filter(msg => msg.id !== m.id));
                            setTotalCount(current => current - 1);
                          }}
                          className="text-xs text-red-600 hover:text-red-700 underline px-1"
                        >
                          Thử lại
                        </button>
                      )}

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
                    onChange={(e) => {
                      setContent(e.target.value);
                      notifyTyping(); // Broadcast typing status
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.altKey) {
                        e.preventDefault();
                        clearTyping(); // Clear typing status khi gửi
                        void send();
                      }
                    }}
                    onBlur={clearTyping} // Clear typing status khi blur
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
