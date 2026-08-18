import { createFileRoute, Outlet, redirect, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { pb } from "@/lib/pocketbase";
import { useAuth } from "@/lib/auth";
import { isUserApproved } from "@/lib/user-approval";
import { BottomNav } from "@/components/layout/BottomNav";
import { StaffRealtimeSyncGate } from "@/components/staff/StaffRealtimeSyncGate";
import { DesktopAppShell } from "@/components/layout/DesktopAppShell";
import { DataLoadingState } from "@/components/ui/data-loading-state";
import { StaffExcelExportProvider } from "@/components/staff/StaffExcelExportProvider";

const GUEST_ACCESSIBLE_PATHS = new Set(["/news", "/transport", "/counter"]);

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

  useEffect(() => {
    if (!loading && !user) {
      nav({ to: "/", search: { login: "1", redirect: window.location.pathname } as any });
    }
  }, [loading, nav, user]);

  if (loading || !user) {
    return <DataLoadingState variant="page" label="Đang xác thực tài khoản..." rows={4} />;
  }

  return (
    <StaffExcelExportProvider>
      <div className="pb-nav">
        <StaffRealtimeSyncGate />
        <DesktopAppShell>
          <Outlet />
        </DesktopAppShell>
        <BottomNav />
      </div>
    </StaffExcelExportProvider>
  );
}
