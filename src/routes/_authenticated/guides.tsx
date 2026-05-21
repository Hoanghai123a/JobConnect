import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { pb } from "@/lib/pocketbase";
import { useAuth } from "@/lib/auth";
import { PageContainer } from "@/components/layout/PageContainer";
import { FilterBar } from "@/components/ui/filter-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusChip } from "@/components/ui/status-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import * as Icons from "lucide-react";
import { BookOpen, Pencil, Plus, Trash2, Send, Users, Factory as FactoryIcon, User as UserIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/guides")({
  component: GuidesPage,
});

const ICONS = [
  "BookOpen", "Lightbulb", "FileText", "ShieldCheck", "Phone",
  "Briefcase", "GraduationCap", "Calendar", "Clock", "Banknote",
  "AlertTriangle", "Users", "Map", "Mail", "HelpCircle",
];

type TargetType = "all" | "factories" | "users";

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

function GuidesPage() {
  const { user, isAdmin } = useAuth();
  const [items, setItems] = useState<Guide[]>([]);
  const [factories, setFactories] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [editing, setEditing] = useState<Guide | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [reading, setReading] = useState<Guide | null>(null);

  const load = async () => {
    try {
      const res = await pb.collection("guides").getFullList({ sort: "order,created" });
      setItems(res as any);
    } catch (e: any) { toast.error(e?.message || "Lỗi tải hướng dẫn"); }
  };
  const loadAdminRefs = async () => {
    if (!isAdmin) return;
    try {
      const f = await pb.collection("factories").getFullList({ sort: "name" });
      setFactories(f as any);
    } catch { /* optional */ }
    try {
      const u = await pb.collection("users").getFullList({ sort: "full_name", filter: "approved=true" });
      setUsers(u as any);
    } catch { /* optional */ }
  };
  useEffect(() => { load(); loadAdminRefs(); /* eslint-disable-next-line */ }, [isAdmin]);

  const openNew = () => {
    setEditing({
      id: "", icon: "BookOpen", title: "", content: "",
      font_size: 14, order: items.length,
      target_type: "all", target_factories: [], target_users: [],
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
    if (!editing.title.trim()) { toast.error("Nhập tiêu đề"); return; }
    try {
      const payload: any = {
        icon: editing.icon,
        title: editing.title,
        content: editing.content,
        font_size: editing.font_size,
        order: editing.order,
        target_type: editing.target_type || "all",
        target_factories: editing.target_type === "factories" ? (editing.target_factories || []) : [],
        target_users: editing.target_type === "users" ? (editing.target_users || []) : [],
      };
      if (editing.id) await pb.collection("guides").update(editing.id, payload);
      else await pb.collection("guides").create(payload);
      toast.success(editing.id ? "Đã lưu" : "Đã gửi hướng dẫn");
      setOpen(false);
      load();
    } catch (e: any) { toast.error(e?.message || "Lỗi"); }
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
        return list.some((f) => f === user?.company || f === (user as any)?.factory);
      }
      if (t === "users") {
        const list = g.target_users || [];
        return list.includes(user?.id || "");
      }
      return false;
    });
  }, [items, isAdmin, user]);

  const filtered = useMemo(
    () => visible.filter(
      (g) => !search || (g.title + " " + g.content).toLowerCase().includes(search.toLowerCase()),
    ),
    [visible, search],
  );

  return (
    <PageContainer
      title="Hướng dẫn"
      subtitle={`${filtered.length} mục`}
      right={
        isAdmin && (
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
      <FilterBar search={search} onSearchChange={setSearch} placeholder="Tìm hướng dẫn…" />

      {filtered.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Chưa có hướng dẫn"
          description={search ? "Không tìm thấy kết quả." : isAdmin ? "Bấm + để gửi hướng dẫn." : "Hướng dẫn sẽ xuất hiện ở đây."}
        />
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {filtered.map((g) => {
            const Icon = (Icons as any)[g.icon] || BookOpen;
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
                    <div className="line-clamp-2 text-sm font-semibold leading-tight">{g.title}</div>
                    <div className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                      {g.content}
                    </div>
                    {isAdmin && (
                      <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                        <TIcon className="h-3 w-3" /> {TARGET_META[t].label}
                        {t === "factories" && g.target_factories?.length ? ` (${g.target_factories.length})` : ""}
                        {t === "users" && g.target_users?.length ? ` (${g.target_users.length})` : ""}
                      </div>
                    )}
                  </div>
                </button>
                {isAdmin && (
                  <div className="absolute right-1.5 top-1.5 flex gap-0.5">
                    <button onClick={() => openEdit(g)}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-card/80 text-muted-foreground backdrop-blur hover:bg-muted"
                      aria-label="Sửa">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => remove(g.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-card/80 text-destructive backdrop-blur hover:bg-destructive/10"
                      aria-label="Xoá">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Reader */}
      <Dialog open={!!reading} onOpenChange={(o) => !o && setReading(null)}>
        <DialogContent className="max-h-[88dvh] overflow-y-auto">
          {reading && (
            <>
              <DialogHeader><DialogTitle>{reading.title}</DialogTitle></DialogHeader>
              <div className="whitespace-pre-wrap text-foreground/90"
                style={{ fontSize: `${reading.font_size}px`, lineHeight: 1.6 }}>
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
                <Input value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              </div>

              <div className="space-y-1">
                <Label>Icon</Label>
                <div className="grid grid-cols-6 gap-2">
                  {ICONS.map((name) => {
                    const I = (Icons as any)[name];
                    const active = editing.icon === name;
                    return (
                      <button key={name} type="button"
                        onClick={() => setEditing({ ...editing, icon: name })}
                        className={`flex aspect-square items-center justify-center rounded-xl border ${active ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}>
                        <I className="h-5 w-5" />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1">
                <Label>Nội dung</Label>
                <Textarea rows={6} value={editing.content}
                  onChange={(e) => setEditing({ ...editing, content: e.target.value })} />
              </div>

              <div className="space-y-1">
                <Label>Cỡ chữ: {editing.font_size}px</Label>
                <Slider min={12} max={24} step={1} value={[editing.font_size]}
                  onValueChange={(v) => setEditing({ ...editing, font_size: v[0] })} />
              </div>

              {/* Target audience */}
              <div className="space-y-2 rounded-xl border bg-muted/40 p-3">
                <Label className="flex items-center gap-1.5"><Send className="h-3.5 w-3.5" /> Gửi tới</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(Object.keys(TARGET_META) as TargetType[]).map((k) => {
                    const M = TARGET_META[k];
                    const active = (editing.target_type || "all") === k;
                    const I = M.icon;
                    return (
                      <button key={k} type="button"
                        onClick={() => setEditing({ ...editing, target_type: k })}
                        className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-[11px] font-medium transition ${active ? "border-primary bg-primary/10 text-primary" : "bg-card text-muted-foreground"}`}>
                        <I className="h-4 w-4" />
                        {M.label}
                      </button>
                    );
                  })}
                </div>

                {editing.target_type === "factories" && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] text-muted-foreground">Chọn nhà máy ({editing.target_factories?.length || 0})</div>
                    {factories.length === 0 ? (
                      <div className="text-[11px] text-muted-foreground">Chưa có nhà máy nào.</div>
                    ) : (
                      <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border bg-card p-2">
                        {factories.map((f) => {
                          const checked = (editing.target_factories || []).includes(f.name);
                          return (
                            <label key={f.id} className="flex items-center gap-2 text-sm">
                              <Checkbox checked={checked}
                                onCheckedChange={(c) => {
                                  const set = new Set(editing.target_factories || []);
                                  c ? set.add(f.name) : set.delete(f.name);
                                  setEditing({ ...editing, target_factories: Array.from(set) });
                                }} />
                              <span>{f.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {editing.target_type === "users" && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] text-muted-foreground">Chọn người nhận ({editing.target_users?.length || 0})</div>
                    {users.length === 0 ? (
                      <div className="text-[11px] text-muted-foreground">Chưa có user nào.</div>
                    ) : (
                      <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border bg-card p-2">
                        {users.map((u) => {
                          const checked = (editing.target_users || []).includes(u.id);
                          return (
                            <label key={u.id} className="flex items-center gap-2 text-sm">
                              <Checkbox checked={checked}
                                onCheckedChange={(c) => {
                                  const set = new Set(editing.target_users || []);
                                  c ? set.add(u.id) : set.delete(u.id);
                                  setEditing({ ...editing, target_users: Array.from(set) });
                                }} />
                              <span className="truncate">{u.full_name || u.username} <span className="text-muted-foreground">· {u.company || "—"}</span></span>
                            </label>
                          );
                        })}
                      </div>
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
                <Input type="number" value={editing.order}
                  onChange={(e) => setEditing({ ...editing, order: Number(e.target.value) })} />
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
