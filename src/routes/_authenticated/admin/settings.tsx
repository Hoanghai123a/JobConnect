import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { pb, dataUrlToFile, fileUrl } from "@/lib/pocketbase";
import { useAppSettings } from "@/lib/app-settings";
import { formatMoneyInput, parseMoneyInput } from "@/lib/money";
import { useQueryClient } from "@tanstack/react-query";
import { AppHeader } from "@/components/layout/BottomNav";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Building2,
  Factory,
  Users,
  Save,
  ImagePlus,
  Pencil,
  Trash2,
  Plus,
  Check,
  X,
  ShieldCheck,
  Search,
  Smartphone,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  beforeLoad: () => {
    const u = pb.authStore.record as any;
    if (!u || u.role !== "admin") throw redirect({ to: "/" });
  },
  component: AdminSettingsPage,
});

function AdminSettingsPage() {
  return (
    <div>
      <AppHeader title="Cài đặt hệ thống" back />
      <div className="p-4">
        <Tabs defaultValue="company" className="w-full">
          <TabsList className="grid w-full grid-cols-3 rounded-2xl">
            <TabsTrigger value="company" className="rounded-xl text-xs">
              <Building2 className="mr-1 h-4 w-4" /> Công ty
            </TabsTrigger>
            <TabsTrigger value="factories" className="rounded-xl text-xs">
              <Factory className="mr-1 h-4 w-4" /> Nhà máy
            </TabsTrigger>
            <TabsTrigger value="users" className="rounded-xl text-xs">
              <Users className="mr-1 h-4 w-4" /> Người dùng
            </TabsTrigger>
          </TabsList>
          <TabsContent value="company" className="mt-4">
            <CompanyTab />
          </TabsContent>
          <TabsContent value="factories" className="mt-4">
            <FactoriesTab />
          </TabsContent>
          <TabsContent value="users" className="mt-4">
            <UsersTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/* ───────── COMPANY ───────── */

function CompanyTab() {
  const { data: settings, logoUrl, refetch } = useAppSettings();
  const qc = useQueryClient();
  const [form, setForm] = useState<any>({});
  const [logoPreview, setLogoPreview] = useState<string>("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [installGuideFiles, setInstallGuideFiles] = useState<File[]>([]);
  const [removedInstallGuideImages, setRemovedInstallGuideImages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const installGuideImages = Array.isArray(settings.install_guide_images)
    ? settings.install_guide_images
    : [];

  useEffect(() => {
    setForm({
      company_name: settings.company_name || "",
      slogan: settings.slogan || "",
      address: settings.address || "",
      hotline: settings.hotline || "",
      email: settings.email || "",
      about: settings.about || "",
      advance_limit: formatMoneyInput(settings.advance_limit || 0),
      advance_rules: settings.advance_rules || "",
    });
    setLogoPreview(logoUrl);
  }, [settings.id]);

  const onPickLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const url = r.result as string;
      setLogoPreview(url);
      setLogoFile(dataUrlToFile(url, f.name || "logo.png"));
    };
    r.readAsDataURL(f);
  };

  const onPickInstallGuideImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setInstallGuideFiles((prev) => [...prev, ...files]);
    e.target.value = "";
  };

  const save = async () => {
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (k === "install_guide_images") return;
        if (k === "advance_limit") fd.append(k, String(parseMoneyInput(v as string)));
        else fd.append(k, (v as any) ?? "");
      });
      if (logoFile) fd.append("logo", logoFile);
      for (const rm of removedInstallGuideImages) fd.append("install_guide_images-", rm);
      for (const f of installGuideFiles) fd.append("install_guide_images", f);
      if (settings.id) {
        await pb.collection("app_settings").update(settings.id, fd);
      } else {
        await pb.collection("app_settings").create(fd);
      }
      toast.success("Đã lưu thông tin công ty");
      qc.invalidateQueries({ queryKey: ["app_settings"] });
      refetch();
      setInstallGuideFiles([]);
      setRemovedInstallGuideImages([]);
    } catch (e: any) {
      toast.error(e?.message || "Lỗi lưu");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="space-y-4 rounded-2xl border-border/60 p-4 shadow-soft">
      <div className="flex items-center gap-4">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border bg-muted">
          {logoPreview ? (
            <img src={logoPreview} alt="logo" className="logo-fit" />
          ) : (
            <Building2 className="h-8 w-8 text-muted-foreground" />
          )}
        </div>
        <label className="cursor-pointer">
          <input type="file" accept="image/*" hidden onChange={onPickLogo} />
          <span className="inline-flex items-center gap-1.5 rounded-xl border bg-card px-3 py-2 text-xs font-medium shadow-soft hover:bg-muted">
            <ImagePlus className="h-4 w-4" /> Đổi logo
          </span>
        </label>
      </div>

      <Field
        label="Tên công ty"
        value={form.company_name}
        onChange={(v) => setForm({ ...form, company_name: v })}
      />
      <Field label="Slogan" value={form.slogan} onChange={(v) => setForm({ ...form, slogan: v })} />
      <Field
        label="Địa chỉ"
        value={form.address}
        onChange={(v) => setForm({ ...form, address: v })}
      />
      <Field
        label="Hotline"
        value={form.hotline}
        onChange={(v) => setForm({ ...form, hotline: v })}
      />
      <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
      <div>
        <Label className="text-xs">Hạn mức Ứng lương</Label>
        <Input
          className="mt-1 rounded-xl"
          inputMode="numeric"
          placeholder="0"
          value={form.advance_limit || ""}
          onChange={(e) => setForm({ ...form, advance_limit: formatMoneyInput(e.target.value) })}
        />
      </div>
      <div>
        <Label className="text-xs">Nội quy Ứng lương</Label>
        <Textarea
          className="mt-1 rounded-xl"
          rows={5}
          placeholder="Nhập nội quy, điều kiện và lưu ý khi Ứng lương..."
          value={form.advance_rules || ""}
          onChange={(e) => setForm({ ...form, advance_rules: e.target.value })}
        />
      </div>
      <div>
        <Label className="text-xs">Giới thiệu</Label>
        <Textarea
          className="mt-1 rounded-xl"
          rows={5}
          value={form.about || ""}
          onChange={(e) => setForm({ ...form, about: e.target.value })}
        />
      </div>

      <div className="space-y-2 rounded-2xl border border-border/60 bg-muted/30 p-3">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-primary" />
          <div>
            <div className="text-xs font-semibold">Hướng dẫn cài app cho iOS</div>
            <div className="text-[11px] text-muted-foreground">
              Tải ảnh step-by-step để hiển thị trong nút "Hướng dẫn".
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {installGuideImages
            .filter((f) => !removedInstallGuideImages.includes(f))
            .map((f) => (
              <div key={f} className="relative">
                <img
                  src={fileUrl(settings, f)}
                  alt=""
                  className="h-20 w-20 rounded-xl object-cover"
                />
                <button
                  type="button"
                  onClick={() => setRemovedInstallGuideImages((prev) => [...prev, f])}
                  className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                  aria-label="Xoá ảnh hướng dẫn"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          {installGuideFiles.map((f, i) => (
            <div key={`${f.name}-${i}`} className="relative">
              <img
                src={URL.createObjectURL(f)}
                alt=""
                className="h-20 w-20 rounded-xl object-cover"
              />
              <button
                type="button"
                onClick={() => setInstallGuideFiles((prev) => prev.filter((_, j) => j !== i))}
                className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                aria-label="Xoá ảnh mới"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed text-muted-foreground">
            <ImagePlus className="h-5 w-5" />
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={onPickInstallGuideImages}
            />
          </label>
        </div>
      </div>

      <Button onClick={save} disabled={saving} className="w-full rounded-xl">
        <Save className="h-4 w-4" /> {saving ? "Đang lưu..." : "Lưu thay đổi"}
      </Button>

      <p className="text-[11px] text-muted-foreground">
        Yêu cầu collection PocketBase tên <code>app_settings</code> với các field: company_name,
        slogan, address, hotline, email, about (text), advance_limit (number), advance_rules (text),
        logo (file), install_guide_images (multiple files).
      </p>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        className="mt-1 rounded-xl"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/* ───────── FACTORIES ───────── */

interface Factory {
  id: string;
  name: string;
  address?: string;
  hotline?: string;
  note?: string;
}

function FactoriesTab() {
  const [items, setItems] = useState<Factory[]>([]);
  const [editing, setEditing] = useState<Partial<Factory> | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await pb.collection("factories").getFullList({ sort: "name" });
      setItems(res as any);
    } catch (e: any) {
      toast.error(e?.message || "Lỗi tải nhà máy. Hãy tạo collection 'factories'.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!editing?.name?.trim()) {
      toast.error("Tên nhà máy bắt buộc");
      return;
    }
    try {
      const payload = {
        name: editing.name,
        address: editing.address || "",
        hotline: editing.hotline || "",
        note: editing.note || "",
      };
      if (editing.id) {
        await pb.collection("factories").update(editing.id, payload);
      } else {
        await pb.collection("factories").create(payload);
      }
      toast.success("Đã lưu");
      setEditing(null);
      load();
    } catch (e: any) {
      toast.error(e?.message || "Lỗi lưu");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Xoá nhà máy này?")) return;
    try {
      await pb.collection("factories").delete(id);
      toast.success("Đã xoá");
      load();
    } catch (e: any) {
      toast.error(e?.message || "Lỗi xoá");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold">
          Nhà máy <span className="text-muted-foreground">({items.length})</span>
        </h2>
        <button
          onClick={() => setEditing({})}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-soft active:scale-95"
          aria-label="Thêm nhà máy"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {loading && <div className="py-6 text-center text-sm text-muted-foreground">Đang tải...</div>}
      {!loading && items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 py-10 text-center text-sm text-muted-foreground">
          Chưa có nhà máy. Bấm nút + để thêm.
        </div>
      )}
      {items.map((f) => (
        <div
          key={f.id}
          className="list-card border-l-[color:var(--status-info)] flex items-start gap-3"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Factory className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{f.name}</div>
            {f.address && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(f.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="mt-0.5 block text-[11px] text-muted-foreground hover:text-primary hover:underline"
              >
                📍 {f.address}
              </a>
            )}
            {f.hotline && <div className="text-[11px] text-muted-foreground">📞 {f.hotline}</div>}
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setEditing(f)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
              aria-label="Sửa"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => remove(f.id)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10"
              aria-label="Xoá"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Sửa nhà máy" : "Thêm nhà máy"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field
              label="Tên nhà máy *"
              value={editing?.name || ""}
              onChange={(v) => setEditing({ ...editing, name: v })}
            />
            <Field
              label="Địa chỉ"
              value={editing?.address || ""}
              onChange={(v) => setEditing({ ...editing, address: v })}
            />
            <Field
              label="Hotline"
              value={editing?.hotline || ""}
              onChange={(v) => setEditing({ ...editing, hotline: v })}
            />
            <div>
              <Label className="text-xs">Ghi chú</Label>
              <Textarea
                className="mt-1 rounded-xl"
                rows={3}
                value={editing?.note || ""}
                onChange={(e) => setEditing({ ...editing, note: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} className="rounded-xl">
              Huỷ
            </Button>
            <Button onClick={save} className="rounded-xl">
              <Save className="h-4 w-4" /> Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ───────── USERS ───────── */

function UsersTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [requireApproval, setRequireApproval] = useState(true);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [pendingApprovalValue, setPendingApprovalValue] = useState<boolean | null>(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [confirmingApproval, setConfirmingApproval] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await pb.collection("users").getFullList({ sort: "-created" });
      setUsers(res as any);
    } catch (e: any) {
      toast.error(e?.message || "Lỗi tải user");
    } finally {
      setLoading(false);
    }

    try {
      const s = await pb.collection("settings").getList(1, 1);
      if (s.items[0]) {
        setSettingsId(s.items[0].id);
        setRequireApproval(Boolean(s.items[0].require_approval));
      }
    } catch {
      // Settings collection may be initialized later by another admin screen.
    }
  };
  useEffect(() => {
    load();
  }, []);

  const toggleApproved = async (u: any) => {
    try {
      await pb.collection("users").update(u.id, { approved: !u.approved });
      toast.success(u.approved ? "Đã huỷ duyệt" : "Đã duyệt");
      load();
    } catch (e: any) {
      toast.error(e?.message || "Lỗi");
    }
  };

  const toggleRole = async (u: any) => {
    const newRole = u.role === "admin" ? "user" : "admin";
    if (!confirm(`Đổi vai trò sang ${newRole}?`)) return;
    try {
      await pb.collection("users").update(u.id, { role: newRole });
      toast.success("Đã đổi vai trò");
      load();
    } catch (e: any) {
      toast.error(e?.message || "Lỗi");
    }
  };

  const remove = async (u: any) => {
    if (!confirm(`Xoá user ${u.username || u.full_name}?`)) return;
    try {
      await pb.collection("users").delete(u.id);
      toast.success("Đã xoá");
      load();
    } catch (e: any) {
      toast.error(e?.message || "Lỗi");
    }
  };

  const toggleApprovalRequirement = async (val: boolean) => {
    setRequireApproval(val);
    try {
      if (settingsId) {
        await pb.collection("settings").update(settingsId, { require_approval: val });
      } else {
        const r = await pb.collection("settings").create({ require_approval: val });
        setSettingsId(r.id);
      }
      toast.success("Đã cập nhật kiểm duyệt đăng ký");
    } catch (e: any) {
      setRequireApproval((prev) => !prev);
      toast.error(e?.message || "Lỗi cập nhật");
    }
  };

  const requestToggleApprovalRequirement = (val: boolean) => {
    setPendingApprovalValue(val);
    setAdminPassword("");
  };

  const closeApprovalConfirm = () => {
    if (confirmingApproval) return;
    setPendingApprovalValue(null);
    setAdminPassword("");
  };

  const confirmToggleApprovalRequirement = async () => {
    if (pendingApprovalValue === null) return;
    const admin = pb.authStore.record as any;
    const identity = admin?.username || admin?.email;
    if (!identity) {
      toast.error("Không xác định được tài khoản admin");
      return;
    }
    if (!adminPassword) {
      toast.error("Nhập mật khẩu admin");
      return;
    }

    setConfirmingApproval(true);
    try {
      const res = await fetch("/api/public/pocketbase-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identity, password: adminPassword }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.message || "Mật khẩu admin không đúng");
      if (payload?.record?.id !== admin.id || payload?.record?.role !== "admin") {
        throw new Error("Tài khoản xác thực không phải admin hiện tại");
      }

      await toggleApprovalRequirement(pendingApprovalValue);
      closeApprovalConfirm();
    } catch (e: any) {
      toast.error(e?.message || "Không xác thực được mật khẩu admin");
    } finally {
      setConfirmingApproval(false);
    }
  };

  const filtered = users.filter((u) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (u.username || "").toLowerCase().includes(s) ||
      (u.full_name || "").toLowerCase().includes(s) ||
      (u.phone || "").toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-3">
      <Card className="flex items-center gap-3 rounded-2xl border-border/60 p-3.5 shadow-soft">
        <div className="rounded-xl bg-primary/10 p-2 text-primary">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <Label className="text-sm font-semibold">Yêu cầu duyệt khi đăng ký</Label>
          <div className="text-[11px] text-muted-foreground">
            Tắt để user tạo tài khoản và sử dụng ngay.
          </div>
        </div>
        <Switch checked={requireApproval} onCheckedChange={requestToggleApprovalRequirement} />
      </Card>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="rounded-full pl-9"
          placeholder="Tìm theo tên / username / SĐT"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="px-1 text-xs text-muted-foreground">
        Tổng: {users.length} · Hiển thị: {filtered.length}
      </div>

      {loading && <div className="py-6 text-center text-sm text-muted-foreground">Đang tải...</div>}
      {!loading && filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 py-10 text-center text-sm text-muted-foreground">
          Không có user.
        </div>
      )}
      {filtered.map((u) => {
        const avatar = u.avatar ? fileUrl(u, u.avatar) : "";
        const borderTone = u.approved
          ? "border-l-[color:var(--status-success)]"
          : "border-l-[color:var(--status-warning)]";
        return (
          <div key={u.id} className={`list-card flex items-start gap-3 ${borderTone}`}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
              {avatar ? (
                <img src={avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-sm font-semibold text-muted-foreground">
                  {(u.full_name || u.username || "?").slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{u.full_name || u.username}</div>
              <div className="text-[11px] text-muted-foreground">
                @{u.username} {u.phone && `· ${u.phone}`}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                <span className={`chip ${u.role === "admin" ? "chip-info" : "chip-neutral"}`}>
                  {u.role === "admin" && <ShieldCheck className="h-3 w-3" />}
                  {u.role === "admin" ? "Admin" : "User"}
                </span>
                <span className={`chip ${u.approved ? "chip-success" : "chip-warning"}`}>
                  {u.approved ? "Đã duyệt" : "Chờ duyệt"}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <button
                onClick={() => toggleApproved(u)}
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                  u.approved
                    ? "text-[color:var(--status-warning-fg)] hover:bg-[color:var(--status-warning-bg)]"
                    : "text-[color:var(--status-success-fg)] hover:bg-[color:var(--status-success-bg)]"
                }`}
                title={u.approved ? "Huỷ duyệt" : "Duyệt"}
              >
                {u.approved ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              </button>
              <button
                onClick={() => toggleRole(u)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-primary hover:bg-primary/10"
                title="Đổi vai trò"
              >
                <ShieldCheck className="h-4 w-4" />
              </button>
              <button
                onClick={() => remove(u)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10"
                title="Xoá"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })}

      <Dialog
        open={pendingApprovalValue !== null}
        onOpenChange={(open) => !open && closeApprovalConfirm()}
      >
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Xác nhận mật khẩu admin</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Mật khẩu admin</Label>
            <Input
              type="password"
              className="rounded-xl"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmToggleApprovalRequirement();
              }}
              autoComplete="current-password"
              autoFocus
            />
            <div className="text-xs text-muted-foreground">
              Sau khi xác thực, hệ thống sẽ {pendingApprovalValue ? "bật" : "tắt"} yêu cầu duyệt khi
              đăng ký.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeApprovalConfirm} className="rounded-xl">
              Huỷ
            </Button>
            <Button
              onClick={confirmToggleApprovalRequirement}
              disabled={confirmingApproval}
              className="rounded-xl"
            >
              {confirmingApproval ? "Đang xác thực..." : "Xác nhận"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
