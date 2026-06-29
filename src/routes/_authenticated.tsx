import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { pb } from "@/lib/pocketbase";
import { useAuth } from "@/lib/auth";
import { isUserApproved } from "@/lib/user-approval";
import { BottomNav } from "@/components/layout/BottomNav";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ location }) => {
    // Auth lives in localStorage — only enforce on the client to avoid SSR redirect loops.
    if (typeof window === "undefined") return;
    if (!pb.authStore.isValid) {
      throw redirect({ to: "/login", search: { redirect: location.href } as any });
    }
    const u = pb.authStore.record as any;
    if (u && !isUserApproved(u)) {
      throw redirect({ to: "/pending" });
    }
    if (u?.must_change_password && !location.pathname.includes("force-change-password")) {
      throw redirect({ to: "/force-change-password" });
    }
  },
  component: AuthLayout,
});

function AuthLayout() {
  const { loading, user } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      nav({ to: "/login" });
    }
  }, [loading, nav, user]);

  if (loading || !user) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-4 text-sm text-muted-foreground">
        Đang tải...
      </div>
    );
  }

  return (
    <div className="pb-nav">
      {loading ? (
        <div className="flex min-h-[100dvh] items-center justify-center px-4 text-sm text-muted-foreground">
          Đang tải...
        </div>
      ) : (
        <Outlet />
      )}
      <BottomNav />
    </div>
  );
}
