import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { pb, type UserRecord } from "@/lib/pocketbase";
import { useAuth } from "@/lib/auth";
import { useAppSettings } from "@/lib/app-settings";
import { isUserApproved } from "@/lib/user-approval";
import { getSeen } from "@/lib/seen";
import { getClientDeviceProfile } from "@/lib/device-profile";
import { hardReload } from "@/lib/hard-reload";
import { MobileSection } from "@/components/layout/MobileSection";
import { BottomNav } from "@/components/layout/BottomNav";
import { FeatureTile } from "@/components/dashboard/FeatureTile";
import { LoginRequiredDialog } from "@/components/auth/LoginRequiredDialog";
import { Button } from "@/components/ui/button";
import {
  Newspaper,
  BarChart3,
  BriefcaseBusiness,
  Clock,
  BookOpen,
  MessageSquareWarning,
  Settings,
  Building2,
  CalendarCheck,
  CalendarClock,
  BadgeDollarSign,
  MessagesSquare,
  BusFront,
  Bell,
  ShieldCheck,
  Sprout,
  History,
  User,
  ChevronRight,
  RefreshCw,
  NotebookPen,
  ClipboardCheck,
  LogIn,
  Wallet,
  Users,
  ListOrdered,
  Gem,
  Bomb,
  LayoutGrid,
  Gamepad2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type UtilKey = "utilities" | "entertainment" | null;

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    if (!pb.authStore.isValid) return;
    const u = pb.authStore.record as UserRecord | null;
    if (u && !isUserApproved(u)) throw redirect({ to: "/pending" });
  },
  component: DashboardPage,
});

const APPROVAL_STATUSES = ["pending", "approved", "completed", "rejected"] as const;

type ApprovalStatusKey = (typeof APPROVAL_STATUSES)[number];

type ApprovalRequestSummary = {
  status?: string;
  amount?: number | string;
};

function localDateKey(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addLocalDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function DashboardPage() {
  const { loading, user, isAdmin } = useAuth();
  const { data: settings, logoUrl } = useAppSettings();
  const [pendingComplaintCount, setPendingComplaintCount] = useState(0);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const [unread, setUnread] = useState({ news: 0, chat: 0, check: 0, advances: 0 });
  const [openUtil, setOpenUtil] = useState<UtilKey>(null);
  const [reloading, setReloading] = useState(false);
  const nav = useNavigate();
  const { hash, search } = useLocation();
  const guestSearch = (search || {}) as { login?: string; redirect?: string };
  const [guestLoginOpen, setGuestLoginOpen] = useState(guestSearch.login === "1");

  useEffect(() => {
    if (!user && guestSearch.login === "1") setGuestLoginOpen(true);
  }, [guestSearch.login, user]);

  const handleReload = async () => {
    if (reloading) return;
    setReloading(true);
    await hardReload();
  };

  useEffect(() => {
    if (loading) return;
    if (!user) return;
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
    if (!isAdmin || !user?.id) return;
    let alive = true;

    (async () => {
      try {
        const res = await pb.collection("approval_responses").getList(1, 1, {
          filter: `admin = "${user.id}" && status = "pending"`,
        });
        if (alive) setPendingApprovalCount(res.totalItems || 0);
      } catch {
        if (alive) setPendingApprovalCount(0);
      }
    })();

    return () => {
      alive = false;
    };
  }, [isAdmin, user?.id]);

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
          const roomIds = (memberships as unknown as Array<{ room: string }>).map((m) => m.room);
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

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-4 text-sm text-muted-foreground">
        Đang kiểm tra đăng nhập...
      </div>
    );
  }

  if (!user) {
    return (
      <GuestDashboard
        settings={settings}
        logoUrl={logoUrl}
        loginOpen={guestLoginOpen}
        onLoginOpenChange={setGuestLoginOpen}
        redirectTo={guestSearch.redirect || "/"}
      />
    );
  }

  if (!isUserApproved(user)) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-4 text-sm text-muted-foreground">
        Đang kiểm tra tài khoản...
      </div>
    );
  }

  const toBadge = (count: number) => (count > 0 ? (count > 9 ? "9+" : String(count)) : undefined);

  const summaryParts: string[] = [];
  if (unread.news > 0) summaryParts.push(`${unread.news} tin tuyển dụng mới`);
  if (unread.check > 0) summaryParts.push(`${unread.check} bảng công/lương mới`);
  if (unread.advances > 0) summaryParts.push(`${unread.advances} phản hồi ứng lương`);
  if (unread.chat > 0) summaryParts.push(`${unread.chat} tin nhắn chưa đọc`);
  const summaryText = summaryParts.join(" · ");

  return (
    <div className="pb-nav">
      <div className="px-4 pb-2 pt-3">
        <div className="gradient-hero relative overflow-hidden rounded-3xl px-4 py-4 text-white shadow-soft">
          <div className="absolute -right-12 -top-12 h-36 w-36 rounded-full bg-white/20 blur-2xl" />
          <div className="absolute -bottom-16 -left-8 h-40 w-40 rounded-full bg-white/10 blur-2xl" />

          <div className="relative flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/95 shadow-soft">
              {logoUrl ? (
                <img src={logoUrl} alt="logo" className="logo-fit" />
              ) : (
                <Building2 className="h-6 w-6 text-primary" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-semibold leading-6">
                {settings.company_name}
              </div>
              {settings.slogan && (
                <div className="truncate text-xs leading-5 text-white/80">{settings.slogan}</div>
              )}
            </div>
            <button
              type="button"
              onClick={handleReload}
              disabled={reloading}
              aria-label="Tải lại trang"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur transition active:scale-95 disabled:opacity-70"
            >
              <RefreshCw className={reloading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            </button>
          </div>

          <div className="relative mt-3 flex flex-wrap items-center gap-2">
            <span className="text-sm text-white/80">Xin chào,</span>
            <span className="text-base font-semibold leading-6">
              {user?.full_name || user?.username || "Bạn"}
            </span>
            <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold backdrop-blur">
              {isAdmin ? "Quản trị viên" : "Nhân viên"}
            </span>
          </div>

          {summaryText && (
            <div className="relative mt-3 flex items-start gap-2 rounded-2xl bg-white/15 px-3 py-2.5 text-sm leading-5 backdrop-blur">
              <Bell className="mt-0.5 h-4 w-4 shrink-0" />
              <div>{summaryText}</div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-5 px-4 pt-2">
        {isAdmin ? (
          <>
            <MobileSection title="Nhóm chính" description="Quản lý tài chính và nghiệp vụ">
              <div className="grid grid-cols-2 gap-3">
                <FeatureTile
                  to="/advances"
                  label="Ứng lương"
                  icon={Wallet}
                  variant="accent"
                  size="compact"
                  align="start"
                />
                <FeatureTile
                  to="/complaints"
                  label="Khiếu nại"
                  icon={MessageSquareWarning}
                  variant="accent"
                  badge={toBadge(pendingComplaintCount)}
                  size="compact"
                  align="start"
                />
              </div>
            </MobileSection>

            <MobileSection title="Quản trị" description="Kiểm tra dữ liệu và cấu hình hệ thống">
              <div className="grid grid-cols-2 gap-3">
                <FeatureTile
                  to="/check-attendance"
                  label="Check công/lương"
                  icon={CalendarCheck}
                  variant="accent"
                  size="compact"
                  align="start"
                />
                <FeatureTile
                  to="/attendance"
                  label="Tự chấm công"
                  icon={Clock}
                  size="compact"
                  align="start"
                />
                <FeatureTile
                  to="/admin/settings"
                  label="Cài đặt"
                  icon={Settings}
                  size="compact"
                  align="start"
                />
              </div>
            </MobileSection>

            <MobileSection title="Khác" description="Tiện ích, giải trí và thông tin tài khoản">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOpenUtil("utilities")}
                  className="group relative flex min-h-[94px] flex-col items-start gap-2 rounded-2xl border border-border/70 bg-card p-3 text-left shadow-soft transition-colors active:scale-[0.98]"
                >
                  <div className="gradient-primary flex h-10 w-10 items-center justify-center rounded-xl text-primary-foreground">
                    <LayoutGrid className="h-[18px] w-[18px]" />
                  </div>
                  <span className="w-full text-xs font-semibold">Tiện ích</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOpenUtil("entertainment")}
                  className="group relative flex min-h-[94px] flex-col items-start gap-2 rounded-2xl border border-border/70 bg-card p-3 text-left shadow-soft transition-colors active:scale-[0.98]"
                >
                  <div className="gradient-accent flex h-10 w-10 items-center justify-center rounded-xl text-accent-foreground">
                    <Gamepad2 className="h-[18px] w-[18px]" />
                  </div>
                  <span className="w-full text-xs font-semibold">Giải trí</span>
                </button>
                <FeatureTile
                  to="/account"
                  label="Tài khoản"
                  icon={User}
                  size="compact"
                  align="start"
                />
              </div>
            </MobileSection>
          </>
        ) : (
          <>
            <section aria-label="Chấm công hôm nay">
              <FeatureTile
                to="/attendance"
                label="Tự chấm công"
                description="Ghi nhận giờ làm hôm nay"
                icon={Clock}
                variant="accent"
              />
            </section>

            <section aria-label="Tiện ích và giải trí">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setOpenUtil("utilities")}
                  className="group relative overflow-hidden rounded-3xl border border-border/70 bg-card p-4 text-left shadow-soft transition active:scale-[0.98]"
                >
                  <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />
                  <div className="relative flex items-start justify-between gap-2">
                    <div className="gradient-primary flex h-11 w-11 items-center justify-center rounded-2xl text-primary-foreground shadow-sm">
                      <LayoutGrid className="h-5 w-5" />
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="relative mt-3 text-sm font-semibold">Tiện ích</div>
                  <div className="relative mt-1 text-xs leading-5 text-muted-foreground">
                    Bảng tin, sổ tay và công cụ
                  </div>
                  {(unread.news > 0 || unread.chat > 0) && (
                    <span className="absolute right-3 top-3 inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold text-white shadow-sm">
                      {toBadge(unread.news + unread.chat)}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setOpenUtil("entertainment")}
                  className="group relative overflow-hidden rounded-3xl border border-border/70 bg-card p-4 text-left shadow-soft transition active:scale-[0.98]"
                >
                  <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-accent/40 blur-2xl" />
                  <div className="relative flex items-start justify-between gap-2">
                    <div className="gradient-accent flex h-11 w-11 items-center justify-center rounded-2xl text-accent-foreground shadow-sm">
                      <Gamepad2 className="h-5 w-5" />
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="relative mt-3 text-sm font-semibold">Giải trí</div>
                  <div className="relative mt-1 text-xs leading-5 text-muted-foreground">
                    Ba trò chơi thư giãn
                  </div>
                </button>
              </div>
            </section>

            <MobileSection
              title="Chức năng chính"
              description="Các tính năng dành cho người lao động"
            >
              <div className="grid grid-cols-2 gap-3">
                <FeatureTile
                  to="/advances"
                  label="Ứng lương"
                  description="Gửi và theo dõi yêu cầu"
                  icon={Wallet}
                  variant="accent"
                  badge={toBadge(unread.advances)}
                />
                <FeatureTile
                  to="/complaints"
                  label="Khiếu nại"
                  description="Gửi phản ánh"
                  icon={MessageSquareWarning}
                  variant="accent"
                />
                <FeatureTile
                  to="/check-attendance"
                  label="Check công/lương"
                  description="Kiểm tra bảng công"
                  icon={CalendarCheck}
                  variant="accent"
                  badge={toBadge(unread.check)}
                />
              </div>
            </MobileSection>
          </>
        )}
      </div>

      <BottomNav />

      <Dialog open={openUtil !== null} onOpenChange={(open) => !open && setOpenUtil(null)}>
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
              {openUtil === "utilities" ? "Chọn tiện ích cần sử dụng" : "Chơi và thư giãn"}
            </DialogDescription>
          </DialogHeader>

          {openUtil === "utilities" && (
            <div className="grid grid-cols-3 gap-2" onClick={() => setOpenUtil(null)}>
              {isAdmin ? (
                <>
                  <FeatureTile
                    to="/news"
                    label="Bảng tin"
                    icon={Newspaper}
                    size="compact"
                    badge={toBadge(unread.news)}
                  />
                  <FeatureTile to="/notebook" label="Sổ tay" icon={NotebookPen} size="compact" />
                  <FeatureTile
                    to="/admin/accounts/stats"
                    label="Thống kê"
                    icon={Users}
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
                    to="/transport"
                    label="Tìm nhà xe"
                    icon={BusFront}
                    size="compact"
                    allowGuest
                  />
                  <FeatureTile to="/guides" label="Hướng dẫn" icon={BookOpen} size="compact" />
                  <FeatureTile
                    to="/staff/money-to-text"
                    label="Đọc số tiền"
                    icon={BadgeDollarSign}
                    size="compact"
                  />
                  <FeatureTile
                    to="/last-working-day"
                    label="Ngày Công Cuối"
                    icon={CalendarClock}
                    size="compact"
                  />
                </>
              ) : (
                <>
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
                    allowGuest
                  />
                  <FeatureTile
                    to="/chat"
                    label="Trò chuyện"
                    icon={MessagesSquare}
                    size="compact"
                    badge={toBadge(unread.chat)}
                  />
                  <FeatureTile to="/guides" label="Hướng dẫn" icon={BookOpen} size="compact" />
                  <FeatureTile to="/notebook" label="Sổ tay" icon={NotebookPen} size="compact" />
                  <FeatureTile
                    to="/counter"
                    label="Bộ đếm"
                    icon={ListOrdered}
                    size="compact"
                    allowGuest
                  />
                </>
              )}
            </div>
          )}

          {openUtil === "entertainment" && (
            <div className="grid grid-cols-3 gap-2" onClick={() => setOpenUtil(null)}>
              <FeatureTile to="/garden" label="Vườn cây" icon={Sprout} size="compact" />
              <FeatureTile to="/gems" label="Xếp kim cương" icon={Gem} size="compact" />
              <FeatureTile to="/minesweeper" label="Dò mìn" icon={Bomb} size="compact" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GuestDashboard({
  settings,
  logoUrl,
  loginOpen,
  onLoginOpenChange,
  redirectTo,
}: {
  settings: { company_name: string; slogan?: string };
  logoUrl: string;
  loginOpen: boolean;
  onLoginOpenChange: (open: boolean) => void;
  redirectTo: string;
}) {
  const { isGuest, loginAsGuest } = useAuth();

  return (
    <div className="pb-nav">
      {!isGuest ? (
        <section className="gradient-hero relative overflow-hidden px-5 py-8 text-white">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/20 blur-3xl" />
          <div className="absolute -bottom-16 -left-8 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
          <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-3xl bg-white/95 shadow-soft">
              {logoUrl ? (
                <img src={logoUrl} alt={`Logo ${settings.company_name}`} className="logo-fit" />
              ) : (
                <Building2 className="h-8 w-8 text-primary" />
              )}
            </div>
            <p className="mt-4 text-sm font-medium text-white/80">Chào mừng bạn đến</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Chấm công</h1>
            <p className="mt-2 text-sm text-white/80">Kết nối nhà tuyển dụng & người lao động</p>
            <p className="mt-5 max-w-xl text-sm leading-6 text-white/90">
              Chọn cách bạn muốn sử dụng ứng dụng. Bạn có thể đăng nhập để đồng bộ dữ liệu hoặc dùng
              ngay một số tiện ích mà không cần tài khoản.
            </p>
            <div className="mt-5 grid w-full max-w-sm gap-2.5 sm:grid-cols-2">
              <Button
                type="button"
                variant="secondary"
                className="w-full bg-white text-primary hover:bg-white/90"
                onClick={() => onLoginOpenChange(true)}
              >
                <LogIn aria-hidden="true" />
                Đăng nhập
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full border-white/60 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                onClick={loginAsGuest}
              >
                <User aria-hidden="true" />
                Dùng không cần đăng nhập
              </Button>
            </div>
          </div>
        </section>
      ) : (
        <section className="gradient-hero relative overflow-hidden px-4 py-3 text-white">
          <div className="relative flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/95 shadow-soft">
                {logoUrl ? (
                  <img src={logoUrl} alt="logo" className="logo-fit" />
                ) : (
                  <Building2 className="h-5 w-5 text-primary" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  Đang dùng không cần đăng nhập
                </p>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="shrink-0 bg-white text-primary hover:bg-white/90"
              onClick={() => onLoginOpenChange(true)}
            >
              <LogIn className="h-4 w-4" />
              Đăng nhập
            </Button>
          </div>
        </section>
      )}

      <main className="space-y-6 px-4 py-5">
        <GuestSection
          title="Dành cho người lao động"
          description="Theo dõi công việc và các quyền lợi của bạn"
        >
          <FeatureTile
            to="/attendance"
            label="Tự chấm công"
            description="Ghi nhận giờ làm, có thể dùng không đăng nhập"
            icon={Clock}
            variant="accent"
            allowGuest
          />
          <FeatureTile
            to="/check-attendance"
            label="Check công/lương"
            description="Kiểm tra bảng công"
            icon={CalendarCheck}
            variant="accent"
            allowGuest
          />
          <FeatureTile
            to="/advances"
            label="Ứng lương"
            description="Gửi và theo dõi yêu cầu"
            icon={Wallet}
            variant="accent"
            allowGuest
          />
          <FeatureTile
            to="/complaints"
            label="Khiếu nại"
            description="Gửi phản ánh"
            icon={MessageSquareWarning}
            variant="accent"
            allowGuest
          />
        </GuestSection>

        <GuestSection title="Tiện ích" description="Thông tin, kết nối và công cụ hỗ trợ" compact>
          <FeatureTile to="/news" label="Bảng tin" icon={Newspaper} size="compact" allowGuest />
          <FeatureTile
            to="/transport"
            label="Tìm nhà xe"
            icon={BusFront}
            size="compact"
            allowGuest
          />
          <FeatureTile
            to="/chat"
            label="Trò chuyện"
            icon={MessagesSquare}
            size="compact"
            allowGuest
          />
          <FeatureTile to="/guides" label="Hướng dẫn" icon={BookOpen} size="compact" allowGuest />
          <FeatureTile to="/notebook" label="Sổ tay" icon={NotebookPen} size="compact" allowGuest />
          <FeatureTile to="/counter" label="Bộ đếm" icon={ListOrdered} size="compact" allowGuest />
        </GuestSection>

        <GuestSection title="Giải trí" description="Thư giãn sau giờ làm" compact>
          <FeatureTile to="/garden" label="Vườn cây" icon={Sprout} size="compact" allowGuest />
          <FeatureTile to="/gems" label="Xếp kim cương" icon={Gem} size="compact" allowGuest />
          <FeatureTile to="/minesweeper" label="Dò mìn" icon={Bomb} size="compact" allowGuest />
        </GuestSection>
      </main>

      <BottomNav />
      <LoginRequiredDialog
        open={loginOpen}
        onOpenChange={onLoginOpenChange}
        redirectTo={redirectTo}
      />
    </div>
  );
}

function GuestSection({
  title,
  description,
  compact = false,
  children,
}: {
  title: string;
  description: string;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="text-base font-bold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className={compact ? "grid grid-cols-3 gap-3" : "grid grid-cols-2 gap-3"}>
        {children}
      </div>
    </section>
  );
}
