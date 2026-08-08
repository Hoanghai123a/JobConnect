import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { toast } from "@/lib/toast";
import { useAuth } from "@/lib/auth";
import { normalizeAccountIdentity } from "@/lib/account-identity";
import { getClientDeviceProfile } from "@/lib/device-profile";
import { isProfileComplete } from "@/lib/profile";
import { isUserApproved } from "@/lib/user-approval";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function safeRedirectPath(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export function LoginRequiredDialog({
  open,
  onOpenChange,
  redirectTo = "/",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  redirectTo?: string;
}) {
  const { login } = useAuth();
  const navigate = useNavigate();
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
      const user = await login(normalizedIdentity, password);
      const name = user.full_name || user.username || "bạn";

      if (!isUserApproved(user)) {
        toast.warning("Tài khoản đang chờ duyệt", {
          id: toastId,
          description: `Xin chào ${name}, admin sẽ duyệt tài khoản của bạn sớm.`,
        });
        onOpenChange(false);
        navigate({ to: "/pending" });
        return;
      }

      if (user.must_change_password) {
        toast.info("Vui lòng đổi mật khẩu để tiếp tục", {
          id: toastId,
          description: "Tài khoản đang sử dụng mật khẩu mặc định.",
        });
        onOpenChange(false);
        navigate({ to: "/force-change-password" });
        return;
      }

      toast.success(`Chào mừng ${name}`, { id: toastId });
      onOpenChange(false);

      if (user.role === "admin") {
        navigate({ to: getClientDeviceProfile() === "desktop" ? "/admin/workforce" : "/" });
        return;
      }
      if (user.role === "staff") {
        navigate({ to: getClientDeviceProfile() === "desktop" ? "/staff/workers" : "/staff" });
        return;
      }
      if (!isProfileComplete(user)) {
        toast.info("Bổ sung đầy đủ thông tin để trải nghiệm tốt nhất");
        navigate({ to: "/account", search: { incomplete: 1 } as any });
        return;
      }

      navigate({ to: safeRedirectPath(redirectTo) as never });
    } catch (error: any) {
      const status = error?.status;
      const message = error?.message || "";
      const friendlyMessage =
        status === 400 || /Failed to authenticate|invalid|credentials|password/i.test(message)
          ? "Tên đăng nhập hoặc mật khẩu không đúng"
          : status === 0 || /Failed to fetch|network|NetworkError/i.test(message)
            ? "Không kết nối được máy chủ. Vui lòng kiểm tra mạng hoặc thử lại."
            : error?.data?.message || message || "Đăng nhập thất bại";

      toast.error("Đăng nhập thất bại", {
        id: toastId,
        description: friendlyMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-3xl p-0 sm:rounded-3xl">
        <DialogHeader className="gradient-primary rounded-t-3xl px-6 pb-5 pt-6 text-primary-foreground">
          <DialogTitle className="text-xl">Đăng nhập để tiếp tục</DialogTitle>
          <DialogDescription className="text-primary-foreground/80">
            Chức năng này cần tài khoản người lao động đã được duyệt.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="space-y-4 px-6 pb-6">
          <div className="space-y-1.5">
            <Label htmlFor="login-dialog-identity">Tên đăng nhập</Label>
            <Input
              id="login-dialog-identity"
              value={identity}
              disabled={loading}
              onChange={(event) => setIdentity(event.target.value)}
              autoComplete="username"
              placeholder="Nhập tên đăng nhập"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="login-dialog-password">Mật khẩu</Label>
            <div className="relative">
              <Input
                id="login-dialog-password"
                type={showPassword ? "text" : "password"}
                value={password}
                disabled={loading}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                placeholder="Nhập mật khẩu"
                className="pr-12"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={loading}
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiển thị mật khẩu"}
                className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </Button>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <LogIn aria-hidden="true" />}
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Chưa có tài khoản?{" "}
            <Link
              to="/register"
              onClick={() => onOpenChange(false)}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Đăng ký
            </Link>
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
