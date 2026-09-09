import {
  createFileRoute,
  Outlet,
  redirect,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { pb } from "@/lib/pocketbase";
import { useAuth } from "@/lib/auth";
import { isUserApproved } from "@/lib/user-approval";
import { BottomNav } from "@/components/layout/BottomNav";
import { DesktopAppShell } from "@/components/layout/DesktopAppShell";
import { DataLoadingState } from "@/components/ui/data-loading-state";

const GUEST_ACCESSIBLE_PATHS = new Set(["/news", "/transport", "/counter", "/attendance"]);

function canGuestAccess(pathname: string) {
  return GUEST_ACCESSIBLE_PATHS.has(pathname);
}

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ location }) => {
    // Auth lives in localStorage — only enforce on the client to avoid SSR redirect loops.
    if (typeof window === "undefined") return;
    if (!pb.authStore.isValid) {
      if (canGuestAccess(location.pathname)) return;
      throw redirect({ to: "/", search: { login: "1", redirect: location.href } as any });
    }
    const u = pb.authStore.record as any;
    if (u?.status === "disabled") {
      pb.authStore.clear();
      throw redirect({ to: "/login" });
    }
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

  const guestAttendance =
    !user &&
    !loading &&
    typeof window !== "undefined" &&
    window.location.pathname === "/attendance";

  useEffect(() => {
    if (!loading && !user && !guestAttendance) {
      nav({ to: "/", search: { login: "1", redirect: window.location.pathname } as any });
    }
  }, [guestAttendance, loading, nav, user]);

  if (loading) {
    return <DataLoadingState variant="page" label="Đang xác thực tài khoản..." rows={4} />;
  }

  if (!user && guestAttendance) {
    return (
      <div className="pb-nav">
        <Outlet />
        <BottomNav />
      </div>
    );
  }

  if (!user) return <DataLoadingState variant="page" label="Đang mở ứng dụng..." rows={4} />;

  return (
    <div className="pb-nav">
      <DesktopAppShell>
        <Outlet />
      </DesktopAppShell>
      <BottomNav />
    </div>
  );
}
