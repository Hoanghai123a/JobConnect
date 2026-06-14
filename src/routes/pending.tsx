import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { isProfileComplete } from "@/lib/profile";
import { isUserApproved } from "@/lib/user-approval";
import { BackButton } from "@/components/layout/BackButton";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/pending")({
  component: PendingPage,
});

function PendingPage() {
  const { logout, refresh, user } = useAuth();
  const nav = useNavigate();

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-6 text-center">
      <BackButton className="absolute left-4 top-4 text-muted-foreground" />

      <div className="rounded-full bg-warning/20 p-5 text-warning-foreground">
        <Clock className="h-10 w-10" />
      </div>

      <h1 className="text-xl font-semibold">Đang chờ duyệt</h1>
      <p className="max-w-xs text-sm text-muted-foreground">
        Tài khoản <strong>{user?.full_name || user?.phone}</strong> đã được gửi tới admin. Bạn sẽ vào
        được hệ thống ngay khi được duyệt.
      </p>

      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={async () => {
            try {
              await refresh();
            } catch {}
            const { pb } = await import("@/lib/pocketbase");
            const refreshedUser = pb.authStore.record as any;
            if (!isUserApproved(refreshedUser)) return;

            if (refreshedUser.role === "admin") {
              nav({ to: "/" });
            } else if (refreshedUser.role === "staff") {
              nav({ to: "/staff" });
            } else if (!isProfileComplete(refreshedUser)) {
              nav({ to: "/account", search: { incomplete: 1 } as any });
            } else {
              nav({ to: "/attendance" });
            }
          }}
        >
          Kiểm tra lại
        </Button>

        <Button
          variant="ghost"
          onClick={() => {
            logout();
            nav({ to: "/login" });
          }}
        >
          Đăng xuất
        </Button>
      </div>
    </div>
  );
}