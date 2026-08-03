import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { pb } from "@/lib/pocketbase";
import { useAuth } from "@/lib/auth";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { DataLoadingState } from "@/components/ui/data-loading-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { escapePb } from "@/lib/delegations";
import { cn } from "@/lib/utils";
import { BusFront, Clock3, Pencil, Phone, Plus, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/transport")({
  component: TransportPage,
});

type TransportRecord = {
  id: string;
  user?: string;
  edited_by?: string;
  carrier_name?: string;
  title: string;
  run_time?: string;
  phone: string;
  created: string;
  expand?: {
    user?: {
      full_name?: string;
      username?: string;
    };
    edited_by?: {
      full_name?: string;
      username?: string;
    };
  };
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function TransportPage() {
  const { user, isAdmin } = useAuth();
  const [items, setItems] = useState<TransportRecord[]>([]);
  const [search, setSearch] = useState("");
  const [carrierName, setCarrierName] = useState("");
  const [title, setTitle] = useState("");
  const [runTime, setRunTime] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TransportRecord | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = escapePb(search.trim());
      const res = await pb.collection("transport_contacts").getList(1, 200, {
        filter: q
          ? `(${["carrier_name", "title", "run_time", "phone"]
              .map((field) => `${field}~"${q}"`)
              .join(" || ")})`
          : "",
        sort: "-created",
        expand: "user,edited_by",
      });
      setItems(res.items as unknown as TransportRecord[]);
    } catch (error) {
      toast.error(getErrorMessage(error, "Lỗi tải danh sách nhà xe"));
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = items;

  const resetForm = () => {
    setCarrierName("");
    setTitle("");
    setRunTime("");
    setPhone("");
    setEditing(null);
  };

  const openCreateForm = () => {
    resetForm();
    setFormOpen((value) => !value);
  };

  const openEditForm = (item: TransportRecord) => {
    setEditing(item);
    setCarrierName(item.carrier_name || "");
    setTitle(item.title || "");
    setRunTime(item.run_time || "");
    setPhone(item.phone || "");
    setFormOpen(true);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      toast.error("Tiêu đề không thể để trống");
      return;
    }
    const normalizedPhone = phone.replace(/\D/g, "");
    if (!normalizedPhone) {
      toast.error("Số điện thoại nhà xe không thể để trống");
      return;
    }
    if (!/^\d{10}$/.test(normalizedPhone)) {
      toast.error("Số điện thoại nhà xe phải đúng 10 số");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        carrier_name: carrierName.trim(),
        title: title.trim(),
        run_time: runTime.trim(),
        phone: normalizedPhone,
      };
      if (editing) {
        await pb.collection("transport_contacts").update(editing.id, {
          ...payload,
          edited_by: user?.id,
        });
        toast.success("Để cập nhật thông tin nhà xe");
      } else {
        await pb.collection("transport_contacts").create({
          ...payload,
          user: user?.id,
        });
        toast.success("Để đóng góp thông tin nhà xe");
      }
      resetForm();
      setFormOpen(false);
      load();
    } catch (error) {
      toast.error(getErrorMessage(error, "Lỗi lưu thông tin nhà xe"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer title="Tìm nhà xe" subtitle="Thông tin do mọi người đóng góp">
      <Card className="rounded-2xl border-border/70 p-3 shadow-soft">
        <button
          type="button"
          onClick={openCreateForm}
          className="flex w-full items-center gap-3 rounded-xl text-left transition active:scale-[0.99]"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Plus className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Đóng góp nhà xe</div>
            <div className="text-[11px] text-muted-foreground">
              Tiêu đề và Số điện thoại là bắt buộc
            </div>
          </div>
        </button>

        {formOpen && (
          <form onSubmit={submit} className="mt-3 space-y-3 border-t border-border pt-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label>Tên nhà xe</Label>
                <span className="text-[11px] text-muted-foreground">Có thể để trống</span>
              </div>
              <Input
                value={carrierName}
                onChange={(event) => setCarrierName(event.target.value)}
                placeholder="VD: Hoàng Long"
              />
            </div>
            <div className="space-y-1">
              <Label>Tiêu đề (những nơi xe đi qua)</Label>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="VD: Lào Cai - Phú Thọ - Hà Nội"
              />
            </div>
            <div className="space-y-1">
              <Label>Thời gian chạy</Label>
              <Textarea
                rows={3}
                value={runTime}
                onChange={(event) => setRunTime(event.target.value)}
                placeholder="VD: 7:30 từ Hà Nội, 17:30 từ Lào Cai"
              />
            </div>
            <div className="space-y-1">
              <Label>Số điện thoại nhà xe</Label>
              <Input
                value={phone}
                onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))}
                inputMode="numeric"
                maxLength={10}
                pattern="\d{10}"
                placeholder="VD: 0987654321"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  resetForm();
                  setFormOpen(false);
                }}
              >
                Huỷ
              </Button>
              <Button type="submit" disabled={saving}>
                <Plus className="h-4 w-4" />{" "}
                {saving ? "Đang lưu..." : editing ? "Cập nhật" : "Đăng ký"}
              </Button>
            </div>
          </form>
        )}
      </Card>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="rounded-full pl-9"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="VD: Hoàng Long hoặc Lào Cai - Hà Nội"
        />
      </div>

      <div className="flex items-center justify-between px-1">
        <div className="text-sm font-semibold">Danh sách nhà xe</div>
        <div className="text-xs text-muted-foreground">
          {filtered.length}/{items.length}
        </div>
      </div>

      {loading && items.length > 0 && (
        <DataLoadingState variant="inline" label="Đang cập nhật danh sách nhà xe..." />
      )}
      {loading && items.length === 0 ? (
        <DataLoadingState variant="list" label="Đang tải danh sách nhà xe..." rows={3} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={BusFront}
          title="Chưa có thông tin phù hợp"
          description="Bạn có thể đăng ký tuyến nhà xe mới bằng biểu mẫu phía trên."
        />
      ) : (
        filtered.map((item) => {
          const author = item.expand?.user;
          const editor = item.expand?.edited_by;
          return (
            <div
              key={item.id}
              className={cn("list-card border-l-[color:var(--status-info)] space-y-2")}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <BusFront className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    {item.carrier_name?.trim() || item.title}
                  </div>
                  {item.carrier_name?.trim() && (
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {item.title}
                    </div>
                  )}
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {author?.full_name || author?.username || "Người đóng góp"}
                    {editor
                      ? ` . Admin sửa: ${editor.full_name || editor.username || "Admin"}`
                      : ""}
                  </div>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => openEditForm(item)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                    aria-label="Sửa thông tin nhà xe"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </div>

              {item.run_time && (
                <div className="flex gap-2 rounded-xl bg-muted/50 p-2 text-sm">
                  <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="whitespace-pre-wrap leading-relaxed">{item.run_time}</div>
                </div>
              )}

              <a
                href={`tel:${item.phone}`}
                className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-primary"
              >
                <Phone className="h-4 w-4" />
                {item.phone}
              </a>
            </div>
          );
        })
      )}
    </PageContainer>
  );
}
