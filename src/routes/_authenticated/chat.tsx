import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pb, type UserRecord } from "@/lib/pocketbase";
import { useAuth } from "@/lib/auth";
import { AppHeader } from "@/components/layout/BottomNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusChip } from "@/components/ui/status-chip";
import { toast } from "sonner";
import { Clock3, MessageSquareText, Send, ShieldCheck, SmilePlus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/chat")({
  component: GroupChatPage,
});

type ChatUser = UserRecord & { chat_blocked?: boolean };

type ChatMessage = {
  id: string;
  user: string;
  content: string;
  created: string;
  expand?: { user?: ChatUser };
};

const PAGE_SIZE = 50;
const QUICK_EMOJIS = ["😀", "😂", "❤️", "👍", "🙏", "🎉", "😢", "😮", "🔥", "✅"];

function sortMessages(items: ChatMessage[]) {
  return [...items].sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());
}

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const map = new Map<string, ChatMessage>();
  for (const row of current) map.set(row.id, row);
  for (const row of incoming) map.set(row.id, row);
  return sortMessages(Array.from(map.values()));
}

function GroupChatPage() {
  const { user, isAdmin } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [meFresh, setMeFresh] = useState<ChatUser | null>(null);
  const [content, setContent] = useState("");
  const [showEmojis, setShowEmojis] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [actionMessage, setActionMessage] = useState<ChatMessage | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const pressTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const pageRef = useRef(1);

  const fetchMessagePage = useCallback(async (pageNo: number) => {
    const res = await pb.collection("group_chat_messages").getList(pageNo, PAGE_SIZE, {
      sort: "-created",
      expand: "user",
    });
    return {
      items: ((res.items as unknown as ChatMessage[]) || []).reverse(),
      totalItems: res.totalItems || 0,
      totalPages: res.totalPages || 1,
    };
  }, []);

  const loadMe = useCallback(async () => {
    if (!user?.id) return;
    const mine = (await pb.collection("users").getOne(user.id)) as ChatUser;
    setMeFresh(mine);
  }, [user?.id]);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      const [pageData] = await Promise.all([fetchMessagePage(1), loadMe()]);
      setMessages(pageData.items);
      setTotalCount(pageData.totalItems);
      setHasMore(pageData.totalPages > 1);
      setPage(1);
      pageRef.current = 1;
      window.setTimeout(() => endRef.current?.scrollIntoView({ behavior: "auto" }), 0);
    } catch (error: any) {
      toast.error(error?.message || "Lỗi tải trò chuyện");
    } finally {
      setLoading(false);
    }
  }, [fetchMessagePage, loadMe]);

  const refreshLatest = useCallback(async () => {
    try {
      const [pageData] = await Promise.all([fetchMessagePage(1), loadMe()]);
      setTotalCount(pageData.totalItems);
      setHasMore(pageRef.current < pageData.totalPages);
      setMessages((current) => {
        const merged = mergeMessages(current, pageData.items);
        return pageRef.current <= 1 ? merged.slice(-PAGE_SIZE) : merged;
      });
    } catch {
      // Polling should stay quiet; manual actions surface errors.
    }
  }, [fetchMessagePage, loadMe]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    const timer = window.setInterval(refreshLatest, 3000);
    return () => window.clearInterval(timer);
  }, [refreshLatest]);

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
    } catch (error: any) {
      toast.error(error?.message || "Không tải được tin nhắn cũ");
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
    if (!user?.id) return;
    if (!isAdmin && blocked) {
      toast.error("Bạn đang bị chặn trong trò chuyện");
      return;
    }

    setSending(true);
    try {
      await pb.collection("group_chat_messages").create({
        user: user.id,
        content: text,
      });
      setContent("");
      setShowEmojis(false);
      await refreshLatest();
      window.setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 0);
    } catch (error: any) {
      toast.error(error?.message || "Lỗi gửi tin nhắn");
    } finally {
      setSending(false);
    }
  };

  const appendEmoji = (emoji: string) => {
    setContent((current) => `${current}${emoji}`);
    inputRef.current?.focus();
  };

  const deleteMessage = async (id: string) => {
    if (!confirm("Xoá tin nhắn này?")) return;
    try {
      await pb.collection("group_chat_messages").delete(id);
      setActionMessage(null);
      await refreshLatest();
      setMessages((current) => current.filter((row) => row.id !== id));
    } catch (error: any) {
      toast.error(error?.message || "Lỗi xoá tin nhắn");
    }
  };

  const toggleBlock = async (target: ChatUser) => {
    try {
      await pb.collection("users").update(target.id, { chat_blocked: !target.chat_blocked });
      toast.success(target.chat_blocked ? "Đã bỏ chặn" : "Đã chặn");
      setActionMessage(null);
      await refreshLatest();
    } catch (error: any) {
      toast.error(error?.message || "Lỗi chặn user");
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

  const titleBadge = isAdmin ? "Admin" : blocked ? "Đang bị chặn" : "Hoạt động";

  return (
    <div
      className="flex min-h-0 flex-col overflow-hidden"
      style={{ height: "calc(100dvh - 5.5rem - env(safe-area-inset-bottom))" }}
    >
      <AppHeader
        title="Trò chuyện"
        subtitle={`Đã tải ${stats.loaded}/${stats.total} tin`}
        right={<StatusChip tone={blocked ? "danger" : "success"}>{titleBadge}</StatusChip>}
      />
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
              <EmptyState
                icon={MessageSquareText}
                title="Đang tải hội thoại"
                description="Tin nhắn sẽ xuất hiện tại đây."
              />
            ) : messages.length === 0 ? (
              <EmptyState
                icon={MessageSquareText}
                title="Chưa có tin nhắn"
                description="Gửi tin đầu tiên để bắt đầu hội thoại nhóm."
              />
            ) : (
              messages.map((m) => {
                const author = m.expand?.user;
                const mine = m.user === user?.id;
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
                            {author?.full_name || author?.username || "Ẩn danh"}
                          </span>
                          <span>·</span>
                          <span>{author?.role === "admin" ? "Admin" : author?.company || "—"}</span>
                          {author?.chat_blocked && (
                            <StatusChip tone="danger" className="h-5 px-2 text-[10px]">
                              Đã chặn
                            </StatusChip>
                          )}
                        </div>
                      )}
                      <button
                        type="button"
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
                        <div
                          className={cn(
                            "whitespace-pre-wrap text-[14px] leading-relaxed",
                            m.content.length <= 4 && "text-2xl",
                          )}
                        >
                          {m.content}
                        </div>
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
                      </button>

                      {isAdmin && author && actionOpen && (
                        <div className="flex items-center gap-1 rounded-full border border-border bg-background p-1 shadow-soft">
                          {author.id !== user?.id && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void toggleBlock(author)}
                            >
                              <ShieldCheck className="h-3.5 w-3.5" />
                              {author.chat_blocked ? "Bỏ chặn" : "Chặn"}
                            </Button>
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
            {!isAdmin && blocked ? (
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
                  <Textarea
                    ref={inputRef}
                    rows={1}
                    value={content}
                    onFocus={() => setShowEmojis(true)}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Nhập tin nhắn..."
                    maxLength={500}
                    className="min-h-10 resize-none rounded-2xl py-2 text-sm"
                  />
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
