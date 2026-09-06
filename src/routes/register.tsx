import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { pb } from "@/lib/pocketbase";
import { generateUid } from "@/lib/uid";
import { findUserByUsernameInsensitive, normalizeAccountUsername } from "@/lib/account-identity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BackButton } from "@/components/layout/BackButton";
import { toast } from "@/lib/toast";
import {
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Loader2,
  LogIn,
  UserCog,
  UserPlus,
  XCircle,
} from "lucide-react";

export const Route = createFileRoute("/register")({
  beforeLoad: () => {
    if (pb.authStore.isValid) throw redirect({ to: "/" });
  },
  component: RegisterPage,
});

async function fetchRequireApproval(): Promise<boolean> {
  try {
    const list = await pb.collection("app_settings").getList(1, 1);
    return Boolean(list.items[0]?.requireApproval ?? true);
  } catch {
    return true;
  }
}

type RegisterResult = "pending" | "approved" | null;

function RegisterPage() {
  const nav = useNavigate();
  const [form, setForm] = useState({
    username: "",
    full_name: "",
    phone: "",
    password: "",
    passwordConfirm: "",
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [result, setResult] = useState<RegisterResult>(null);

  const set = (k: keyof typeof form, v: string) => setForm((s) => ({ ...s, [k]: v }));

  const backToLogin = () => {
    pb.authStore.clear();
    nav({ to: "/login" });
  };

  const exit = () => {
    pb.authStore.clear();
    window.close();
    window.setTimeout(() => nav({ to: "/login" }), 100);
  };

  const useNow = () => {
    nav({ to: "/account", search: { incomplete: 1 } as any });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.passwordConfirm) {
      toast.error("Mật khẩu nhập lại không khớp");
      return;
    }

    const username = normalizeAccountUsername(form.username);
    if (!/^[a-z0-9_.]{4,30}$/.test(username)) {
      toast.error("Tên đăng nhập 4-30 ký tự, chỉ chữ/số/._");
      return;
    }

    const phoneDigits = form.phone.replace(/\D/g, "");
    if (form.phone && phoneDigits.length !== 10) {
      toast.error("Số điện thoại phải có đúng 10 chữ số; có thể thêm ký tự phía sau");
      return;
    }

    setLoading(true);
    try {
      const userTaken = await findUserByUsernameInsensitive(username);

      if (userTaken) {
        throw new Error("Tên đăng nhập đã tồn tại");
      }

      const requireApproval = await fetchRequireApproval();
      const uid = await generateUid();

      await pb.collection("users").create({
        username,
        uid,
        emailVisibility: false,
        password: form.password,
        passwordConfirm: form.passwordConfirm,
        full_name: form.full_name,
        phone: form.phone || undefined,
        role: "user",
        approvalStatus: requireApproval ? "pending" : "approved",
        approved: requireApproval ? "false" : "true",
        status: requireApproval ? "disabled" : "active",
      });

      if (requireApproval) {
        toast.success("Đã gửi đăng ký, chờ admin duyệt");
        pb.authStore.clear();
        setResult("pending");
      } else {
        await pb.collection("users").authWithPassword(username, form.password);
        toast.success("Đăng ký thành công");
        setResult("approved");
      }
    } catch (err: any) {
      toast.error(err?.message || "Đăng ký thất bại");
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    const isPending = result === "pending";
    return (
      <div className="relative flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-6 text-center">
        <div
          className={
            isPending
              ? "rounded-full bg-warning/20 p-5 text-warning-foreground"
              : "rounded-full bg-success/20 p-5 text-success-foreground"
          }
        >
          {isPending ? <Clock className="h-10 w-10" /> : <CheckCircle2 className="h-10 w-10" />}
        </div>
        <h1 className="text-xl font-semibold">
          {isPending ? "Đang chờ duyệt" : "Tạo tài khoản thành công"}
        </h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          {isPending
            ? "Tài khoản của bạn đã được gửi tới admin. Bạn sẽ vào được hệ thống ngay khi được duyệt."
            : "Tài khoản đã sẵn sàng. Bạn có thể vào ứng dụng để bổ sung thông tin tài khoản."}
        </p>
        <div className="flex w-full max-w-xs flex-col gap-2">
          {isPending ? (
            <>
              <Button variant="outline" onClick={backToLogin} className="w-full">
                <LogIn className="h-4 w-4" /> Trở về đăng nhập
              </Button>
              <Button variant="ghost" onClick={exit} className="w-full">
                <XCircle className="h-4 w-4" /> Thoát
              </Button>
            </>
          ) : (
            <>
              <Button onClick={useNow} className="w-full">
                <UserCog className="h-4 w-4" /> Sử dụng ngay
              </Button>
              <Button variant="outline" onClick={backToLogin} className="w-full">
                <LogIn className="h-4 w-4" /> Trở về đăng nhập
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background desktop:grid desktop:grid-cols-[minmax(22rem,0.85fr)_minmax(28rem,1fr)] desktop:items-center desktop:gap-12 desktop:px-12">
      <div className="gradient-primary relative px-6 pb-16 pt-16 text-primary-foreground desktop:rounded-3xl desktop:px-12 desktop:py-16 desktop:shadow-card">
        <BackButton className="absolute left-4 top-4 text-primary-foreground active:bg-white/15" />
        <h1 className="text-2xl font-bold">Tạo tài khoản</h1>
        <p className="mt-1 text-sm text-primary-foreground/80">
          Sau khi đăng ký, admin có thể cần duyệt tài khoản của bạn.
        </p>
      </div>
      <form
        onSubmit={onSubmit}
        className="card-soft mx-4 -mt-8 space-y-4 rounded-[1.75rem] border border-border/70 bg-card/95 p-6 shadow-[0_20px_45px_-24px_rgba(15,23,42,0.28)] backdrop-blur desktop:mx-0 desktop:mt-0 desktop:w-full desktop:max-w-xl desktop:justify-self-start desktop:p-8"
      >
        <Field
          label="Tên đăng nhập"
          value={form.username}
          onChange={(v) => set("username", v)}
          required
          placeholder="VD: NguyenVanA"
        />
        <Field
          label="Họ và tên"
          value={form.full_name}
          onChange={(v) => set("full_name", v)}
          required
        />
        <Field
          label="Số điện thoại"
          value={form.phone}
          onChange={(v) => set("phone", v)}
          type="tel"
        />
        <Field
          label="Mật khẩu"
          value={form.password}
          onChange={(v) => set("password", v)}
          required
          placeholder="Ít nhất 8 ký tự"
          type={showPassword ? "text" : "password"}
          action={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-3 flex items-center text-muted-foreground"
              aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />
        <Field
          label="Nhập lại mật khẩu"
          value={form.passwordConfirm}
          onChange={(v) => set("passwordConfirm", v)}
          required
          type={showPassword ? "text" : "password"}
          action={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-3 flex items-center text-muted-foreground"
              aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UserPlus className="h-4 w-4" />
          )}
          Đăng ký
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Đã có tài khoản?{" "}
          <Link to="/login" className="font-medium text-primary">
            Đăng nhập
          </Link>
        </p>
      </form>
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {props.label}
        {props.required && <span className="text-destructive"> *</span>}
      </Label>
      <div className="relative">
        <Input
          type={props.type || "text"}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          required={props.required}
          placeholder={props.placeholder}
          className={props.action ? "pr-10" : undefined}
        />
        {props.action}
      </div>
    </div>
  );
}
