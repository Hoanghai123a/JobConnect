import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  FileType,
  FolderOpen,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { pb, fileUrl } from "@/lib/pocketbase";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { DataLoadingState } from "@/components/ui/data-loading-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const MAX_FILES = 3;
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ["pdf", "doc", "docx", "xls", "xlsx"];

interface GuideDocument {
  id: string;
  title: string;
  description?: string;
  files: string[];
  order?: number;
  created?: string;
  updated?: string;
  collectionId?: string;
  collectionName?: string;
}

type DocumentForm = {
  record: GuideDocument | null;
  title: string;
  description: string;
  order: number;
  removedFiles: string[];
  newFiles: File[];
};

function emptyForm(order: number): DocumentForm {
  return {
    record: null,
    title: "",
    description: "",
    order,
    removedFiles: [],
    newFiles: [],
  };
}

function editForm(record: GuideDocument): DocumentForm {
  return {
    record,
    title: record.title,
    description: record.description || "",
    order: record.order || 0,
    removedFiles: [],
    newFiles: [],
  };
}

function fileExtension(filename: string) {
  return filename.split(".").pop()?.toLowerCase() || "";
}

function fileMeta(filename: string) {
  const extension = fileExtension(filename);
  if (extension === "pdf") {
    return { label: "PDF", icon: FileText, className: "bg-rose-50 text-rose-700" };
  }
  if (extension === "xls" || extension === "xlsx") {
    return {
      label: "Excel",
      icon: FileSpreadsheet,
      className: "bg-emerald-50 text-emerald-700",
    };
  }
  return { label: "Word", icon: FileType, className: "bg-sky-50 text-sky-700" };
}

function formatDate(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function GuideDocumentsTab({ isAdmin }: { isAdmin: boolean }) {
  const [items, setItems] = useState<GuideDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState<GuideDocument | null>(null);
  const [form, setForm] = useState<DocumentForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<GuideDocument | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const result = await pb.collection("guide_documents").getList<GuideDocument>(1, 200, {
        sort: "order,-created",
      });
      setItems(result.items);
    } catch (error) {
      toast.error(errorMessage(error, "Không tải được kho tài liệu"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("vi");
    if (!keyword) return items;
    return items.filter((item) =>
      `${item.title} ${item.description || ""}`.toLocaleLowerCase("vi").includes(keyword),
    );
  }, [items, search]);

  const keptFiles = form?.record?.files.filter((name) => !form.removedFiles.includes(name)) || [];
  const selectedFileCount = keptFiles.length + (form?.newFiles.length || 0);

  const selectFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);
    event.target.value = "";
    if (!form || selected.length === 0) return;

    const invalidType = selected.find(
      (file) => !ACCEPTED_EXTENSIONS.includes(fileExtension(file.name)),
    );
    if (invalidType) {
      toast.warning("Chỉ chấp nhận tệp Word, PDF hoặc Excel");
      return;
    }
    const oversized = selected.find((file) => file.size > MAX_FILE_SIZE);
    if (oversized) {
      toast.warning(`Tệp ${oversized.name} vượt quá 25 MB`);
      return;
    }

    const remaining = MAX_FILES - selectedFileCount;
    if (remaining <= 0) {
      toast.warning("Mỗi trang tài liệu chỉ được tối đa 3 tệp");
      return;
    }
    if (selected.length > remaining) {
      toast.warning(`Chỉ có thể thêm ${remaining} tệp nữa`);
    }
    setForm({ ...form, newFiles: [...form.newFiles, ...selected.slice(0, remaining)] });
  };

  const save = async () => {
    if (!form || saving) return;
    if (!form.title.trim()) {
      toast.warning("Vui lòng nhập tên trang tài liệu");
      return;
    }
    if (selectedFileCount === 0) {
      toast.warning("Vui lòng đính kèm ít nhất 1 tệp");
      return;
    }

    setSaving(true);
    try {
      const data = new FormData();
      data.append("title", form.title.trim());
      data.append("description", form.description.trim());
      data.append("order", String(form.order || 0));
      for (const filename of form.removedFiles) data.append("files-", filename);
      for (const file of form.newFiles) data.append("files", file);

      if (form.record) {
        await pb.collection("guide_documents").update(form.record.id, data);
      } else {
        await pb.collection("guide_documents").create(data);
      }
      toast.success(form.record ? "Đã cập nhật trang tài liệu" : "Đã tạo trang tài liệu");
      setForm(null);
      await load();
    } catch (error) {
      toast.error(errorMessage(error, "Không lưu được trang tài liệu"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleting || deleteBusy) return;
    setDeleteBusy(true);
    try {
      await pb.collection("guide_documents").delete(deleting.id);
      toast.success("Đã xóa trang tài liệu");
      setDeleting(null);
      await load();
    } catch (error) {
      toast.error(errorMessage(error, "Không xóa được trang tài liệu"));
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-amber-50/70 p-3.5 shadow-soft sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <FolderOpen className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-foreground">Kho tài liệu nội bộ</div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Lưu trữ tài liệu đào tạo, quy trình và biểu mẫu. Mỗi trang có tối đa 3 tệp Word, PDF
                hoặc Excel.
              </p>
            </div>
          </div>
          {isAdmin && (
            <Button
              size="sm"
              className="h-9 w-full shrink-0 rounded-xl px-3 sm:w-auto"
              onClick={() => setForm(emptyForm(items.length))}
              aria-label="Tạo trang tài liệu"
            >
              <Plus className="h-4 w-4" />
              <span>Tạo mới</span>
            </Button>
          )}
        </div>
      </div>

      <FilterBar search={search} onSearchChange={setSearch} placeholder="Tìm tài liệu…" />

      {loading && items.length > 0 && (
        <DataLoadingState variant="inline" label="Đang cập nhật kho tài liệu..." />
      )}

      {loading && items.length === 0 ? (
        <DataLoadingState variant="grid" label="Đang tải kho tài liệu..." rows={4} />
      ) : filteredItems.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title={search ? "Không tìm thấy tài liệu" : "Chưa có tài liệu"}
          description={
            search
              ? "Thử tìm bằng tên hoặc nội dung mô tả khác."
              : isAdmin
                ? "Bấm Tạo mới để thêm trang tài liệu đầu tiên."
                : "Tài liệu do Admin đăng sẽ xuất hiện tại đây."
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filteredItems.map((item) => (
            <article
              key={item.id}
              className="relative overflow-hidden rounded-2xl border border-border/80 bg-card p-3.5 shadow-soft transition hover:border-primary/35"
            >
              <button type="button" className="w-full text-left" onClick={() => setViewing(item)}>
                <div className="flex items-start gap-3 pr-14">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                    <FolderOpen className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
                      {item.title}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {item.description || "Tài liệu nội bộ"}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {(item.files || []).map((filename) => {
                    const meta = fileMeta(filename);
                    const Icon = meta.icon;
                    return (
                      <span
                        key={filename}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold",
                          meta.className,
                        )}
                      >
                        <Icon className="h-3 w-3" /> {meta.label}
                      </span>
                    );
                  })}
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {item.files?.length || 0} tệp
                    {item.updated ? ` · ${formatDate(item.updated)}` : ""}
                  </span>
                </div>
              </button>

              {isAdmin && (
                <div className="absolute right-2 top-2 flex gap-1">
                  <button
                    type="button"
                    onClick={() => setForm(editForm(item))}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm backdrop-blur hover:bg-muted"
                    aria-label={`Sửa ${item.title}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(item)}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-background/90 text-destructive shadow-sm backdrop-blur hover:bg-destructive/10"
                    aria-label={`Xóa ${item.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-h-[90dvh] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-2xl sm:max-w-lg">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle>{viewing.title}</DialogTitle>
                <DialogDescription>
                  {viewing.description || "Danh sách tài liệu đính kèm."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                {(viewing.files || []).map((filename) => {
                  const meta = fileMeta(filename);
                  const Icon = meta.icon;
                  const url = fileUrl(viewing, filename);
                  return (
                    <div
                      key={filename}
                      className="flex items-center gap-3 rounded-xl border border-border/75 bg-muted/20 p-3"
                    >
                      <div
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                          meta.className,
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium" title={filename}>
                          {filename}
                        </div>
                        <div className="text-[11px] text-muted-foreground">Tệp {meta.label}</div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          asChild
                          size="icon"
                          variant="outline"
                          className="h-9 w-9 rounded-xl"
                        >
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Xem ${filename}`}
                          >
                            <Eye className="h-4 w-4" />
                          </a>
                        </Button>
                        <Button asChild size="icon" className="h-9 w-9 rounded-xl">
                          <a href={url} download={filename} aria-label={`Tải ${filename}`}>
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!form} onOpenChange={(open) => !open && !saving && setForm(null)}>
        <DialogContent className="max-h-[92dvh] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form?.record ? "Sửa trang tài liệu" : "Tạo trang tài liệu"}</DialogTitle>
            <DialogDescription>
              Thêm tối đa 3 tệp Word, PDF hoặc Excel; dung lượng tối đa 25 MB mỗi tệp.
            </DialogDescription>
          </DialogHeader>
          {form && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="guide-document-title">Tên trang tài liệu</Label>
                <Input
                  id="guide-document-title"
                  value={form.title}
                  maxLength={200}
                  placeholder="Ví dụ: Đào tạo nhân sự mới"
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="guide-document-description">Mô tả</Label>
                <Textarea
                  id="guide-document-description"
                  rows={4}
                  value={form.description}
                  maxLength={5000}
                  placeholder="Mô tả ngắn nội dung và đối tượng sử dụng..."
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Tệp đính kèm</Label>
                  <span className="text-xs font-medium text-muted-foreground">
                    {selectedFileCount}/{MAX_FILES} tệp
                  </span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx"
                  className="hidden"
                  onChange={selectFiles}
                />
                {selectedFileCount < MAX_FILES && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex min-h-24 w-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-center text-primary transition hover:bg-primary/10"
                  >
                    <Upload className="h-5 w-5" />
                    <span className="text-sm font-semibold">Chọn tệp tải lên</span>
                    <span className="text-[11px] text-muted-foreground">Word, PDF, Excel</span>
                  </button>
                )}

                <div className="space-y-2">
                  {keptFiles.map((filename) => {
                    const meta = fileMeta(filename);
                    const Icon = meta.icon;
                    return (
                      <div
                        key={filename}
                        className="flex items-center gap-2 rounded-xl border p-2.5"
                      >
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-xs font-medium">
                          {filename}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setForm({ ...form, removedFiles: [...form.removedFiles, filename] })
                          }
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-destructive hover:bg-destructive/10"
                          aria-label={`Bỏ tệp ${filename}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                  {form.newFiles.map((file, index) => {
                    const meta = fileMeta(file.name);
                    const Icon = meta.icon;
                    return (
                      <div
                        key={`${file.name}-${index}`}
                        className="flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 p-2.5"
                      >
                        <Icon className="h-4 w-4 shrink-0 text-primary" />
                        <span className="min-w-0 flex-1 truncate text-xs font-medium">
                          {file.name}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setForm({
                              ...form,
                              newFiles: form.newFiles.filter((_, fileIndex) => fileIndex !== index),
                            })
                          }
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-destructive hover:bg-destructive/10"
                          aria-label={`Bỏ tệp ${file.name}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="guide-document-order">Thứ tự hiển thị</Label>
                <Input
                  id="guide-document-order"
                  type="number"
                  min={0}
                  value={form.order}
                  onChange={(event) => setForm({ ...form, order: Number(event.target.value) })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={saving} onClick={() => setForm(null)}>
              Hủy
            </Button>
            <Button disabled={saving} onClick={save}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? "Đang lưu..." : "Lưu trang tài liệu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={(open) => !open && !deleteBusy && setDeleting(null)}>
        <DialogContent className="max-w-[calc(100vw-1.5rem)] rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Xóa trang tài liệu?</DialogTitle>
            <DialogDescription>
              Toàn bộ tệp trong “{deleting?.title}” sẽ bị xóa và không thể khôi phục.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={deleteBusy} onClick={() => setDeleting(null)}>
              Hủy
            </Button>
            <Button variant="destructive" disabled={deleteBusy} onClick={remove}>
              {deleteBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {deleteBusy ? "Đang xóa..." : "Xóa tài liệu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
