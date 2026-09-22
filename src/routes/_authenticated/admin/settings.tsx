import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { pb, dataUrlToFile, fileUrl, type UserRecord } from "@/lib/pocketbase";
import { useAppSettings } from "@/lib/app-settings";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import { createStaffActionLog } from "@/lib/staff-log";
import { formatMoneyInput, parseMoneyInput } from "@/lib/money";
import { useQueryClient } from "@tanstack/react-query";
import { AppHeader } from "@/components/layout/BottomNav";
import { PushNotificationSettingsCard } from "@/components/layout/PushNotificationSettingsCard";
import { InstallAppGuideSection } from "@/components/settings/InstallAppGuideSection";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { DataLoadingState } from "@/components/ui/data-loading-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { toast } from "@/lib/toast";
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
  Search,
  Wallet,
  Ban,
  CircleX,
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
        <PushNotificationSettingsCard />
        <Tabs defaultValue="company" className="w-full">
          <TabsList className="grid w-full grid-cols-3 rounded-2xl">
            <TabsTrigger value="company" className="rounded-xl text-xs">
              <Building2 className="mr-1 h-4 w-4" /> Công ty
            </TabsTrigger>
            <TabsTrigger value="factories" className="rounded-xl text-xs">
              <Factory className="mr-1 h-4 w-4" /> Nhà máy
            </TabsTrigger>
            <TabsTrigger value="app" className="rounded-xl text-xs">
              <Smartphone className="mr-1 h-4 w-4" /> Cài App
            </TabsTrigger>
          </TabsList>
          <TabsContent value="company" className="mt-4">
            <CompanyTab />
          </TabsContent>
          <TabsContent value="factories" className="mt-4">
            <FactoriesTab />
          </TabsContent>
          <TabsContent value="app" className="mt-4">
            <InstallAppGuideSection />
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
      advance_limit: settings.advance_limit || 0,
      advance_rules: settings.advance_rules || "",
      staff_employment_factory_scope: settings.staff_employment_factory_scope || "assigned",
    });
    setLogoPreview(logoUrl);
  }, [logoUrl, settings]);

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
      const { saveAppSetting } = await import("@/lib/app-settings");

      // Lưu từng setting riêng lẻ
      const savePromises: Promise<void>[] = [];

      // Lưu các trường text
      for (const [key, value] of Object.entries(form)) {
        if (key === "install_guide_images") continue;

        if (key === "advance_limit") {
          const parsed = parseMoneyInput(value as string);
          savePromises.push(saveAppSetting(key, parsed));
        } else if (value !== undefined && value !== null) {
          savePromises.push(saveAppSetting(key, value));
        }
      }

      // Lưu logo nếu có
      if (logoFile) {
        savePromises.push(saveAppSetting("logo", "", logoFile));
      }

      // Xử lý install_guide_images
      if (installGuideFiles.length > 0 || removedInstallGuideImages.length > 0) {
        // Lấy record hiện có của install_guide_images
        const existing = await pb.collection("app_settings").getFullList({
          filter: `key = "install_guide_images"`,
        });

        const fd = new FormData();
        fd.append("key", "install_guide_images");
        fd.append("value", "[]");
        fd.append("data_type", "json");

        for (const rm of removedInstallGuideImages) {
          fd.append("install_guide_images-", rm);
        }
        for (const f of installGuideFiles) {
          fd.append("install_guide_images", f);
        }

        if (existing.length > 0) {
          savePromises.push(pb.collection("app_settings").update(existing[0].id, fd));
        } else {
          savePromises.push(pb.collection("app_settings").create(fd));
        }
      }

      await Promise.all(savePromises);

      toast.success("Đã lưu thông tin công ty");
      qc.invalidateQueries({ queryKey: ["app_settings"] });
      refetch();
      setInstallGuideFiles([]);
      setRemovedInstallGuideImages([]);
    } catch (e: any) {
      console.error("Save error:", e);
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
        <Label className="text-xs">Nội quy Ứng lương</Label>
        <Textarea
          className="mt-1 rounded-xl"
          rows={5}
          placeholder="Nhập nội quy, điều kiện và lưu ý khi Ứng lương..."
          value={form.advance_rules || ""}
          onChange={(e) => setForm({ ...form, advance_rules: e.target.value })}
        />
      </div>

      <AdvanceBlockedUsersSection />

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
          <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed bg-white text-muted-foreground">
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

/* ───────── ADVANCE BLOCKED USERS ───────── */

function AdvanceBlockedUsersSection() {
  const { data: settings } = useAppSettings();
  const qc = useQueryClient();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedSearch(searchQuery);
  const [searchResults, setSearchResults] = useState<UserRecord[]>([]);
  const [searching, setSearching] = useState(false);

  const blockedUserIds = settings?.advance_blocked_users || [];

  useEffect(() => {
    if (!blockedUserIds.length) {
      setUsers([]);
      return;
    }
    let active = true;
    setLoading(true);
    Promise.all(
      blockedUserIds.map((id) =>
        pb
          .collection("users")
          .getOne<UserRecord>(id)
          .catch(() => null),
      ),
    )
      .then((results) => {
        if (active) setUsers(results.filter((u): u is UserRecord => u !== null));
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [blockedUserIds]);

  useEffect(() => {
    if (!debouncedSearch.trim()) {
      setSearchResults([]);
      return;
    }
    let active = true;
    setSearching(true);
    pb.collection("users")
      .getList<UserRecord>(1, 20, {
        filter: `(full_name~"${debouncedSearch}" || phone~"${debouncedSearch}" || email~"${debouncedSearch}") && role!="admin"`,
        sort: "-created",
      })
      .then((res) => {
        if (active) setSearchResults(res.items);
      })
      .catch(() => {})
      .finally(() => active && setSearching(false));
    return () => {
      active = false;
    };
  }, [debouncedSearch]);

  const addBlockedUser = async (userId: string) => {
    if (blockedUserIds.includes(userId)) {
      toast.error("User đã có trong danh sách chặn");
      return;
    }
    setSaving(true);
    try {
      const newList = [...blockedUserIds, userId];
      const saved = settings?.id
        ? await pb.collection("app_settings").update(settings.id, {
            advance_blocked_users: newList,
          })
        : await pb.collection("app_settings").create({
            advance_blocked_users: newList,
          });
      qc.setQueryData(["app_settings"], (current: any) => ({
        ...current,
        ...saved,
      }));
      toast.success("Đã thêm vào danh sách chặn");
      setSearchQuery("");
      setSearchResults([]);
    } catch (error: unknown) {
      toast.error((error as any)?.message || "Lỗi thêm user vào danh sách chặn");
    } finally {
      setSaving(false);
    }
  };

  const removeBlockedUser = async (userId: string) => {
    setSaving(true);
    try {
      const newList = blockedUserIds.filter((id) => id !== userId);
      const saved = await pb.collection("app_settings").update(settings!.id!, {
        advance_blocked_users: newList,
      });
      qc.setQueryData(["app_settings"], (current: any) => ({
        ...current,
        ...saved,
      }));
      toast.success("Đã gỡ khỏi danh sách chặn");
    } catch (error: unknown) {
      toast.error((error as any)?.message || "Lỗi gỡ user khỏi danh sách chặn");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
      <div className="flex items-start gap-2">
        <Ban className="mt-0.5 h-5 w-5 text-amber-600" />
        <div className="flex-1">
          <div className="text-sm font-semibold text-amber-900">
            Danh sách chặn báo ứng ({users.length})
          </div>
          <div className="mt-0.5 text-xs text-amber-700">
            User trong danh sách này không thể tạo yêu cầu ứng lương mới
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-amber-900">Tìm user để chặn</Label>
        <Input
          placeholder="Tìm theo tên, SĐT, email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="rounded-xl border-amber-200"
        />
        {searching && <div className="text-xs text-muted-foreground">Đang tìm...</div>}
        {searchResults.length > 0 && (
          <div className="space-y-1 rounded-xl border border-amber-200 bg-white p-2">
            {searchResults
              .filter((u) => !blockedUserIds.includes(u.id))
              .map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between rounded-lg p-2 hover:bg-amber-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{u.full_name || "Không tên"}</div>
                    <div className="text-xs text-muted-foreground">
                      {u.phone || u.email || u.username}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-2 h-7 rounded-lg border-amber-300 text-xs"
                    onClick={() => addBlockedUser(u.id)}
                    disabled={saving}
                  >
                    <Ban className="mr-1 h-3 w-3" /> Chặn
                  </Button>
                </div>
              ))}
          </div>
        )}
      </div>

      {loading && <div className="text-xs text-muted-foreground">Đang tải danh sách...</div>}

      {users.length > 0 && (
        <div className="space-y-1 rounded-xl border border-amber-200 bg-white p-2">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between rounded-lg bg-amber-50 p-2"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-amber-900">{u.full_name || "Không tên"}</div>
                <div className="text-xs text-amber-700">{u.phone || u.email || u.username}</div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="ml-2 h-7 rounded-lg text-xs text-amber-700 hover:bg-amber-100 hover:text-amber-900"
                onClick={() => removeBlockedUser(u.id)}
                disabled={saving}
              >
                <CircleX className="mr-1 h-3 w-3" /> Gỡ
              </Button>
            </div>
          ))}
        </div>
      )}

      {!loading && users.length === 0 && (
        <div className="rounded-xl border border-dashed border-amber-300 bg-white p-4 text-center text-xs text-amber-600">
          Chưa có user nào bị chặn báo ứng
        </div>
      )}
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
  advance_limit?: number;
  status?: string;
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
  status?: "active" | "inactive";
}

function FactoriesTab() {
  const currentUser = pb.authStore.record as UserRecord | null;
  const { data: appSettings } = useAppSettings();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<Factory[]>([]);
  const [areas, setAreas] = useState<RecruitmentArea[]>([]);
  const [mainHouses, setMainHouses] = useState<MainHouse[]>([]);
  const [editing, setEditing] = useState<Partial<Factory> | null>(null);
  const [editingArea, setEditingArea] = useState<Partial<RecruitmentArea> | null>(null);
  const [editingMainHouse, setEditingMainHouse] = useState<Partial<MainHouse> | null>(null);
  const [loading, setLoading] = useState(true);
  const [areasLoading, setAreasLoading] = useState(true);
  const [mainHousesLoading, setMainHousesLoading] = useState(true);
  const [factoriesOpen, setFactoriesOpen] = useState(true);
  const [areasOpen, setAreasOpen] = useState(true);
  const [mainHousesOpen, setMainHousesOpen] = useState(true);
  const [managingFactory, setManagingFactory] = useState<Factory | null>(null);
  const [factorySearch, setFactorySearch] = useState("");
  const [areaSearch, setAreaSearch] = useState("");
  const [mainHouseSearch, setMainHouseSearch] = useState("");
  const debouncedFactorySearch = useDebouncedSearch(factorySearch);
  const debouncedAreaSearch = useDebouncedSearch(areaSearch);
  const debouncedMainHouseSearch = useDebouncedSearch(mainHouseSearch);
  const [bulkAdvanceLimit, setBulkAdvanceLimit] = useState("");
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [editingAdvanceFactory, setEditingAdvanceFactory] = useState<Factory | null>(null);
  const [advanceLimitText, setAdvanceLimitText] = useState("");
  const [advanceSaving, setAdvanceSaving] = useState(false);
  const [allowAfterLeaveSaving, setAllowAfterLeaveSaving] = useState(false);
  const [allowAfterLeavePending, setAllowAfterLeavePending] = useState(false);

  const filteredFactories = items.filter((f) => {
    if (!debouncedFactorySearch.trim()) return true;
    const q = debouncedFactorySearch.toLowerCase();
    return (
      f.name.toLowerCase().includes(q) ||
      (f.address || "").toLowerCase().includes(q) ||
      (f.hotline || "").toLowerCase().includes(q)
    );
  });

  const filteredAreas = areas.filter((a) => {
    if (!debouncedAreaSearch.trim()) return true;
    const q = debouncedAreaSearch.toLowerCase();
    return a.name.toLowerCase().includes(q) || (a.note || "").toLowerCase().includes(q);
  });

  const filteredMainHouses = mainHouses.filter((h) => {
    if (!debouncedMainHouseSearch.trim()) return true;
    const q = debouncedMainHouseSearch.toLowerCase();
    return (
      h.name.toLowerCase().includes(q) ||
      (h.address || "").toLowerCase().includes(q) ||
      (h.hotline || "").toLowerCase().includes(q)
    );
  });

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
      const res = await pb.collection("recruitment_entities").getList(1, 300, { sort: "name" });
      setMainHouses(res.items as any);
    } catch (e: any) {
      toast.error(
        e?.message ||
          "Lỗi tải danh sách Nhà chính & Đối tác. Hãy cấu hình collection 'recruitment_entities'.",
      );
    } finally {
      setMainHousesLoading(false);
    }
  };

  useEffect(() => {
    loadFactories();
    loadAreas();
    loadMainHouses();
  }, []);

  useEffect(() => {
    setAllowAfterLeaveSaving(Boolean(appSettings.allow_advance_after_leave));
  }, [appSettings.allow_advance_after_leave]);

  const save = async () => {
    if (!editing?.name?.trim()) {
      toast.error("Tên nhà máy bắt buộc");
      return;
    }
    const duplicate = items.find(
      (f) => f.name.toLowerCase() === editing.name!.trim().toLowerCase() && f.id !== editing.id,
    );
    if (duplicate) {
      toast.error(`Nhà máy "${duplicate.name}" đã tồn tại`);
      return;
    }
    try {
      const payload = {
        name: editing.name,
        address: editing.address || "",
        hotline: editing.hotline || "",
        note: editing.note || "",
        attendance_cutoff_day: Number(editing.attendance_cutoff_day) || 31,
        advance_limit: Math.max(0, Number(editing.advance_limit) || 0),
        status: editing.status || "active",
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

  const saveAllowAfterLeave = async (checked: boolean) => {
    setAllowAfterLeaveSaving(checked);
    setAllowAfterLeavePending(true);
    try {
      if (appSettings.id) {
        await pb.collection("app_settings").update(appSettings.id, {
          allow_advance_after_leave: checked,
        });
      } else {
        await pb.collection("app_settings").create({
          allow_advance_after_leave: checked,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["app_settings"] });
      toast.success(
        checked ? "Đã cho phép báo ứng khi NLĐ đã nghỉ" : "Đã tắt báo ứng khi NLĐ đã nghỉ",
      );
    } catch (e: any) {
      setAllowAfterLeaveSaving(!checked);
      toast.error(e?.message || "Không thể lưu cài đặt báo ứng sau nghỉ");
    } finally {
      setAllowAfterLeavePending(false);
    }
  };

  const openAdvanceEditor = (factory: Factory) => {
    setEditingAdvanceFactory(factory);
    setAdvanceLimitText(formatMoneyInput(String(factory.advance_limit || 0)));
  };

  const saveAdvanceLimit = async () => {
    if (!editingAdvanceFactory) return;
    const advanceLimit = Math.max(0, parseMoneyInput(advanceLimitText));
    setAdvanceSaving(true);
    try {
      const before = items.find((item) => item.id === editingAdvanceFactory.id);
      const status = editingAdvanceFactory.status === "inactive" ? "inactive" : "active";
      await pb.collection("factories").update(editingAdvanceFactory.id, {
        advance_limit: advanceLimit,
        status,
      });
      await createStaffActionLog({
        actor: currentUser,
        targetCollection: "factories",
        targetRecord: editingAdvanceFactory.id,
        action: "update",
        before,
        after: { advance_limit: advanceLimit, status },
        note: "Admin cập nhật hạn mức ứng tiền theo nhà máy",
      });
      setItems((current) =>
        current.map((item) =>
          item.id === editingAdvanceFactory.id
            ? { ...item, advance_limit: advanceLimit, status }
            : item,
        ),
      );
      setEditingAdvanceFactory(null);
      toast.success("Đã lưu hạn mức ứng tiền");
    } catch (e: any) {
      toast.error(e?.message || "Không thể lưu hạn mức ứng tiền");
    } finally {
      setAdvanceSaving(false);
    }
  };

  const applyAdvanceLimitToAll = async () => {
    const advanceLimit = Math.max(0, parseMoneyInput(bulkAdvanceLimit));
    if (!items.length) {
      toast.warning("Chưa có nhà máy để áp dụng");
      setBulkConfirmOpen(false);
      return;
    }
    setBulkSaving(true);
    try {
      for (const factory of items) {
        const before = factory;
        const status = factory.status === "inactive" ? "inactive" : "active";
        await pb.collection("factories").update(factory.id, {
          advance_limit: advanceLimit,
          status,
        });
        await createStaffActionLog({
          actor: currentUser,
          targetCollection: "factories",
          targetRecord: factory.id,
          action: "update",
          before,
          after: { advance_limit: advanceLimit, status },
          note: "Admin áp dụng đồng loạt hạn mức ứng tiền cho toàn bộ nhà máy",
        });
      }
      setItems((current) =>
        current.map((factory) => ({
          ...factory,
          advance_limit: advanceLimit,
          status: factory.status === "inactive" ? "inactive" : "active",
        })),
      );
      setBulkConfirmOpen(false);
      toast.success(
        `Đã áp dụng ${advanceLimit.toLocaleString("vi-VN")} đ cho ${items.length} nhà máy`,
      );
    } catch (e: any) {
      toast.error(e?.message || "Không thể áp dụng hạn mức cho toàn bộ nhà máy");
      loadFactories();
    } finally {
      setBulkSaving(false);
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
      toast.error("Tên đơn vị bắt buộc");
      return;
    }
    const duplicate = mainHouses.find(
      (h) => h.name.toLowerCase() === name.toLowerCase() && h.id !== editingMainHouse?.id,
    );
    if (duplicate) {
      toast.error(`Đơn vị "${duplicate.name}" đã tồn tại`);
      return;
    }
    try {
      const payload = {
        name,
        address: editingMainHouse?.address || "",
        hotline: editingMainHouse?.hotline || "",
        note: editingMainHouse?.note || "",
        status: editingMainHouse?.status || "active",
      };
      if (editingMainHouse?.id) {
        const before = mainHouses.find((m) => m.id === editingMainHouse.id);
        await pb.collection("recruitment_entities").update(editingMainHouse.id, payload);
        await createStaffActionLog({
          actor: currentUser,
          targetCollection: "recruitment_entities",
          targetRecord: editingMainHouse.id,
          action: "update",
          before,
          after: payload,
          note: "Admin cập nhật đơn vị Nhà chính & Đối tác",
        });
      } else {
        const created = await pb.collection("recruitment_entities").create(payload);
        await createStaffActionLog({
          actor: currentUser,
          targetCollection: "recruitment_entities",
          targetRecord: created.id,
          action: "create",
          after: payload,
          note: "Admin tạo đơn vị Nhà chính & Đối tác",
        });
      }
      toast.success("Đã lưu đơn vị");
      setEditingMainHouse(null);
      loadMainHouses();
    } catch (e: any) {
      toast.error(e?.message || "Lỗi lưu đơn vị");
    }
  };

  const removeMainHouse = async (id: string) => {
    if (!confirm("Xoá đơn vị này?")) return;
    try {
      const before = mainHouses.find((m) => m.id === id);
      await pb.collection("recruitment_entities").delete(id);
      await createStaffActionLog({
        actor: currentUser,
        targetCollection: "recruitment_entities",
        targetRecord: id,
        action: "delete",
        before,
        note: "Admin xoá đơn vị Nhà chính & Đối tác",
      });
      toast.success("Đã xoá đơn vị");
      loadMainHouses();
    } catch (e: any) {
      toast.error(e?.message || "Lỗi xoá đơn vị");
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
            {items.length > 3 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="rounded-xl pl-9 text-xs"
                  placeholder="Tìm nhà máy..."
                  value={factorySearch}
                  onChange={(e) => setFactorySearch(e.target.value)}
                />
              </div>
            )}
            {loading && items.length === 0 ? (
              <DataLoadingState variant="list" label="Đang tải danh sách nhà máy..." rows={3} />
            ) : loading ? (
              <DataLoadingState variant="inline" label="Đang cập nhật danh sách nhà máy..." />
            ) : null}
            {!loading && items.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border bg-card/50 py-10 text-center text-sm text-muted-foreground">
                Chưa có nhà máy. Bấm nút + để thêm.
              </div>
            )}
            {!loading && items.length > 0 && filteredFactories.length === 0 && (
              <div className="py-4 text-center text-xs text-muted-foreground">
                Không tìm thấy nhà máy phù hợp
              </div>
            )}
            {filteredFactories.map((f) => (
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
                      className="mt-0.5 block truncate text-[11px] text-muted-foreground hover:text-primary hover:underline"
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
            {areas.length > 3 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="rounded-xl pl-9 text-xs"
                  placeholder="Tìm khu vực..."
                  value={areaSearch}
                  onChange={(e) => setAreaSearch(e.target.value)}
                />
              </div>
            )}
            {areasLoading && areas.length === 0 ? (
              <DataLoadingState variant="list" label="Đang tải khu vực tuyển dụng..." rows={3} />
            ) : areasLoading ? (
              <DataLoadingState variant="inline" label="Đang cập nhật khu vực tuyển dụng..." />
            ) : null}
            {!areasLoading && areas.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border bg-card/50 py-10 text-center text-sm text-muted-foreground">
                Chưa có khu vực. Bấm nút + để thêm.
              </div>
            )}
            {!areasLoading && areas.length > 0 && filteredAreas.length === 0 && (
              <div className="py-4 text-center text-xs text-muted-foreground">
                Không tìm thấy khu vực phù hợp
              </div>
            )}
            {filteredAreas.map((area) => (
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
    </div>
  );
}
