import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { pb, dataUrlToFile, fileUrl, type UserRecord } from "@/lib/pocketbase";
import { useAppSettings } from "@/lib/app-settings";
import { createStaffActionLog } from "@/lib/staff-log";
import { formatMoneyInput, parseMoneyInput } from "@/lib/money";
import { useQueryClient } from "@tanstack/react-query";
import { AppHeader } from "@/components/layout/BottomNav";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FactoryManagersDialog } from "@/components/factories/FactoryManagersDialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  Home,
  Save,
  ImagePlus,
  Pencil,
  Trash2,
  Plus,
  X,
  ShieldCheck,
  Smartphone,
  CalendarDays,
  ChevronDown,
  MapPin,
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
          <TabsList className="grid w-full grid-cols-2 rounded-2xl">
            <TabsTrigger value="company" className="rounded-xl text-xs">
              <Building2 className="mr-1 h-4 w-4" /> Công ty
            </TabsTrigger>
            <TabsTrigger value="factories" className="rounded-xl text-xs">
              <Factory className="mr-1 h-4 w-4" /> Nhà máy
            </TabsTrigger>
          </TabsList>
          <TabsContent value="company" className="mt-4">
            <CompanyTab />
          </TabsContent>
          <TabsContent value="factories" className="mt-4">
            <FactoriesTab />
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
      account_code_prefix: settings.account_code_prefix || "",
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
        <Label className="text-xs">Tiền tố UID</Label>
        <Input
          className="mt-1 rounded-xl uppercase"
          placeholder="VD: HL"
          maxLength={6}
          value={form.account_code_prefix || ""}
          onChange={(e) =>
            setForm({
              ...form,
              account_code_prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
            })
          }
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          UID sẽ có dạng{" "}
          <span className="font-mono font-semibold">
            {(form.account_code_prefix || "HL") + "000001"}
          </span>{" "}
          và tăng dần. Đổi tiền tố chỉ áp dụng cho UID cấp mới.
        </p>
      </div>
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
        logo (file), install_guide_images (multiple files). Collection <code>factories</code> cần
        thêm field attendance_cutoff_day (number).
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
  attendance_cutoff_day?: number;
}

interface RecruitmentArea {
  id: string;
  name: string;
  note?: string;
}

interface MainHouse {
  id: string;
  name: string;
  address?: string;
  hotline?: string;
  note?: string;
}

function FactoriesTab() {
  const currentUser = pb.authStore.record as UserRecord | null;
  const [items, setItems] = useState<Factory[]>([]);
  const [areas, setAreas] = useState<RecruitmentArea[]>([]);
  const [mainHouses, setMainHouses] = useState<MainHouse[]>([]);
  const [editing, setEditing] = useState<Partial<Factory> | null>(null);
  const [editingArea, setEditingArea] = useState<Partial<RecruitmentArea> | null>(null);
  const [editingMainHouse, setEditingMainHouse] = useState<Partial<MainHouse> | null>(null);
  const [loading, setLoading] = useState(false);
  const [areasLoading, setAreasLoading] = useState(false);
  const [mainHousesLoading, setMainHousesLoading] = useState(false);
  const [factoriesOpen, setFactoriesOpen] = useState(true);
  const [areasOpen, setAreasOpen] = useState(true);
  const [mainHousesOpen, setMainHousesOpen] = useState(true);
  const [managingFactory, setManagingFactory] = useState<Factory | null>(null);

  const loadFactories = async () => {
    setLoading(true);
    try {
      const res = await pb.collection("factories").getList(1, 300, { sort: "name" });
      setItems(res.items as any);
    } catch (e: any) {
      toast.error(e?.message || "Lỗi tải nhà máy. Hãy tạo collection 'factories'.");
    } finally {
      setLoading(false);
    }
  };

  const loadAreas = async () => {
    setAreasLoading(true);
    try {
      const res = await pb.collection("recruitment_areas").getList(1, 300, { sort: "name" });
      setAreas(res.items as any);
    } catch (e: any) {
      toast.error(e?.message || "Lỗi tải khu vực. Hãy tạo collection 'recruitment_areas'.");
    } finally {
      setAreasLoading(false);
    }
  };

  const loadMainHouses = async () => {
    setMainHousesLoading(true);
    try {
      const res = await pb.collection("main_houses").getList(1, 300, { sort: "name" });
      setMainHouses(res.items as any);
    } catch (e: any) {
      toast.error(e?.message || "Lỗi tải nhà chính. Hãy tạo collection 'main_houses'.");
    } finally {
      setMainHousesLoading(false);
    }
  };

  useEffect(() => {
    loadFactories();
    loadAreas();
    loadMainHouses();
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
        attendance_cutoff_day: Number(editing.attendance_cutoff_day) || 31,
      };
      if (editing.id) {
        const before = items.find((it) => it.id === editing.id);
        await pb.collection("factories").update(editing.id, payload);
        await createStaffActionLog({
          actor: currentUser,
          targetCollection: "factories",
          targetRecord: editing.id,
          action: "update",
          before,
          after: payload,
          note: "Admin cập nhật nhà máy",
        });
      } else {
        const created = await pb.collection("factories").create(payload);
        await createStaffActionLog({
          actor: currentUser,
          targetCollection: "factories",
          targetRecord: created.id,
          action: "create",
          after: payload,
          note: "Admin tạo nhà máy mới",
        });
      }
      toast.success("Đã lưu");
      setEditing(null);
      loadFactories();
    } catch (e: any) {
      toast.error(e?.message || "Lỗi lưu");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Xoá nhà máy này?")) return;
    try {
      const before = items.find((it) => it.id === id);
      await pb.collection("factories").delete(id);
      await createStaffActionLog({
        actor: currentUser,
        targetCollection: "factories",
        targetRecord: id,
        action: "delete",
        before,
        note: "Admin xoá nhà máy",
      });
      toast.success("Đã xoá");
      loadFactories();
    } catch (e: any) {
      toast.error(e?.message || "Lỗi xoá");
    }
  };

  const saveArea = async () => {
    const name = editingArea?.name?.trim();
    if (!name) {
      toast.error("Tên khu vực bắt buộc");
      return;
    }
    try {
      const payload = {
        name,
        note: editingArea?.note || "",
      };
      if (editingArea?.id) {
        const before = areas.find((a) => a.id === editingArea.id);
        await pb.collection("recruitment_areas").update(editingArea.id, payload);
        await createStaffActionLog({
          actor: currentUser,
          targetCollection: "recruitment_areas",
          targetRecord: editingArea.id,
          action: "update",
          before,
          after: payload,
          note: "Admin cập nhật khu vực tuyển dụng",
        });
      } else {
        const created = await pb.collection("recruitment_areas").create(payload);
        await createStaffActionLog({
          actor: currentUser,
          targetCollection: "recruitment_areas",
          targetRecord: created.id,
          action: "create",
          after: payload,
          note: "Admin tạo khu vực tuyển dụng",
        });
      }
      toast.success("Đã lưu khu vực");
      setEditingArea(null);
      loadAreas();
    } catch (e: any) {
      toast.error(e?.message || "Lỗi lưu khu vực");
    }
  };

  const removeArea = async (id: string) => {
    if (!confirm("Xoá khu vực này?")) return;
    try {
      const before = areas.find((a) => a.id === id);
      await pb.collection("recruitment_areas").delete(id);
      await createStaffActionLog({
        actor: currentUser,
        targetCollection: "recruitment_areas",
        targetRecord: id,
        action: "delete",
        before,
        note: "Admin xoá khu vực tuyển dụng",
      });
      toast.success("Đã xoá khu vực");
      loadAreas();
    } catch (e: any) {
      toast.error(e?.message || "Lỗi xoá khu vực");
    }
  };

  const saveMainHouse = async () => {
    const name = editingMainHouse?.name?.trim();
    if (!name) {
      toast.error("Tên nhà chính bắt buộc");
      return;
    }
    try {
      const payload = {
        name,
        address: editingMainHouse?.address || "",
        hotline: editingMainHouse?.hotline || "",
        note: editingMainHouse?.note || "",
      };
      if (editingMainHouse?.id) {
        const before = mainHouses.find((m) => m.id === editingMainHouse.id);
        await pb.collection("main_houses").update(editingMainHouse.id, payload);
        await createStaffActionLog({
          actor: currentUser,
          targetCollection: "main_houses",
          targetRecord: editingMainHouse.id,
          action: "update",
          before,
          after: payload,
          note: "Admin cập nhật nhà chính",
        });
      } else {
        const created = await pb.collection("main_houses").create(payload);
        await createStaffActionLog({
          actor: currentUser,
          targetCollection: "main_houses",
          targetRecord: created.id,
          action: "create",
          after: payload,
          note: "Admin tạo nhà chính mới",
        });
      }
      toast.success("Đã lưu nhà chính");
      setEditingMainHouse(null);
      loadMainHouses();
    } catch (e: any) {
      toast.error(e?.message || "Lỗi lưu nhà chính");
    }
  };

  const removeMainHouse = async (id: string) => {
    if (!confirm("Xoá nhà chính này?")) return;
    try {
      const before = mainHouses.find((m) => m.id === id);
      await pb.collection("main_houses").delete(id);
      await createStaffActionLog({
        actor: currentUser,
        targetCollection: "main_houses",
        targetRecord: id,
        action: "delete",
        before,
        note: "Admin xoá nhà chính",
      });
      toast.success("Đã xoá nhà chính");
      loadMainHouses();
    } catch (e: any) {
      toast.error(e?.message || "Lỗi xoá nhà chính");
    }
  };

  return (
    <div className="space-y-3">
      <Collapsible open={factoriesOpen} onOpenChange={setFactoriesOpen}>
        <div className="rounded-2xl border border-border/70 bg-card p-3 shadow-soft">
          <div className="flex items-center justify-between gap-2">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                aria-label="Thu gọn hoặc mở rộng danh sách nhà máy"
              >
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${factoriesOpen ? "rotate-0" : "-rotate-90"}`}
                />
                <h2 className="text-sm font-semibold">
                  Nhà máy <span className="text-muted-foreground">({items.length})</span>
                </h2>
              </button>
            </CollapsibleTrigger>
            <button
              onClick={() => setEditing({})}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-soft active:scale-95"
              aria-label="Thêm nhà máy"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <CollapsibleContent className="mt-3 space-y-3">
            {loading && (
              <div className="py-6 text-center text-sm text-muted-foreground">Đang tải...</div>
            )}
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
                  {f.hotline && (
                    <div className="text-[11px] text-muted-foreground">📞 {f.hotline}</div>
                  )}
                  <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    <CalendarDays className="h-3 w-3" />
                    Chốt công ngày {f.attendance_cutoff_day || 31}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setManagingFactory(f)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-primary hover:bg-primary/10"
                    aria-label="Cấp quyền quản lý"
                    title="Cấp quyền quản lý"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                  </button>
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
          </CollapsibleContent>
        </div>
      </Collapsible>

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
              <Label className="text-xs">Ngày chốt công</Label>
              <Input
                className="mt-1 rounded-xl"
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                value={editing?.attendance_cutoff_day || 31}
                onChange={(e) =>
                  setEditing({ ...editing, attendance_cutoff_day: Number(e.target.value) })
                }
              />
              <div className="mt-1 text-[11px] text-muted-foreground">
                Ví dụ: chốt ngày 25 thì kỳ công bắt đầu từ ngày 26 tháng trước đến ngày 25 tháng
                này.
              </div>
            </div>
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

      <FactoryManagersDialog
        factoryId={managingFactory?.id || null}
        factoryName={managingFactory?.name || ""}
        open={!!managingFactory}
        onOpenChange={(open) => !open && setManagingFactory(null)}
      />

      <Collapsible open={areasOpen} onOpenChange={setAreasOpen}>
        <div className="rounded-2xl border border-border/70 bg-card p-3 shadow-soft">
          <div className="flex items-center justify-between gap-2">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                aria-label="Thu gọn hoặc mở rộng danh sách khu vực"
              >
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${areasOpen ? "rotate-0" : "-rotate-90"}`}
                />
                <h2 className="text-sm font-semibold">
                  Khu vực <span className="text-muted-foreground">({areas.length})</span>
                </h2>
              </button>
            </CollapsibleTrigger>
            <button
              onClick={() => setEditingArea({})}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-soft active:scale-95"
              aria-label="Thêm khu vực"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <CollapsibleContent className="mt-3 space-y-3">
            {areasLoading && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Đang tải khu vực...
              </div>
            )}
            {!areasLoading && areas.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border bg-card/50 py-10 text-center text-sm text-muted-foreground">
                Chưa có khu vực. Bấm nút + để thêm.
              </div>
            )}
            {areas.map((area) => (
              <div
                key={area.id}
                className="list-card border-l-[color:var(--status-success)] flex items-start gap-3"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <MapPin className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{area.name}</div>
                  {area.note && (
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{area.note}</div>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setEditingArea(area)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                    aria-label="Sửa khu vực"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => removeArea(area.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10"
                    aria-label="Xoá khu vực"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </CollapsibleContent>
        </div>
      </Collapsible>

      <Dialog open={!!editingArea} onOpenChange={(o) => !o && setEditingArea(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editingArea?.id ? "Sửa khu vực" : "Thêm khu vực"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field
              label="Tên khu vực *"
              value={editingArea?.name || ""}
              onChange={(v) => setEditingArea({ ...editingArea, name: v })}
            />
            <div>
              <Label className="text-xs">Ghi chú</Label>
              <Textarea
                className="mt-1 rounded-xl"
                rows={3}
                value={editingArea?.note || ""}
                onChange={(e) => setEditingArea({ ...editingArea, note: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingArea(null)} className="rounded-xl">
              Huỷ
            </Button>
            <Button onClick={saveArea} className="rounded-xl">
              <Save className="h-4 w-4" /> Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Collapsible open={mainHousesOpen} onOpenChange={setMainHousesOpen}>
        <div className="rounded-2xl border border-border/70 bg-card p-3 shadow-soft">
          <div className="flex items-center justify-between gap-2">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                aria-label="Thu gọn hoặc mở rộng danh sách nhà chính"
              >
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${mainHousesOpen ? "rotate-0" : "-rotate-90"}`}
                />
                <h2 className="text-sm font-semibold">
                  Nhà chính <span className="text-muted-foreground">({mainHouses.length})</span>
                </h2>
              </button>
            </CollapsibleTrigger>
            <button
              onClick={() => setEditingMainHouse({})}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-soft active:scale-95"
              aria-label="Thêm nhà chính"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <CollapsibleContent className="mt-3 space-y-3">
            {mainHousesLoading && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Đang tải nhà chính...
              </div>
            )}
            {!mainHousesLoading && mainHouses.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border bg-card/50 py-10 text-center text-sm text-muted-foreground">
                Chưa có nhà chính. Bấm nút + để thêm.
              </div>
            )}
            {mainHouses.map((house) => (
              <div
                key={house.id}
                className="list-card border-l-[color:var(--status-warning)] flex items-start gap-3"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Home className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{house.name}</div>
                  {house.address && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(house.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="mt-0.5 block text-[11px] text-muted-foreground hover:text-primary hover:underline"
                    >
                      📍 {house.address}
                    </a>
                  )}
                  {house.hotline && (
                    <div className="text-[11px] text-muted-foreground">📞 {house.hotline}</div>
                  )}
                  {house.note && (
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{house.note}</div>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setEditingMainHouse(house)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                    aria-label="Sửa nhà chính"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => removeMainHouse(house.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10"
                    aria-label="Xoá nhà chính"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </CollapsibleContent>
        </div>
      </Collapsible>

      <Dialog open={!!editingMainHouse} onOpenChange={(o) => !o && setEditingMainHouse(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editingMainHouse?.id ? "Sửa nhà chính" : "Thêm nhà chính"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field
              label="Tên nhà chính *"
              value={editingMainHouse?.name || ""}
              onChange={(v) => setEditingMainHouse({ ...editingMainHouse, name: v })}
            />
            <Field
              label="Địa chỉ"
              value={editingMainHouse?.address || ""}
              onChange={(v) => setEditingMainHouse({ ...editingMainHouse, address: v })}
            />
            <Field
              label="Hotline"
              value={editingMainHouse?.hotline || ""}
              onChange={(v) => setEditingMainHouse({ ...editingMainHouse, hotline: v })}
            />
            <div>
              <Label className="text-xs">Ghi chú</Label>
              <Textarea
                className="mt-1 rounded-xl"
                rows={3}
                value={editingMainHouse?.note || ""}
                onChange={(e) => setEditingMainHouse({ ...editingMainHouse, note: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingMainHouse(null)}
              className="rounded-xl"
            >
              Huỷ
            </Button>
            <Button onClick={saveMainHouse} className="rounded-xl">
              <Save className="h-4 w-4" /> Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
