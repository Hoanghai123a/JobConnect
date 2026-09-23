import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { pb } from "@/lib/pocketbase";
import { useAuth } from "@/lib/auth";
import { usePwaInstallPrompt } from "@/lib/pwa-install";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import { PageContainer } from "@/components/layout/PageContainer";
import { IosInstallGuideDialog } from "@/components/layout/IosInstallGuideDialog";
import { GuideDocumentsTab } from "@/components/guides/GuideDocumentsTab";
import { FilterBar } from "@/components/ui/filter-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { DataLoadingState } from "@/components/ui/data-loading-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/lib/toast";
import {
  AlertTriangle,
  Banknote,
  BookOpen,
  Briefcase,
  Calendar,
  Clock,
  Download,
  Pencil,
  Plus,
  Smartphone,
  Trash2,
  Send,
  FileText,
  FolderOpen,
  GraduationCap,
  HelpCircle,
  Lightbulb,
  Mail,
  Map as MapIcon,
  Phone,
  ShieldCheck,
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
  Map: MapIcon,
  Mail,
  HelpCircle,
} as const;

const ICONS = Object.keys(GUIDE_ICONS) as Array<keyof typeof GUIDE_ICONS>;

interface Guide {
  id: string;
  icon: string;
  title: string;
  content: string;
  font_size: number;
  order: number;
  target_type?: string;
}

function GuidesPage() {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<"guides" | "documents">("guides");
  const [items, setItems] = useState<Guide[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Guide | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedSearch(search);
  const [reading, setReading] = useState<Guide | null>(null);
  const [installGuideOpen, setInstallGuideOpen] = useState(false);
  const { installPrompt, installApp: installPwaApp, isIos } = usePwaInstallPrompt();
  const [desktopGuideOpen, setDesktopGuideOpen] = useState(false);

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

  useEffect(() => {
    load();
  }, []);

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
    });
    setOpen(true);
  };

  const openEdit = (g: Guide) => {
    setEditing(g);
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

  const filtered = useMemo(
    () =>
      items.filter(
        (g) =>
          !debouncedSearch ||
          (g.title + " " + g.content).toLowerCase().includes(debouncedSearch.toLowerCase()),
      ),
    [items, debouncedSearch],
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
        <TabsList className="grid w-full grid-cols-2 rounded-xl">
          <TabsTrigger value="guides" className="gap-1.5">
            <BookOpen className="h-4 w-4" /> Hướng dẫn
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-1.5">
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
