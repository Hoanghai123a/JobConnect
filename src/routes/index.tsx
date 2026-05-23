import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { pb } from "@/lib/pocketbase";
import { useAuth } from "@/lib/auth";
import { useAppSettings } from "@/lib/app-settings";
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
} from "lucide-react";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    if (!pb.authStore.isValid) throw redirect({ to: "/login", search: { redirect: "/" } as any });
    const u = pb.authStore.record as any;
    if (u && u.approved === false) throw redirect({ to: "/pending" });
  },
  component: DashboardPage,
});

function DashboardPage() {
  const { user, isAdmin } = useAuth();
  const { data: settings, logoUrl } = useAppSettings();
  const [pendingComplaintCount, setPendingComplaintCount] = useState(0);

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

        <div className="relative mt-6">
          <div className="text-xs text-white/80">Xin chào,</div>
          <div className="mt-0.5 text-xl font-semibold leading-tight">
            {user?.full_name || user?.username || "Bạn"} 👋
          </div>
          <div className="mt-1 inline-flex items-center rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider backdrop-blur">
            {isAdmin ? "Quản trị viên" : "Nhân viên"}
          </div>
        </div>
      </div>

      <div className="-mt-6 px-4">
        <div className="rounded-3xl bg-card p-3 shadow-soft">
          <div className="grid grid-cols-2 gap-3">
            <FeatureTile
              to="/news"
              label="Bảng tin"
              description="Tin tuyển dụng mới"
              icon={Newspaper}
            />
            <FeatureTile
              to="/attendance"
              label="Chấm công"
              description="Ghi nhận giờ làm"
              icon={Clock}
            />
            <FeatureTile
              to="/check-attendance"
              label="Check công/lương"
              description="Kiểm tra bảng công"
              icon={CalendarCheck}
            />
            <FeatureTile
              to="/guides"
              label="Hướng dẫn"
              description="Tài liệu, biểu mẫu"
              icon={BookOpen}
              variant="accent"
            />
            <FeatureTile
              to="/complaints"
              label="Khiếu nại"
              description="Gửi phản ánh"
              icon={MessageSquareWarning}
              variant="accent"
              badge={
                isAdmin && pendingComplaintCount > 0
                  ? pendingComplaintCount > 9
                    ? "9+"
                    : String(pendingComplaintCount)
                  : undefined
              }
            />
            <FeatureTile
              to="/advances"
              label="Ứng lương"
              description="Xin ứng lương"
              icon={Wallet}
            />
            <FeatureTile
              to="/chat"
              label="Trò chuyện"
              description="Nhắn tin nhóm"
              icon={MessagesSquare}
              variant="accent"
            />
            <FeatureTile
              to="/transport"
              label="Tìm nhà xe"
              description="Thông tin cộng đồng"
              icon={BusFront}
            />
            <FeatureTile
              to="/account"
              label="Tài khoản"
              description="Thông tin cá nhân"
              icon={User}
            />
            {isAdmin && (
              <FeatureTile
                to="/admin/settings"
                label="Cài đặt"
                description="Quản trị hệ thống"
                icon={Settings}
                variant="accent"
              />
            )}
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
