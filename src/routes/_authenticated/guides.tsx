import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { pb } from "@/lib/pocketbase";
import { useAuth } from "@/lib/auth";
import { usePwaInstallPrompt } from "@/lib/pwa-install";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import { normalizeUserPickerSearch } from "@/components/workforce/UserPicker";
import { PageContainer } from "@/components/layout/PageContainer";
import { IosInstallGuideDialog } from "@/components/layout/IosInstallGuideDialog";
import { GuideDocumentsTab } from "@/components/guides/GuideDocumentsTab";
import { FilterBar } from "@/components/ui/filter-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { DataLoadingState } from "@/components/ui/data-loading-state";
import { StatusChip } from "@/components/ui/status-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  fetchEmploymentHistories,
  findActiveEmploymentByUser,
  getCurrentEmploymentHistory,
} from "@/lib/employment";
import { toast } from "@/lib/toast";
import {
  AlertTriangle,
  Banknote,
  BookOpen,
  Briefcase,
  Calendar,
  ChevronDown,
  Clock,
  Download,
  Pencil,
  Plus,
  Smartphone,
  Trash2,
  Send,
  Users,
  Factory as FactoryIcon,
  FileText,
  FolderOpen,
  GraduationCap,
  HelpCircle,
  Lightbulb,
  Mail,
  Map as MapIcon,
  Phone,
  ShieldCheck,
  User as UserIcon,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/guides")({
  component: GuidesPage,
});

const GUIDE_ICONS = {
  BookOpen,
  Lightbulb,
  FileText,
  ShieldCheck,
  Phone,
  Briefcase,
  GraduationCap,
  Calendar,
  Clock,
  Banknote,
  AlertTriangle,
  Users,
  Map: MapIcon,
  Mail,
  HelpCircle,
} as const;

const ICONS = Object.keys(GUIDE_ICONS) as Array<keyof typeof GUIDE_ICONS>;

type TargetType = "all" | "factories" | "users";

type MultiSelectOption = {
  value: string;
  label: string;
  description?: string;
};

interface Guide {
  id: string;
  icon: string;
  title: string;
  content: string;
  font_size: number;
  order: number;
  target_type?: TargetType;
  target_factories?: string[];
  target_users?: string[];
}

const TARGET_META: Record<TargetType, { label: string; icon: any }> = {
  all: { label: "Tất cả", icon: Users },
  factories: { label: "Theo nhà máy", icon: FactoryIcon },
  users: { label: "Cá nhân", icon: UserIcon },
};

function MultiSelectDropdown({
  options,
  selected,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyText,
}: {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedSearch(query);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedOptions = options.filter((option) => selectedSet.has(option.value));
  const summary =
    selectedOptions.length === 0
      ? placeholder
      : selectedOptions.length <= 2
        ? selectedOptions.map((option) => option.label).join(", ")
        : `${selectedOptions.length} đã chọn`;

  const toggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(Array.from(next));
  };

  const filteredOptions = useMemo(() => {
    const keyword = normalizeUserPickerSearch(debouncedQuery);
    if (!keyword) return options;
    return options.filter((option) =>
      normalizeUserPickerSearch(`${option.label} ${option.description || ""}`).includes(keyword),
    );
  }, [debouncedQuery, options]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full justify-between gap-2 rounded-xl bg-white px-3 text-left font-normal text-slate-900"
        >
          <span className={cn("truncate", selectedOptions.length === 0 && "text-muted-foreground")}>
            {summary}
          </span>
          <ChevronDown className="h-4 w-4 flex-none text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(calc(100vw-3rem),24rem)] p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder={searchPlaceholder} value={query} onValueChange={setQuery} />
          <CommandList className="max-h-64">
            <CommandEmpty>{emptyText}</CommandEmpty>
            {filteredOptions.map((option) => {
              const checked = selectedSet.has(option.value);
              return (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.description || ""}`}
                  onSelect={() => toggle(option.value)}
                  className="items-center gap-2 py-2"
                >
                  <Checkbox checked={checked} className="pointer-events-none" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{option.label}</div>
                    {option.description && (
                      <div className="truncate text-[11px] text-muted-foreground">
                        {option.description}
                      </div>
                    )}
                  </div>
                </CommandItem>
              );
            })}
          </CommandList>
          {options.length > 0 && (
            <div className="flex items-center justify-between gap-2 border-t p-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => onChange(options.map((option) => option.value))}
              >
                Chọn tất cả
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs text-muted-foreground"
                onClick={() => onChange([])}
              >
                Bỏ chọn tất cả
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function GuidesPage() {
  const { user, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<"guides" | "documents">("guides");
  const [items, setItems] = useState<Guide[]>([]);
  const [loading, setLoading] = useState(true);
  const [factories, setFactories] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [currentFactoryName, setCurrentFactoryName] = useState("");
  const [editing, setEditing] = useState<Guide | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedSearch(search);
  const [reading, setReading] = useState<Guide | null>(null);
  const [installGuideOpen, setInstallGuideOpen] = useState(false);
  const { installPrompt, installApp: installPwaApp, isAndroid, isIos } = usePwaInstallPrompt();

  const load = async () => {
    setLoading(true);
    try {
      const res = await pb.collection("guides").getList(1, 200, { sort: "order,created" });
      setItems(res.items as any);
    } catch (e: any) {
      toast.error(e?.message || "Lỗi tải hướng dẫn");
    } finally {
      setLoading(false);
    }
  };
  const loadAdminRefs = async () => {
    if (!isAdmin) return;
    try {
      const f = await pb.collection("factories").getList(1, 300, { sort: "name" });
      setFactories(f.items as any);
    } catch {
      /* optional */
    }
    try {
      const [u, histories] = await Promise.all([
        pb.collection("users").getFullList({ sort: "-created" }),
        fetchEmploymentHistories(),
      ]);
      const historiesByUser = new Map<string, typeof histories>();
      for (const history of histories) {
        const list = historiesByUser.get(history.user) || [];
        list.push(history);
        historiesByUser.set(history.user, list);
      }
      const workerUsers = (u as any[])
        .filter((item) => item.role !== "admin")
        .map((item) => {
          const employment = getCurrentEmploymentHistory(historiesByUser.get(item.id) || []);
          return {
            ...item,
            employeeCode: employment?.employee_code || "",
            factoryName: employment?.expand?.factory?.name || "",
          };
        })
        .sort((a, b) =>
          String(a.full_name || a.username || a.phone || "").localeCompare(
            String(b.full_name || b.username || b.phone || ""),
            "vi",
          ),
        );
      setUsers(workerUsers);
    } catch (e: any) {
      setUsers([]);
      toast.error(e?.message || "Không tải được danh sách user");
    }
  };
  useEffect(() => {
    load();
    loadAdminRefs(); /* eslint-disable-next-line */
  }, [isAdmin]);

  useEffect(() => {
    if (!user?.id) {
      setCurrentFactoryName("");
      return;
    }
    let active = true;
    findActiveEmploymentByUser(user.id)
      .then((history) => {
        if (active) setCurrentFactoryName(history?.expand?.factory?.name || "");
      })
      .catch(() => {
        if (active) setCurrentFactoryName("");
      });
    return () => {
      active = false;
    };
  }, [user?.id]);

  const [desktopGuideOpen, setDesktopGuideOpen] = useState(false);

  const installApp = async () => {
    if (installPrompt) {
      const outcome = await installPwaApp();
      if (outcome === "accepted") toast.success("Đã cài app thành công");
      return;
    }
    setDesktopGuideOpen(true);
  };

  const openNew = () => {
    setEditing({
      id: "",
      icon: "BookOpen",
      title: "",
      content: "",
      font_size: 14,
      order: items.length,
      target_type: "all",
      target_factories: [],
      target_users: [],
    });
    setOpen(true);
  };
  const openEdit = (g: Guide) => {
    setEditing({
      ...g,
      target_type: g.target_type || "all",
      target_factories: g.target_factories || [],
      target_users: g.target_users || [],
    });
    setOpen(true);
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.title.trim()) {
      toast.error("Nhập tiêu đề");
      return;
    }
    try {
      const payload: any = {
        icon: editing.icon,
        title: editing.title,
        content: editing.content,
        font_size: editing.font_size,
        order: editing.order,
        target_type: editing.target_type || "all",
        target_factories: editing.target_type === "factories" ? editing.target_factories || [] : [],
        target_users: editing.target_type === "users" ? editing.target_users || [] : [],
      };
      if (editing.id) await pb.collection("guides").update(editing.id, payload);
      else await pb.collection("guides").create(payload);
      toast.success(editing.id ? "Đã lưu" : "Đã gửi hướng dẫn");
      setOpen(false);
      load();
    } catch (e: any) {
      toast.error(e?.message || "Lỗi");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Xoá mục này?")) return;
    await pb.collection("guides").delete(id);
    load();
  };

  /* Filter visible guides for current user */
  const visible = useMemo(() => {
    if (isAdmin) return items;
    return items.filter((g) => {
      const t = g.target_type || "all";
      if (t === "all") return true;
      if (t === "factories") {
        const list = g.target_factories || [];
        if (!list.length) return false;
        return list.includes(currentFactoryName);
      }
      if (t === "users") {
        const list = g.target_users || [];
        return list.includes(user?.id || "");
      }
      return false;
    });
  }, [items, isAdmin, user?.id, currentFactoryName]);

  const filtered = useMemo(
    () =>
      visible.filter(
        (g) =>
          !debouncedSearch ||
          (g.title + " " + g.content).toLowerCase().includes(debouncedSearch.toLowerCase()),
      ),
    [visible, debouncedSearch],
  );

  return (
    <PageContainer
      title="Hướng dẫn"
      subtitle={
        activeTab === "guides"
          ? loading && items.length === 0
            ? "Đang tải dữ liệu..."
            : `${filtered.length} mục`
          : "Kho tài liệu nội bộ"
      }
      right={
        isAdmin &&
        activeTab === "guides" && (
          <button
            onClick={openNew}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-soft active:scale-95"
            aria-label="Thêm hướng dẫn"
          >
            <Plus className="h-4 w-4" />
          </button>
        )
      }
    >
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as "guides" | "documents")}
        className="space-y-3"
      >
        <TabsList className="grid w-full grid-cols-2 rounded-xl desktop:grid desktop:grid-cols-2">
          <TabsTrigger value="guides" className="gap-1.5 desktop:min-w-0">
            <BookOpen className="h-4 w-4" /> Hướng dẫn
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-1.5 desktop:min-w-0">
            <FolderOpen className="h-4 w-4" /> Tài liệu
          </TabsTrigger>
        </TabsList>

        <TabsContent value="guides" className="mt-0 space-y-3">
          <div className="rounded-2xl border border-border/70 bg-card p-3 shadow-soft">
            <button
              type="button"
              onClick={() => (isIos ? setInstallGuideOpen(true) : void installApp())}
              className="flex w-full items-center gap-2 text-left"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                {isIos ? (
                  <Smartphone className="h-4.5 w-4.5" />
                ) : (
                  <Download className="h-4.5 w-4.5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-foreground">Cài ứng dụng</div>
                <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  {isIos
                    ? "Bấm Hướng dẫn để xem từng bước bằng ảnh."
                    : "Bấm Cài đặt để cài app trực tiếp vào thiết bị."}
                </div>
              </div>
              <span className="shrink-0 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
                {isIos ? "Hướng dẫn" : "Cài đặt"}
              </span>
            </button>
          </div>

          <FilterBar search={search} onSearchChange={setSearch} placeholder="Tìm hướng dẫn…" />

          {loading && items.length > 0 && (
            <DataLoadingState variant="inline" label="Đang cập nhật hướng dẫn..." />
          )}

          {loading && items.length === 0 ? (
            <DataLoadingState variant="grid" label="Đang tải hướng dẫn..." rows={4} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="Chưa có hướng dẫn"
              description={
                search
                  ? "Không tìm thấy kết quả."
                  : isAdmin
                    ? "Bấm + để gửi hướng dẫn."
                    : "Hướng dẫn sẽ xuất hiện tại đây."
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {filtered.map((g) => {
                const Icon = GUIDE_ICONS[g.icon as keyof typeof GUIDE_ICONS] || BookOpen;
                const t = (g.target_type || "all") as TargetType;
                const TIcon = TARGET_META[t].icon;
                return (
                  <div key={g.id} className="relative">
                    <button
                      onClick={() => setReading(g)}
                      className="flex h-full w-full flex-col gap-2 rounded-2xl border border-border bg-card p-3 text-left shadow-soft active:scale-[0.98] transition"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="line-clamp-2 text-sm font-semibold leading-tight">
                          {g.title}
                        </div>
                        <div className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                          {g.content}
                        </div>
                        {isAdmin && (
                          <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                            <TIcon className="h-3 w-3" /> {TARGET_META[t].label}
                            {t === "factories" && g.target_factories?.length
                              ? ` (${g.target_factories.length})`
                              : ""}
                            {t === "users" && g.target_users?.length
                              ? ` (${g.target_users.length})`
                              : ""}
                          </div>
                        )}
                      </div>
                    </button>
                    {isAdmin && (
                      <div className="absolute right-1.5 top-1.5 flex gap-0.5">
                        <button
                          onClick={() => openEdit(g)}
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-card/80 text-muted-foreground backdrop-blur hover:bg-muted"
                          aria-label="Sửa"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => remove(g.id)}
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-card/80 text-destructive backdrop-blur hover:bg-destructive/10"
                          aria-label="Xoá"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="documents" className="mt-0">
          <GuideDocumentsTab isAdmin={isAdmin} />
        </TabsContent>
      </Tabs>

      <IosInstallGuideDialog open={installGuideOpen} onOpenChange={setInstallGuideOpen} />

      <Dialog open={desktopGuideOpen} onOpenChange={setDesktopGuideOpen}>
        <DialogContent className="max-h-[88dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cài ứng dụng trên máy tính</DialogTitle>
            <DialogDescription>
              Làm theo hướng dẫn bên dưới để cài app vào máy tính.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  1
                </span>
                <span className="font-medium">Mở trang này bằng trình duyệt Chrome hoặc Edge</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  2
                </span>
                <span className="font-medium">Nhấn vào biểu tượng cài đặt trên thanh địa chỉ</span>
              </div>
              <p className="ml-8 text-xs text-muted-foreground">
                Biểu tượng hình màn hình có mũi tên (⊞) nằm ở góc phải thanh địa chỉ. Hoặc bấm dấu 3
                chấm (⋮) → "Cài đặt ứng dụng..." / "Install app..."
              </p>
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  3
                </span>
                <span className="font-medium">Bấm "Cài đặt" trong hộp thoại xuất hiện</span>
              </div>
            </div>
            <div className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
              Sau khi cài, app sẽ mở như một ứng dụng riêng trên máy tính — không cần mở trình
              duyệt.
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reader */}
      <Dialog open={!!reading} onOpenChange={(o) => !o && setReading(null)}>
        <DialogContent className="max-h-[88dvh] overflow-y-auto">
          {reading && (
            <>
              <DialogHeader>
                <DialogTitle>{reading.title}</DialogTitle>
                <DialogDescription className="sr-only">
                  Chi tiết nội dung hướng dẫn.
                </DialogDescription>
              </DialogHeader>
              <div
                className="whitespace-pre-wrap text-foreground/90"
                style={{ fontSize: `${reading.font_size}px`, lineHeight: 1.6 }}
              >
                {reading.content}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Editor */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Sửa hướng dẫn" : "Tạo & gửi hướng dẫn"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Tiêu đề</Label>
                <Input
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <Label>Icon</Label>
                <div className="grid grid-cols-6 gap-2">
                  {ICONS.map((name) => {
                    const I = GUIDE_ICONS[name];
                    const active = editing.icon === name;
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setEditing({ ...editing, icon: name })}
                        className={`flex aspect-square items-center justify-center rounded-xl border ${active ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}
                      >
                        <I className="h-5 w-5" />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1">
                <Label>Nội dung</Label>
                <Textarea
                  rows={6}
                  value={editing.content}
                  onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <Label>Cỡ chữ: {editing.font_size}px</Label>
                <Slider
                  min={12}
                  max={24}
                  step={1}
                  value={[editing.font_size]}
                  onValueChange={(v) => setEditing({ ...editing, font_size: v[0] })}
                />
              </div>

              {/* Target audience */}
              <div className="space-y-2 rounded-xl border bg-muted/40 p-3">
                <Label className="flex items-center gap-1.5">
                  <Send className="h-3.5 w-3.5" /> Gửi tới
                </Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(Object.keys(TARGET_META) as TargetType[]).map((k) => {
                    const M = TARGET_META[k];
                    const active = (editing.target_type || "all") === k;
                    const I = M.icon;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setEditing({ ...editing, target_type: k })}
                        className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-[11px] font-medium transition ${active ? "border-primary bg-primary/10 text-primary" : "bg-card text-muted-foreground"}`}
                      >
                        <I className="h-4 w-4" />
                        {M.label}
                      </button>
                    );
                  })}
                </div>

                {editing.target_type === "factories" && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] text-muted-foreground">
                      Chọn nhà máy ({editing.target_factories?.length || 0})
                    </div>
                    {factories.length === 0 ? (
                      <div className="text-[11px] text-muted-foreground">Chưa có nhà máy nào.</div>
                    ) : (
                      <MultiSelectDropdown
                        options={factories.map((f) => ({
                          value: f.name,
                          label: f.name,
                        }))}
                        selected={editing.target_factories || []}
                        onChange={(values) => setEditing({ ...editing, target_factories: values })}
                        placeholder="Chọn nhà máy"
                        searchPlaceholder="Tìm nhà máy..."
                        emptyText="Không tìm thấy nhà máy"
                      />
                    )}
                  </div>
                )}

                {editing.target_type === "users" && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] text-muted-foreground">
                      Chọn người nhận ({editing.target_users?.length || 0})
                    </div>
                    {users.length === 0 ? (
                      <div className="text-[11px] text-muted-foreground">Chưa có user nào.</div>
                    ) : (
                      <MultiSelectDropdown
                        options={users.map((u) => ({
                          value: u.id,
                          label: u.full_name || u.username || u.phone || "Chưa có tên",
                          description: `${u.factoryName || "chưa có lịch sử đi làm"}${u.employeeCode ? ` · ${u.employeeCode}` : ""}`,
                        }))}
                        selected={editing.target_users || []}
                        onChange={(values) => setEditing({ ...editing, target_users: values })}
                        placeholder="Chọn người nhận"
                        searchPlaceholder="Tìm theo tên, nhà máy..."
                        emptyText="Không tìm thấy người nhận"
                      />
                    )}
                  </div>
                )}

                {editing.target_type === "all" && (
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <StatusChip tone="success">All</StatusChip> Hiển thị cho toàn bộ người lao động.
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label>Thứ tự</Label>
                <Input
                  type="number"
                  value={editing.order}
                  onChange={(e) => setEditing({ ...editing, order: Number(e.target.value) })}
                />
              </div>

              <Button onClick={save} className="w-full">
                <Send className="h-4 w-4" /> {editing.id ? "Lưu thay đổi" : "Gửi hướng dẫn"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
