import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { pb, type UserRecord } from "@/lib/pocketbase";
import { useAuth } from "@/lib/auth";
import { useAppSettings } from "@/lib/app-settings";
import { isUserApproved } from "@/lib/user-approval";
import { getSeen } from "@/lib/seen";
import { hardReload } from "@/lib/hard-reload";
import { cn } from "@/lib/utils";
import { estimateDailySalary } from "@/lib/attendance-incentive";
import { readLastHours, readLocalAttendance } from "@/lib/local-attendance";
import { formatVND, type Shift } from "@/lib/salary";
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
  CircleAlert,
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
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: DashboardPage,
});

const APPROVAL_STATUSES = ["pending", "approved", "completed", "rejected"] as const;

type ApprovalStatusKey = (typeof APPROVAL_STATUSES)[number];

type ApprovalRequestSummary = {
  status?: string;
  amount?: number | string;
};

function addLocalDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function getLocalDateKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

export function DashboardPage() {
  const { loading, user, isAdmin, isGuest, loginAsGuest } = useAuth();
  const { data: settings, logoUrl } = useAppSettings();
  const [pendingComplaintCount, setPendingComplaintCount] = useState(0);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const [unread, setUnread] = useState({ news: 0, chat: 0, check: 0, advances: 0 });
  const [hasAttendanceToday, setHasAttendanceToday] = useState<boolean | null>(null);
  const [dailyIncentive, setDailyIncentive] = useState<number | null>(null);
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

  // approval_responses collection đã bị loại bỏ - không còn sử dụng
  useEffect(() => {
    if (!isAdmin || !user?.id) return;
    setPendingApprovalCount(0);
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

  useEffect(() => {
    if (isAdmin) {
      setHasAttendanceToday(null);
      return;
    }

    const today = getLocalDateKey();

    // Nếu có user đăng nhập, check từ server
    if (user?.id) {
      let alive = true;
      pb.collection("attendance")
        .getList(1, 1, {
          filter: `user="${user.id}" && date>="${today}" && date<"${today} 23:59:59"`,
        })
        .then((result) => {
          if (alive) setHasAttendanceToday(result.totalItems > 0);
        })
        .catch(() => {
          if (alive) setHasAttendanceToday(null);
        });

      return () => {
        alive = false;
      };
    } else {
      // Guest mode: check từ local storage
      const localState = readLocalAttendance();
      const hasToday = localState.rows.some((row) => row.date === today);
      setHasAttendanceToday(hasToday);
    }
  }, [isAdmin, user?.id]);

  useEffect(() => {
    if (isAdmin) {
      setDailyIncentive(null);
      return;
    }

    let alive = true;

    const calculateDailyIncentive = () => {
      try {
        const today = new Date();
        const todayStr = today.toISOString().split("T")[0];

        let profileData = null;
        let hcHours = 8;
        let otHours = 0;
        let shift: Shift = "day";

        // Nếu có user đăng nhập, lấy từ profile user
        if (user) {
          if (!user.lcb || user.lcb <= 0) {
            setDailyIncentive(null);
            return;
          }
          profileData = {
            lcb: user.lcb || 0,
            chuyen_can: user.chuyen_can || 0,
            doi_song: user.doi_song || 0,
            tham_nien: user.tham_nien || 0,
          };
        } else {
          // Guest mode: lấy từ local storage
          const localState = readLocalAttendance();
          if (!localState.profile || !localState.profile.lcb || localState.profile.lcb <= 0) {
            setDailyIncentive(null);
            return;
          }
          profileData = {
            lcb: localState.profile.lcb,
            chuyen_can: localState.profile.chuyen_can,
            doi_song: localState.profile.doi_song,
            tham_nien: localState.profile.tham_nien,
          };
        }

        // Lấy giờ HC/OT từ local storage
        const lastHours = readLastHours();
        hcHours = lastHours.hc_hours;
        otHours = lastHours.ot_hours;

        // Lấy ca từ bản ghi local gần nhất
        const localState = readLocalAttendance();
        if (localState.rows.length > 0) {
          const latestRow = localState.rows[localState.rows.length - 1];
          shift = latestRow.shift;
        }

        console.log("[DailyIncentive] Profile:", profileData);
        console.log("[DailyIncentive] Hours:", { hcHours, otHours, shift });

        const estimate = estimateDailySalary(
          todayStr,
          profileData,
          shift,
          false,
          hcHours,
          otHours,
        );

        console.log("[DailyIncentive] Calculated:", estimate.work, "đ");

        if (alive) setDailyIncentive(estimate.work);
      } catch (error) {
        console.error("[DailyIncentive] Error:", error);
        if (alive) setDailyIncentive(null);
      }
    };

    // Tính toán ban đầu
    calculateDailyIncentive();

    // Nếu user đăng nhập, fetch từ server để update
    if (user) {
      const fetchFromServer = async () => {
        try {
          console.log("[DailyIncentive] Fetching from server for user:", user.id);

          const today = new Date();
          const recentAttendance = await pb.collection("attendance").getList(1, 10, {
            filter: `user="${user.id}"`,
            sort: "-date",
          });

          // Filter trong JS để loại bỏ các bản ghi trong tương lai
          const validItems = recentAttendance.items.filter((item) => {
            const recordDate = new Date(item.date);
            return recordDate <= today;
          });

          if (!alive) return;

          if (validItems.length > 0) {
            const latest = validItems[0];
            const hcHours = Number(latest.hc_hours) || 8;
            const otHours = Number(latest.ot_hours) || 0;
            const shift: Shift = latest.shift === "night" ? "night" : "day";

            console.log("[DailyIncentive] Latest server record:", {
              date: latest.date,
              hcHours,
              otHours,
              shift,
            });

            const todayStr = today.toISOString().split("T")[0];
            const estimate = estimateDailySalary(
              todayStr,
              {
                lcb: user.lcb || 0,
                chuyen_can: user.chuyen_can || 0,
                doi_song: user.doi_song || 0,
                tham_nien: user.tham_nien || 0,
              },
              shift,
              false,
              hcHours,
              otHours,
            );

            if (alive) setDailyIncentive(estimate.work);
          }
        } catch (error) {
          console.error("[DailyIncentive] Server fetch error:", error);
        }
      };

      fetchFromServer();

      // Subscribe realtime cho attendance collection
      pb.collection("attendance")
        .subscribe("*", (e) => {
          console.log("[DailyIncentive] Realtime event:", e.action, e.record);
          const recordUserId = e.record?.user;
          if (recordUserId === user.id) {
            console.log("[DailyIncentive] Event matched user, refetching...");
            fetchFromServer();
          }
        })
        .catch((err) => {
          console.error("[DailyIncentive] Subscribe failed:", err);
        });
    }

    return () => {
      alive = false;
      if (user) {
        pb.collection("attendance").unsubscribe("*").catch(() => {});
      }
    };
  }, [user, isAdmin]);

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-4 text-sm text-muted-foreground">
        Đang kiểm tra đăng nhập...
      </div>
    );
  }

  if (!isUserApproved(user) && user) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-4 text-sm text-muted-foreground">
        Đang kiểm tra tài khoản...
      </div>
    );
  }

  const toBadge = (count: number) => (count > 0 ? (count > 9 ? "9+" : String(count)) : undefined);

  const summaryParts: string[] = [];
  if (user && unread.news > 0) summaryParts.push(`${unread.news} tin tuyển dụng mới`);
  if (user && unread.check > 0) summaryParts.push(`${unread.check} bảng công/lương mới`);
  if (user && unread.advances > 0) summaryParts.push(`${unread.advances} phản hồi ứng lương`);
  if (user && unread.chat > 0) summaryParts.push(`${unread.chat} tin nhắn chưa đọc`);
  const summaryText = summaryParts.join(" · ");

  return (
    <div className="pb-nav">
      {!user ? (
        !isGuest ? (
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
                Chọn cách bạn muốn sử dụng ứng dụng. Bạn có thể đăng nhập để đồng bộ dữ liệu hoặc
                dùng ngay một số tiện ích mà không cần tài khoản.
              </p>
              <div className="mt-5 grid w-full max-w-sm gap-2.5 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full bg-white text-primary hover:bg-white/90"
                  onClick={() => setGuestLoginOpen(true)}
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
          <>
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
                    <p className="truncate text-sm font-semibold">Đang dùng không cần đăng nhập</p>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="shrink-0 bg-white text-primary hover:bg-white/90"
                  onClick={() => setGuestLoginOpen(true)}
                >
                  <LogIn className="h-4 w-4" />
                  Đăng nhập
                </Button>
              </div>
            </section>
            <div className="px-4 pb-2 pt-3">
              {hasAttendanceToday === false && (
                <button
                  type="button"
                  onClick={() => nav({ to: "/attendance" })}
                  className="mb-2 flex w-full items-center gap-2 rounded-xl border border-[color:var(--status-warning)]/30 bg-[color:var(--status-warning)]/10 px-3 py-2 text-left text-sm text-foreground transition active:scale-[0.99]"
                >
                  <CircleAlert
                    className="h-4 w-4 shrink-0 text-[color:var(--status-warning-fg)]"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    Hôm nay bạn chưa chấm công.{" "}
                    {dailyIncentive !== null ? (
                      <>Chấm công nhận <strong>{formatVND(dailyIncentive)}</strong> vào lương</>
                    ) : (
                      <>Chạm để nhập chấm công.</>
                    )}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              )}
            </div>
          </>
        )
      ) : (
        <div className="px-4 pb-2 pt-3">
          {hasAttendanceToday === false && (
            <button
              type="button"
              onClick={() => nav({ to: "/attendance" })}
              className="mb-2 flex w-full items-center gap-2 rounded-xl border border-[color:var(--status-warning)]/30 bg-[color:var(--status-warning)]/10 px-3 py-2 text-left text-sm text-foreground transition active:scale-[0.99]"
            >
              <CircleAlert
                className="h-4 w-4 shrink-0 text-[color:var(--status-warning-fg)]"
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                Hôm nay bạn chưa chấm công.{" "}
                {dailyIncentive !== null ? (
                  <>Chấm công nhận <strong>{formatVND(dailyIncentive)}</strong> vào lương</>
                ) : (
                  <>Chạm để nhập chấm công.</>
                )}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          )}
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
            badge={user && toBadge(unread.check)}
            allowGuest
          />
          <FeatureTile
            to="/advances"
            label="Ứng lương"
            description="Gửi và theo dõi yêu cầu"
            icon={Wallet}
            variant="accent"
            badge={user && toBadge(unread.advances)}
            allowGuest
          />
          <FeatureTile
            to="/complaints"
            label="Khiếu nại"
            description="Gửi phản ánh"
            icon={MessageSquareWarning}
            variant="accent"
            badge={user && isAdmin && toBadge(pendingComplaintCount)}
            allowGuest
          />
        </GuestSection>

        <GuestSection title="Giải trí" description="Thư giãn sau giờ làm" compact>
          <FeatureTile to="/garden" label="Nông trại" icon={Sprout} size="compact" allowGuest />
          <FeatureTile to="/gems" label="Xếp kim cương" icon={Gem} size="compact" allowGuest />
          <FeatureTile to="/minesweeper" label="Dò mìn" icon={Bomb} size="compact" allowGuest />
        </GuestSection>

        <GuestSection title="Tiện ích" description="Thông tin, kết nối và công cụ hỗ trợ" compact>
          {user?.role === "admin" ? (
            <>
              <FeatureTile
                to="/news"
                label="Bảng tin"
                icon={Newspaper}
                size="compact"
                badge={toBadge(unread.news)}
                allowGuest
              />
              <FeatureTile
                to="/notebook"
                label="Sổ tay"
                icon={NotebookPen}
                size="compact"
                allowGuest
              />
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
                allowGuest
              />
              <FeatureTile
                to="/transport"
                label="Tìm nhà xe"
                icon={BusFront}
                size="compact"
                allowGuest
              />
              <FeatureTile
                to="/guides"
                label="Hướng dẫn"
                icon={BookOpen}
                size="compact"
                allowGuest
              />
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
                badge={user && toBadge(unread.news)}
                allowGuest
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
                badge={user && toBadge(unread.chat)}
                allowGuest
              />
              <FeatureTile
                to="/guides"
                label="Hướng dẫn"
                icon={BookOpen}
                size="compact"
                allowGuest
              />
              <FeatureTile
                to="/notebook"
                label="Sổ tay"
                icon={NotebookPen}
                size="compact"
                allowGuest
              />
              <FeatureTile
                to="/counter"
                label="Bộ đếm"
                icon={ListOrdered}
                size="compact"
                allowGuest
              />
            </>
          )}
        </GuestSection>
      </main>

      <BottomNav />
      <LoginRequiredDialog
        open={guestLoginOpen}
        onOpenChange={setGuestLoginOpen}
        redirectTo={guestSearch.redirect || "/"}
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
