import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";

export const Route = createFileRoute("/pending")({
  component: PendingPage,
});

function PendingPage() {
  const { logout, refresh, user } = useAuth();
  const nav = useNavigate();

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="rounded-full bg-warning/20 p-5 text-warning-foreground">
        <Clock className="h-10 w-10" />
      </div>
      <h1 className="text-xl font-semibold">Đang chờ duyệt</h1>
      <p className="max-w-xs text-sm text-muted-foreground">
        Tài khoản <strong>{user?.full_name || user?.phone}</strong> đã được gửi tới admin.
        Bạn sẽ vào được hệ thống ngay khi được duyệt.
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={async () => {
            try { await refresh(); } catch {}
            const { pb } = await import("@/lib/pocketbase");
            const { isProfileComplete } = await import("@/lib/profile");
            const u = pb.authStore.record as any;
            if (!u?.approved) return;
            if (u.role === "admin") {
              nav({ to: "/" });
            } else if (!isProfileComplete(u)) {
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
