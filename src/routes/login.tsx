import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { normalizeAccountIdentity } from "@/lib/account-identity";
import { pb } from "@/lib/pocketbase";
import { isProfileComplete } from "@/lib/profile";
import { isUserApproved } from "@/lib/user-approval";
import { BackButton } from "@/components/layout/BackButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    if (pb.authStore.isValid) throw redirect({ to: "/" });
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
        nav({ to: "/" });
        return;
      }

      if (role === "staff") {
        nav({ to: "/staff" });
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
    <div className="relative flex min-h-[100dvh] flex-col bg-background">
      {loading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-card shadow-soft">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          </div>
          <p className="mt-4 text-sm font-medium text-muted-foreground">Đang đăng nhập...</p>
        </div>
      )}

      <div className="gradient-primary relative px-6 pb-16 pt-16 text-primary-foreground">
        <BackButton className="absolute left-4 top-4 text-primary-foreground active:bg-white/15" />
        <h1 className="text-3xl font-bold tracking-tight">Hoàng Long DJC</h1>
        <p className="mt-1 text-sm text-primary-foreground/80">
          Kết nối người lao động và nhà tuyển dụng
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        noValidate
        className="card-soft mx-4 -mt-8 flex-1 space-y-5 rounded-[1.75rem] border border-border/70 bg-card/95 p-6 shadow-[0_20px_45px_-24px_rgba(15,23,42,0.28)] backdrop-blur"
      >
        <div className="space-y-1.5">
          <Label htmlFor="identity">Tên đăng nhập</Label>
          <Input
            id="identity"
            value={identity}
            disabled={loading}
            onChange={(event) => setIdentity(event.target.value)}
            autoComplete="username"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Mật khẩu</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              disabled={loading}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              className="pr-12"
            />
            <button
              type="button"
              disabled={loading}
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? "Ẩn mật khẩu" : "Hiển thị mật khẩu"}
              aria-pressed={showPassword}
              title={showPassword ? "Ẩn mật khẩu" : "Hiển thị mật khẩu"}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Eye className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        <Button type="submit" className="w-full rounded-xl" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          {loading ? "Đang đăng nhập..." : "Đăng nhập"}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Chưa có tài khoản?{" "}
          <Link to="/register" className="font-medium text-primary">
            Đăng ký
          </Link>
        </p>
      </form>
    </div>
  );
}
