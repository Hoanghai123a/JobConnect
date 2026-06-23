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
  User,
  Settings,
  Building2,
  CalendarCheck,
  Wallet,
  MessagesSquare,
  BusFront,
  Bell,
} from "lucide-react";

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

function DashboardPage() {
  const { loading, user, isAdmin } = useAuth();
  const { data: settings, logoUrl } = useAppSettings();
  const [pendingComplaintCount, setPendingComplaintCount] = useState(0);
  const [unread, setUnread] = useState({ news: 0, chat: 0, check: 0, advances: 0 });
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
      const [news, chat, check, salary, advances] = await Promise.all([
        countNewer("recruitments", "created", "news", "is_active = true").catch(() => 0),
        countNewer("group_chat_messages", "created", "chat").catch(() => 0),
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
      <div className="gradient-hero relative overflow-hidden px-5 pb-10 pt-6 text-white">
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

      <div className="-mt-6 space-y-4 px-4">
        <section className="rounded-3xl bg-card p-3 shadow-soft">
          <div className="flex items-center justify-between px-1 pb-2 pt-1">
            <div>
              <div className="text-sm font-semibold tracking-tight">Tiện ích chung</div>
              <div className="text-[11px] text-muted-foreground">Dành cho mọi người dùng</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <FeatureTile
              to="/news"
              label="Bảng tin"
              description="Tin tuyển dụng mới"
              icon={Newspaper}
              badge={toBadge(unread.news)}
            />
            <FeatureTile
              to="/guides"
              label="Hướng dẫn"
              description="Tài liệu, biểu mẫu"
              icon={BookOpen}
            />
            <FeatureTile
              to="/transport"
              label="Tìm nhà xe"
              description="Thông tin cộng đồng"
              icon={BusFront}
            />
            <FeatureTile
              to="/chat"
              label="Trò chuyện"
              description="Nhắn tin nhóm"
              icon={MessagesSquare}
              badge={toBadge(unread.chat)}
            />
            <FeatureTile
              to="/account"
              label="Tài khoản"
              description="Thông tin cá nhân"
              icon={User}
            />
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
              label="Chấm công"
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
    </div>
  );
}
