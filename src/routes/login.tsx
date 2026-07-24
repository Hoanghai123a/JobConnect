import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { normalizeAccountIdentity } from "@/lib/account-identity";
import { pb } from "@/lib/pocketbase";
import { isProfileComplete } from "@/lib/profile";
import { isUserApproved } from "@/lib/user-approval";
import { getClientDeviceProfile } from "@/lib/device-profile";
import { BackButton } from "@/components/layout/BackButton";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export const Route = createFileRoute("/login")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    if (pb.authStore.isValid) {
      const role = pb.authStore.record?.role;
      const isDesktop = getClientDeviceProfile() === "desktop";
      if (role === "admin" && isDesktop) throw redirect({ to: "/admin/workforce" });
      if (role === "staff") {
        throw redirect({ to: isDesktop ? "/staff/workers" : "/staff" });
      }
      throw redirect({ to: "/" });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedIdentity = normalizeAccountIdentity(identity);

    if (!normalizedIdentity || !password) {
      toast.warning("Thiếu thông tin đăng nhập", {
        description: !normalizedIdentity
          ? "Vui lòng nhập tên đăng nhập."
          : "Vui lòng nhập mật khẩu.",
      });
      return;
    }

    setLoading(true);
    const toastId = toast.loading("Đang đăng nhập...", {
      description: "Đang kiểm tra tài khoản với máy chủ.",
    });

    try {
      const loggedInUser = await login(normalizedIdentity, password);
      const name = loggedInUser.full_name || loggedInUser.username || "bạn";

      if (!isUserApproved(loggedInUser)) {
        toast.warning("Tài khoản đang chờ duyệt", {
          id: toastId,
          description: `Xin chào ${name}, admin sẽ duyệt tài khoản của bạn sớm.`,
        });
        nav({ to: "/pending" });
        return;
      }

      if (loggedInUser.must_change_password) {
        toast.info("Vui lòng đổi mật khẩu để tiếp tục", {
          id: toastId,
          description: "Tài khoản đang sử dụng mật khẩu mặc định.",
        });
        nav({ to: "/force-change-password" });
        return;
      }

      const role = loggedInUser.role;
      toast.success(`Chào mừng ${name}`, {
        id: toastId,
        description:
          role === "admin"
            ? "Bạn đã đăng nhập với quyền quản trị viên."
            : role === "staff"
              ? "Bạn đã đăng nhập với quyền staff."
              : "Đăng nhập thành công. Chúc bạn một ngày làm việc hiệu quả.",
      });

      if (role === "admin") {
        nav({ to: getClientDeviceProfile() === "desktop" ? "/admin/workforce" : "/" });
        return;
      }

      if (role === "staff") {
        nav({ to: getClientDeviceProfile() === "desktop" ? "/staff/workers" : "/staff" });
        return;
      }

      if (!isProfileComplete(loggedInUser)) {
        toast.info("Bổ sung đầy đủ thông tin để trải nghiệm tốt nhất");
        nav({ to: "/account", search: { incomplete: 1 } as any });
        return;
      }

      nav({ to: "/attendance" });
    } catch (error: any) {
      console.error("[login] error", error, error?.data);
      const status = error?.status;
      const message = error?.message || "";
      const payload = error?.data;

      const friendlyMessage =
        status === 400 || /Failed to authenticate|invalid|credentials|password/i.test(message)
          ? "Tên đăng nhập hoặc mật khẩu không đúng"
          : status === 0 || /Failed to fetch|network|NetworkError/i.test(message)
            ? "Không kết nối được máy chủ. Vui lòng kiểm tra mạng hoặc URL backend."
            : payload?.message || message || "Đăng nhập thất bại";

      toast.error("Đăng nhập thất bại", {
        id: toastId,
        description: friendlyMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-background desktop:fixed desktop:inset-0 desktop:z-40 desktop:grid desktop:grid-cols-[minmax(0,1.2fr)_minmax(32rem,0.8fr)]">
      {loading ? <LoginLoadingOverlay /> : null}

      <MobileBrandHeader />
      <DesktopBrandPanel />

      <section className="relative flex flex-1 desktop:items-center desktop:justify-center desktop:bg-muted/30 desktop:px-12">
        <LoginFormCard
          identity={identity}
          password={password}
          showPassword={showPassword}
          loading={loading}
          onIdentityChange={setIdentity}
          onPasswordChange={setPassword}
          onTogglePassword={() => setShowPassword((visible) => !visible)}
          onSubmit={onSubmit}
        />
      </section>
    </main>
  );
}

function LoginLoadingOverlay() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/70 backdrop-blur-sm"
    >
      <div className="flex size-16 items-center justify-center rounded-2xl bg-card shadow-soft">
        <Loader2 className="size-7 animate-spin text-primary" aria-hidden="true" />
      </div>
      <p className="mt-4 text-sm font-medium text-muted-foreground">Đang đăng nhập...</p>
    </div>
  );
}

function MobileBrandHeader() {
  return (
    <header className="gradient-primary relative px-6 pb-16 pt-16 text-primary-foreground desktop:hidden">
      <BackButton className="absolute left-4 top-4 text-primary-foreground active:bg-white/15" />
      <h1 className="text-3xl font-bold tracking-tight">Hoàng Long DJC</h1>
      <p className="mt-1 text-sm text-primary-foreground/80">
        Kết nối người lao động và nhà tuyển dụng
      </p>
    </header>
  );
}

function DesktopBrandPanel() {
  return (
    <section className="relative hidden min-h-[100dvh] overflow-hidden border-r border-border bg-background desktop:flex desktop:flex-col">
      <header className="relative z-10 flex items-center gap-4 px-12 py-10 xl:px-16">
        <BackButton className="border border-border bg-card shadow-soft hover:bg-muted" />
        <DesktopAppLogo />
        <p className="text-xl font-bold tracking-tight text-foreground">Hoàng Long DJC</p>
      </header>

      <div className="relative z-10 flex flex-1 items-center px-16 pb-28 xl:px-24">
        <div className="max-w-2xl">
          <h1 className="max-w-2xl text-5xl font-bold leading-[1.16] tracking-[-0.035em] text-foreground xl:text-6xl">
            Kết nối người lao động và nhà tuyển dụng
          </h1>
        </div>
      </div>

      <DesktopConnectionMotif />
    </section>
  );
}

function DesktopAppLogo() {
  const [logoUrl, setLogoUrl] = useState("/pwa-icon.svg");

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = "";

    fetch("/api/public/app-logo", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Không thể tải logo");
        return response.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setLogoUrl(objectUrl);
      })
      .catch(() => undefined);

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, []);

  return (
    <img
      src={logoUrl}
      alt="Logo Hoàng Long DJC"
      className="size-14 rounded-2xl border border-border bg-card object-contain p-1.5 shadow-soft"
    />
  );
}

function DesktopConnectionMotif() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[44%]" aria-hidden="true">
      <div className="absolute -bottom-44 -left-40 h-80 w-[70rem] -rotate-6 rounded-[50%] border border-primary/20" />
      <div className="absolute -bottom-36 -left-32 h-72 w-[66rem] -rotate-3 rounded-[50%] border border-primary/15" />
      <div className="absolute -bottom-28 -left-24 h-64 w-[62rem] rounded-[50%] border border-primary/15" />
      <div className="absolute -bottom-20 -left-16 h-56 w-[58rem] rotate-3 rounded-[50%] border border-primary/10" />
      <span className="absolute bottom-24 left-[14%] size-3 rounded-full bg-primary/70" />
      <span className="absolute bottom-32 left-[38%] size-2.5 rounded-full border-2 border-primary/60 bg-background" />
      <span className="absolute bottom-20 left-[62%] size-3 rounded-full bg-primary/40" />
      <span className="absolute bottom-36 left-[78%] size-2 rounded-full bg-primary/25" />
    </div>
  );
}

function LoginFormCard({
  identity,
  password,
  showPassword,
  loading,
  onIdentityChange,
  onPasswordChange,
  onTogglePassword,
  onSubmit,
}: {
  identity: string;
  password: string;
  showPassword: boolean;
  loading: boolean;
  onIdentityChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onTogglePassword: () => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <Card className="mx-4 -mt-8 flex flex-1 rounded-[1.75rem] border-border/70 bg-card/95 shadow-soft backdrop-blur desktop:mx-0 desktop:mt-0 desktop:w-full desktop:max-w-[460px] desktop:flex-none desktop:rounded-2xl">
      <form onSubmit={onSubmit} noValidate className="flex h-full flex-col">
        <CardHeader className="hidden px-8 pb-2 pt-8 text-center desktop:flex">
          <CardTitle className="text-3xl font-bold tracking-tight">Chào mừng trở lại</CardTitle>
          <CardDescription className="text-base">
            Đăng nhập để tiếp tục công việc của bạn.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-5 p-6 desktop:px-8 desktop:pb-6 desktop:pt-6">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="identity">Tên đăng nhập</Label>
            <Input
              id="identity"
              value={identity}
              disabled={loading}
              onChange={(event) => onIdentityChange(event.target.value)}
              autoComplete="username"
              placeholder="Nhập tên đăng nhập"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Mật khẩu</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                disabled={loading}
                onChange={(event) => onPasswordChange(event.target.value)}
                autoComplete="current-password"
                placeholder="Nhập mật khẩu"
                className="pr-12"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={loading}
                onClick={onTogglePassword}
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiển thị mật khẩu"}
                aria-pressed={showPassword}
                title={showPassword ? "Ẩn mật khẩu" : "Hiển thị mật khẩu"}
                className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff aria-hidden="true" />
                ) : (
                  <Eye aria-hidden="true" />
                )}
              </Button>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" />
            ) : (
              <LogIn data-icon="inline-start" aria-hidden="true" />
            )}
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </Button>
        </CardContent>

        <CardFooter className="flex flex-col px-6 pb-6 pt-0 desktop:px-8 desktop:pb-8">
          <Separator className="mb-5 hidden desktop:block" />
          <p className="text-center text-sm text-muted-foreground">
            Chưa có tài khoản?{" "}
            <Link
              to="/register"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Đăng ký
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
