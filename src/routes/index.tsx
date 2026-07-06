import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { pb } from "@/lib/pocketbase";
import { useAuth } from "@/lib/auth";
import { useAppSettings } from "@/lib/app-settings";
import { isUserApproved } from "@/lib/user-approval";
import { getSeen } from "@/lib/seen";
import { BottomNav } from "@/components/layout/BottomNav";
import { FeatureTile } from "@/components/dashboard/FeatureTile";
import {
  Newspaper,
  Clock,
  BookOpen,
  MessageSquareWarning,
  Settings,
  Building2,
  CalendarCheck,
  Wallet,
  MessagesSquare,
  BusFront,
  Bell,
  ShieldCheck,
  Sprout,
  History,
  Users,
  LayoutGrid,
  Gamepad2,
  Gem,
  ChevronRight,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    if (!pb.authStore.isValid) throw redirect({ to: "/login", search: { redirect: "/" } as any });
    const u = pb.authStore.record as any;
    if (u && !isUserApproved(u)) throw redirect({ to: "/pending" });
    if (u?.role === "staff") throw redirect({ to: "/staff" });
  },
  component: DashboardPage,
});

type UtilKey = "utilities" | "entertainment" | null;

function DashboardPage() {
  const { loading, user, isAdmin } = useAuth();
  const { data: settings, logoUrl } = useAppSettings();
  const [pendingComplaintCount, setPendingComplaintCount] = useState(0);
  const [unread, setUnread] = useState({ news: 0, chat: 0, check: 0, advances: 0 });
  const [openUtil, setOpenUtil] = useState<UtilKey>(null);
  const nav = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      nav({ to: "/login" });
      return;
    }
    if (user.role === "staff") {
      nav({ to: "/staff" });
      return;
    }
    if (!isUserApproved(user)) {
      nav({ to: "/pending" });
    }
  }, [loading, nav, user]);

  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;

    (async () => {
      try {
        const res = await pb.collection("complaints").getList(1, 1, {
          filter: 'status = "pending"',
        });
        if (alive) setPendingComplaintCount(res.totalItems || 0);
      } catch {
        if (alive) setPendingComplaintCount(0);
      }
    })();

    return () => {
      alive = false;
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!user?.id) return;
    let alive = true;

    const since = (scope: string) => {
      const ts = getSeen(scope, user.id);
      return ts ? new Date(ts).toISOString().replace("T", " ") : "";
    };
    const countNewer = async (
      collection: string,
      field: string,
      scope: string,
      extraFilter = "",
    ) => {
      const seen = since(scope);
      const parts = [extraFilter, seen ? `${field} > "${seen}"` : ""].filter(Boolean);
      const res = await pb.collection(collection).getList(1, 1, {
        filter: parts.join(" && "),
      });
      return res.totalItems || 0;
    };

    (async () => {
      const me = `user = "${user.id}"`;
      const chatCount = async () => {
        try {
          const memberships = await pb.collection("chat_room_members").getFullList({
            filter: `user = "${user.id}"`,
          });
          const roomIds = (memberships as any[]).map((m) => m.room);
          if (!roomIds.length) return 0;
          let total = 0;
          for (const roomId of roomIds) {
            const seen = getSeen(`chat:${roomId}`, user.id);
            const seenIso = seen ? new Date(seen).toISOString().replace("T", " ") : "";
            const filter = [
              `room = "${roomId}"`,
              `user != "${user.id}"`,
              seenIso ? `created > "${seenIso}"` : "",
            ]
              .filter(Boolean)
              .join(" && ");
            const res = await pb.collection("group_chat_messages").getList(1, 1, { filter });
            total += res.totalItems || 0;
          }
          return total;
        } catch {
          return 0;
        }
      };
      const [news, chat, check, salary, advances] = await Promise.all([
        countNewer("recruitments", "created", "news", "is_active = true").catch(() => 0),
        chatCount(),
        countNewer("check_attendance_items", "created", "check-attendance", me).catch(() => 0),
        countNewer("check_salary_items", "created", "check-attendance", me).catch(() => 0),
        countNewer("advances", "resolved_at", "advances", me).catch(() => 0),
      ]);
      if (alive) setUnread({ news, chat, check: check + salary, advances });
    })();

    return () => {
      alive = false;
    };
  }, [user?.id]);

  if (loading || !user || !isUserApproved(user)) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-4 text-sm text-muted-foreground">
        Đang kiểm tra đăng nhập...
      </div>
    );
  }

  const hasEmployment = Boolean(user?.employee_code?.trim() && user?.company?.trim());
  const workDisabled = !isAdmin && !hasEmployment;
  const workDisabledReason =
    "Tính năng này chỉ dùng được khi bạn đã được admin gắn mã NV và nhà máy. Vui lòng liên hệ admin để cập nhật hồ sơ.";

  const toBadge = (count: number) => (count > 0 ? (count > 9 ? "9+" : String(count)) : undefined);

  const summaryParts: string[] = [];
  if (unread.news > 0) summaryParts.push(`${unread.news} tin tuyển dụng mới`);
  if (!workDisabled) {
    if (unread.check > 0) summaryParts.push(`${unread.check} bảng công/lương mới`);
    if (unread.advances > 0) summaryParts.push(`${unread.advances} phản hồi ứng lương`);
  }
  if (unread.chat > 0) summaryParts.push(`${unread.chat} tin nhắn chưa đọc`);
  const summaryText = summaryParts.join(" · ");

  return (
    <div className="pb-nav">
      <div className="sticky top-0 z-10 px-4 pb-2 pt-4">
        <div className="gradient-hero relative overflow-hidden rounded-[1.75rem] px-5 py-5 text-white shadow-soft">
          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/20 blur-2xl" />
          <div className="absolute -bottom-16 -left-8 h-44 w-44 rounded-full bg-white/10 blur-2xl" />

          <div className="relative flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white/95 shadow-soft">
              {logoUrl ? (
                <img src={logoUrl} alt="logo" className="logo-fit" />
              ) : (
                <Building2 className="h-6 w-6 text-primary" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-semibold leading-tight">
                {settings.company_name}
              </div>
              {settings.slogan && (
                <div className="truncate text-xs text-white/80">{settings.slogan}</div>
              )}
            </div>
          </div>

          <div className="relative mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <div className="text-sm text-white/80">Xin chào,</div>
            <div className="text-base font-semibold leading-tight">
              {user?.full_name || user?.username || "Bạn"}
            </div>

            <div className="inline-flex items-center rounded-full bg-white/20 px-2.5 py-0.5 text-[8px] uppercase tracking-wider backdrop-blur">
              {isAdmin ? "Quản trị viên" : "Nhân viên"}
            </div>
            {!isAdmin && hasEmployment && (
              <div className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] backdrop-blur">
                {user.company}
              </div>
            )}
          </div>

          {summaryText && (
            <div className="relative mt-3 flex items-start gap-2 rounded-2xl bg-white/15 px-3 py-2 backdrop-blur">
              <Bell className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="text-xs leading-snug">{summaryText}</div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4 px-4 pt-2">
        <section>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setOpenUtil("utilities")}
              className="group relative overflow-hidden rounded-3xl border bg-card p-4 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)] active:scale-[0.98]"
            >
              <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/10 blur-2xl transition-transform group-hover:scale-110" />
              <div className="relative flex items-start justify-between gap-2">
                <div className="gradient-primary flex h-11 w-11 items-center justify-center rounded-2xl text-primary-foreground shadow-sm">
                  <LayoutGrid className="h-5 w-5" />
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
              <div className="relative mt-3">
                <div className="text-sm font-semibold tracking-tight">Tiện ích</div>
                <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  Bảng tin, nhà xe, trò chuyện, hướng dẫn
                </div>
              </div>
              {(unread.news > 0 || unread.chat > 0) && (
                <span className="absolute right-3 top-3 inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                  {(() => {
                    const total = unread.news + unread.chat;
                    return total > 9 ? "9+" : total;
                  })()}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setOpenUtil("entertainment")}
              className="group relative overflow-hidden rounded-3xl border bg-card p-4 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)] active:scale-[0.98]"
            >
              <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-accent/40 blur-2xl transition-transform group-hover:scale-110" />
              <div className="relative flex items-start justify-between gap-2">
                <div className="gradient-accent flex h-11 w-11 items-center justify-center rounded-2xl text-accent-foreground shadow-sm">
                  <Gamepad2 className="h-5 w-5" />
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
              <div className="relative mt-3">
                <div className="text-sm font-semibold tracking-tight">Giải trí</div>
                <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  Vườn cây và các trò chơi thư giãn
                </div>
              </div>
            </button>
          </div>
        </section>

        <section className="rounded-3xl bg-card p-3 shadow-soft">
          <div className="flex items-center justify-between px-1 pb-2 pt-1">
            <div>
              <div className="text-sm font-semibold tracking-tight">Khi bạn đã đi làm</div>
              <div className="text-[11px] text-muted-foreground">
                {workDisabled
                  ? "Cần admin gắn mã NV để mở khoá"
                  : "Dành cho nhân sự đã được admin xác nhận"}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <FeatureTile
              to="/attendance"
              label="Tự chấm công"
              description="Ghi nhận giờ làm"
              icon={Clock}
              variant="accent"
              disabled={workDisabled}
              disabledReason={workDisabledReason}
            />
            <FeatureTile
              to="/check-attendance"
              label="Check công/lương"
              description="Kiểm tra bảng công"
              icon={CalendarCheck}
              variant="accent"
              disabled={workDisabled}
              disabledReason={workDisabledReason}
              badge={workDisabled ? undefined : toBadge(unread.check)}
            />
            <FeatureTile
              to="/advances"
              label="Ứng lương"
              description="Xin ứng lương"
              icon={Wallet}
              variant="accent"
              disabled={workDisabled}
              disabledReason={workDisabledReason}
              badge={workDisabled ? undefined : toBadge(unread.advances)}
            />
            <FeatureTile
              to="/complaints"
              label="Khiếu nại"
              description="Gửi phản ánh"
              icon={MessageSquareWarning}
              variant="accent"
              disabled={workDisabled}
              disabledReason={workDisabledReason}
              badge={
                !workDisabled && isAdmin && pendingComplaintCount > 0
                  ? pendingComplaintCount > 9
                    ? "9+"
                    : String(pendingComplaintCount)
                  : undefined
              }
            />
            {!isAdmin && (
              <FeatureTile
                to="/work-history"
                label="Lịch sử đi làm"
                description="Nhà máy, ngày vào/nghỉ"
                icon={History}
                variant="accent"
                disabled={workDisabled}
                disabledReason={workDisabledReason}
              />
            )}
          </div>
        </section>

        {isAdmin && (
          <section className="rounded-3xl bg-card p-3 shadow-soft">
            <div className="flex items-center justify-between px-1 pb-2 pt-1">
              <div>
                <div className="text-sm font-semibold tracking-tight">Quản trị</div>
                <div className="text-[11px] text-muted-foreground">Chỉ dành cho admin</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <FeatureTile
                to="/admin/accounts/stats"
                label="Thống kê TK"
                description="Đăng nhập theo role"
                icon={Users}
              />
              <FeatureTile
                to="/admin/staff"
                label="Quản lý staff"
                description="Tạo, import tài khoản staff"
                icon={ShieldCheck}
              />
              <FeatureTile
                to="/admin/workforce"
                label="Nhân sự đi làm"
                description="Tuyển dụng & danh sách NLĐ"
                icon={Users}
              />
              <FeatureTile
                to="/admin/settings"
                label="Cài đặt"
                description="Quản trị hệ thống"
                icon={Settings}
              />
            </div>
          </section>
        )}
      </div>

      <BottomNav />

      <Dialog open={openUtil !== null} onOpenChange={(o) => !o && setOpenUtil(null)}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {openUtil === "utilities" ? (
                <>
                  <div className="gradient-primary flex h-8 w-8 items-center justify-center rounded-xl text-primary-foreground shadow-sm">
                    <LayoutGrid className="h-4 w-4" />
                  </div>
                  Tiện ích
                </>
              ) : (
                <>
                  <div className="gradient-accent flex h-8 w-8 items-center justify-center rounded-xl text-accent-foreground shadow-sm">
                    <Gamepad2 className="h-4 w-4" />
                  </div>
                  Giải trí
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {openUtil === "utilities"
                ? "Các tiện ích dành cho mọi người dùng"
                : "Chơi và thư giãn"}
            </DialogDescription>
          </DialogHeader>

          {openUtil === "utilities" && (
            <div className="grid grid-cols-3 gap-2" onClick={() => setOpenUtil(null)}>
              <FeatureTile
                to="/news"
                label="Bảng tin"
                icon={Newspaper}
                size="compact"
                badge={toBadge(unread.news)}
              />
              <FeatureTile
                to="/transport"
                label="Tìm nhà xe"
                icon={BusFront}
                size="compact"
              />
              <FeatureTile
                to="/chat"
                label="Trò chuyện"
                icon={MessagesSquare}
                size="compact"
                badge={toBadge(unread.chat)}
              />
              <FeatureTile
                to="/guides"
                label="Hướng dẫn"
                icon={BookOpen}
                size="compact"
              />
            </div>
          )}

          {openUtil === "entertainment" && (
            <div className="grid grid-cols-3 gap-2" onClick={() => setOpenUtil(null)}>
              <FeatureTile
                to="/garden"
                label="Vườn cây"
                icon={Sprout}
                size="compact"
              />
              <FeatureTile
                to="/gems"
                label="Xếp kim cương"
                icon={Gem}
                size="compact"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
