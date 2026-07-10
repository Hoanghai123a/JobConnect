import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  BriefcaseBusiness,
  ChevronLeft,
  Download,
  Home,
  Info,
  Settings,
  Upload,
  User,
  Users,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { InstallFloatingBanner } from "./InstallFloatingBanner";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

export function BottomNav() {
  const { pathname } = useLocation();
  const { user } = useAuth();

  const items: readonly NavItem[] =
    user?.role === "staff"
      ? [
          { to: "/staff", label: "Staff", icon: BriefcaseBusiness },
          { to: "/staff/workers", label: "Lao động", icon: Users },
          { to: "/account", label: "Tài khoản", icon: User },
          { to: "/staff/export", label: "Xuất file", icon: Download },
        ]
      : user?.role === "admin"
        ? [
            { to: "/", label: "Trang chủ", icon: Home },
            { to: "/admin/settings", label: "Cài đặt", icon: Settings },
            { to: "/admin/imports", label: "Nhập liệu", icon: Upload },
            { to: "/account", label: "Tài khoản", icon: User },
          ]
        : [
            { to: "/", label: "Trang chủ", icon: Home },
            { to: "/account", label: "Tài khoản", icon: User },
            { to: "/about", label: "Về chúng tôi", icon: Info },
          ];

  return (
    <>
      <InstallFloatingBanner />
      <nav
        className="fixed bottom-0 left-1/2 z-40 w-full max-w-[30rem] -translate-x-1/2 border-t border-border/60 bg-card/90 backdrop-blur-xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul
          className={cn(
            "gap-2 px-3 pb-2 pt-2",
            items.length === 5 ? "grid grid-cols-5" : items.length === 4 ? "grid grid-cols-4" : "grid grid-cols-3",
          )}
        >
          {items.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            const Icon = item.icon;

            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={cn(
                    "mx-auto flex min-h-[56px] w-full max-w-[12rem] flex-col items-center justify-center gap-0.5 rounded-2xl py-2 text-[11px] font-medium transition-colors",
                    active ? "bg-primary/12 text-primary" : "text-muted-foreground active:bg-muted",
                  )}
                >
                  <Icon className={cn("h-[22px] w-[22px] transition-transform", active && "scale-110")} />
                  <span className="leading-none">{item.label}</span>
                  <span
                    className={cn(
                      "mt-0.5 h-1 w-1 rounded-full transition-opacity",
                      active ? "bg-primary opacity-100" : "opacity-0",
                    )}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

export function AppHeader({
  title,
  subtitle,
  right,
  back,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  back?: boolean;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const showBack = back ?? pathname !== "/";

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }
    navigate({ to: "/" });
  };

  return (
    <header
      className="sticky top-0 z-30 flex items-center gap-2 border-b border-border/60 bg-card/90 px-3 backdrop-blur-xl"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.5rem)", paddingBottom: "0.5rem" }}
    >
      {showBack && (
        <button
          onClick={goBack}
          className="-ml-1 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition active:scale-95 active:bg-muted"
          aria-label="Quay lại"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold leading-tight tracking-tight">{title}</h1>
        {subtitle && <div className="truncate text-[11px] leading-tight text-muted-foreground">{subtitle}</div>}
      </div>
      {right}
    </header>
  );
}
