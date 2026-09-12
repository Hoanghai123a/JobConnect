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
import { DataLoadingState } from "@/components/ui/data-loading-state";
import { startGuestLogSync, stopGuestLogSync } from "@/lib/guest-logger";

function isGuestMode() {
  return (
    typeof window !== "undefined" && window.localStorage.getItem("jobconnect:guest-mode") === "true"
  );
}

const GUEST_ACCESS_PATHS = new Set([
  "/attendance",
  "/check-attendance",
  "/advances",
  "/complaints",
  "/news",
  "/transport",
  "/chat",
  "/guides",
  "/notebook",
  "/counter",
  "/exchange",
  "/garden",
  "/gems",
  "/minesweeper",
]);

function canGuestAccess(pathname: string) {
  if (!isGuestMode()) return false;
  return [...GUEST_ACCESS_PATHS].some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ location }) => {
    // Auth lives in localStorage — only enforce on the client to avoid SSR redirect loops.
    if (typeof window === "undefined") return;
    if (!pb.authStore.isValid) {
      if (canGuestAccess(location.pathname)) return;
      throw redirect({ to: "/home", search: { login: "1", redirect: location.href } as any });
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
  const { loading, user, isGuest } = useAuth();
  const nav = useNavigate();

  // Khởi động guest log sync khi ở guest mode
  useEffect(() => {
    if (isGuest) {
      startGuestLogSync();
      return () => stopGuestLogSync();
    }
  }, [isGuest]);

  useEffect(() => {
    if (!loading && !user && !isGuest) {
      nav({ to: "/home", search: { login: "1", redirect: window.location.pathname } as any });
    }
  }, [isGuest, loading, nav, user]);

  if (loading) {
    return <DataLoadingState variant="page" label="Đang xác thực tài khoản..." rows={4} />;
  }

  if (!user && isGuest) {
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
      <Outlet />
      <BottomNav />
    </div>
  );
}
