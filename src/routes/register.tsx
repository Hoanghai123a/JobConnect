import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { pb } from "@/lib/pocketbase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BackButton } from "@/components/layout/BackButton";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";

export const Route = createFileRoute("/register")({
  beforeLoad: () => {
    if (pb.authStore.isValid) throw redirect({ to: "/" });
  },
  component: RegisterPage,
});

async function fetchRequireApproval(): Promise<boolean> {
  try {
    const list = await pb.collection("settings").getList(1, 1);
    return Boolean(list.items[0]?.require_approval ?? true);
  } catch {
    return true;
  }
}

function RegisterPage() {
  const nav = useNavigate();
  const [form, setForm] = useState({
    username: "",
    full_name: "",
    phone: "",
    bank_account_number: "",
    password: "",
    passwordConfirm: "",
  });
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm((s) => ({ ...s, [k]: v }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.passwordConfirm) {
      toast.error("Mật khẩu nhập lại không khớp");
      return;
    }
    const username = form.username.trim().toLowerCase();
    if (!/^[a-z0-9_.]{4,30}$/.test(username)) {
      toast.error("Tên đăng nhập 4–30 ký tự, chỉ chữ/số/._");
      return;
    }
    if (form.phone && !/^[0-9]{9,11}$/.test(form.phone)) {
      toast.error("Số điện thoại không hợp lệ");
      return;
    }
    setLoading(true);
    try {
      const userTaken = await pb
        .collection("users")
        .getList(1, 1, { filter: `username="${username}"` })
        .catch(() => ({ items: [] as any[] }));
      if (userTaken.items.length) throw new Error("Tên đăng nhập đã tồn tại");

      if (form.bank_account_number) {
        const stkTaken = await pb
          .collection("users")
          .getList(1, 1, {
            filter: `bank_account_number="${form.bank_account_number}"`,
          })
          .catch(() => ({ items: [] as any[] }));
        if (stkTaken.items.length) throw new Error("Số tài khoản đã tồn tại");
      }

      const requireApproval = await fetchRequireApproval();

      await pb.collection("users").create({
        username,
        emailVisibility: false,
        password: form.password,
        passwordConfirm: form.passwordConfirm,
        full_name: form.full_name,
        phone: form.phone || undefined,
        bank_account_number: form.bank_account_number || undefined,
        role: "user",
        approved: !requireApproval,
      });

      await pb.collection("users").authWithPassword(username, form.password);

      if (requireApproval) {
        toast.success("Đã gửi đăng ký, chờ admin duyệt");
        nav({ to: "/pending" });
      } else {
        toast.success("Đăng ký thành công");
        nav({ to: "/news" });
      }
    } catch (err: any) {
      toast.error(err?.message || "Đăng ký thất bại");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh]">
      <div className="gradient-primary relative px-6 pb-10 pt-16 text-primary-foreground">
        <BackButton className="absolute left-4 top-4 text-primary-foreground active:bg-white/15" />
        <h1 className="text-2xl font-bold">Tạo tài khoản</h1>
        <p className="mt-1 text-sm text-primary-foreground/80">
          Sau khi đăng ký, admin có thể cần duyệt tài khoản của bạn.
        </p>
      </div>
      <form onSubmit={onSubmit} className="card-soft mx-4 -mt-6 space-y-3 rounded-2xl p-5">
        <Field label="Tên đăng nhập" value={form.username} onChange={(v) => set("username", v)} required placeholder="nguyenvana" />
        <Field label="Họ và tên" value={form.full_name} onChange={(v) => set("full_name", v)} required />
        <Field label="Số điện thoại" value={form.phone} onChange={(v) => set("phone", v)} type="tel" />
        <Field label="Số tài khoản ngân hàng" value={form.bank_account_number} onChange={(v) => set("bank_account_number", v)} />
        <Field label="Mật khẩu" value={form.password} onChange={(v) => set("password", v)} required type="password" />
        <Field label="Nhập lại mật khẩu" value={form.passwordConfirm} onChange={(v) => set("passwordConfirm", v)} required type="password" />
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Đăng ký
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Đã có tài khoản?{" "}
          <Link to="/login" className="font-medium text-primary">Đăng nhập</Link>
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
}) {
  return (
    <div className="space-y-1.5">
      <Label>{props.label}{props.required && <span className="text-destructive"> *</span>}</Label>
      <Input
        type={props.type || "text"}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        required={props.required}
        placeholder={props.placeholder}
      />
    </div>
  );
}
