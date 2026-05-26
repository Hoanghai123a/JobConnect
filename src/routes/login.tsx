import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { pb } from "@/lib/pocketbase";
import { isProfileComplete } from "@/lib/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BackButton } from "@/components/layout/BackButton";
import { toast } from "sonner";
import { Loader2, LogIn } from "lucide-react";

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
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedIdentity = identity.trim().toLowerCase();

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
      const u = await login(normalizedIdentity, password);
      const name = (u as any).full_name || (u as any).username || "bạn";
      if ((u as any).approved === false) {
        toast.warning("Tài khoản đang chờ duyệt", {
          id: toastId,
          description: `Xin chào ${name}, admin sẽ duyệt tài khoản của bạn sớm.`,
        });
        nav({ to: "/pending" });
      } else {
        const isAdmin = (u as any).role === "admin";
        toast.success(`Chào mừng ${name} 👋`, {
          id: toastId,
          description: isAdmin
            ? "Bạn đã đăng nhập với quyền quản trị viên."
            : "Đăng nhập thành công. Chúc bạn một ngày làm việc hiệu quả!",
        });
        if (isAdmin) {
          nav({ to: "/" });
        } else if (!isProfileComplete(u as any)) {
          toast.info("Bổ sung đầy đủ thông tin để trải nghiệm tốt nhất");
          nav({ to: "/account", search: { incomplete: 1 } as any });
        } else {
          nav({ to: "/attendance" });
        }
      }
    } catch (err: any) {
      console.error("[login] error", err, err?.data);
      const status = err?.status;
      const msg = err?.message || "";
      const data = err?.data;
      const friendly =
        status === 400 || /Failed to authenticate|invalid|credentials|password/i.test(msg)
          ? "Tên đăng nhập hoặc mật khẩu không đúng"
          : status === 0 || /Failed to fetch|network|NetworkError/i.test(msg)
            ? "Không kết nối được máy chủ. Vui lòng kiểm tra mạng / URL backend."
            : data?.message || msg || "Đăng nhập thất bại";
      toast.error("Đăng nhập thất bại", { id: toastId, description: friendly });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col relative">
      {loading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-card shadow-soft">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          </div>
          <p className="mt-4 text-sm font-medium text-muted-foreground">Đang đăng nhập...</p>
        </div>
      )}
      <div className="gradient-primary relative px-6 pb-10 pt-16 text-primary-foreground">
        <BackButton className="absolute left-4 top-4 text-primary-foreground active:bg-white/15" />
        <h1 className="text-3xl font-bold tracking-tight">HR Connect</h1>
        <p className="mt-1 text-sm text-primary-foreground/80">Kết nối NLĐ — Nhà tuyển dụng</p>
      </div>
      <form
        onSubmit={onSubmit}
        noValidate
        className="card-soft mx-4 -mt-6 flex-1 space-y-4 rounded-2xl p-5"
      >
        <div className="space-y-1.5">
          <Label htmlFor="identity">Tên đăng nhập</Label>
          <Input
            id="identity"
            value={identity}
            disabled={loading}
            onChange={(e) => setIdentity(e.target.value)}
            placeholder=""
            autoComplete="username"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pwd">Mật khẩu</Label>
          <Input
            id="pwd"
            type="password"
            value={password}
            disabled={loading}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
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
