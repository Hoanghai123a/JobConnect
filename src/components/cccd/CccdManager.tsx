import { useState } from "react";
import { Download, IdCard, ImagePlus, Trash, ZoomIn } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { pb, dataUrlToFile, fileUrl, type UserRecord } from "@/lib/pocketbase";
import { createStaffActionLog, type StaffActionType } from "@/lib/staff-log";
import { compressImage } from "@/lib/image-compress";
import { getCurrentCccdVersion, updateCccdVersionImages } from "@/lib/cccd-versions";

interface CccdManagerProps {
  targetUser: UserRecord;
  actor: Partial<UserRecord> | null;
  onUpdated: () => void;
  readOnly?: boolean;
}

export function CccdManager({ targetUser, actor, onUpdated, readOnly }: CccdManagerProps) {
  const [uploading, setUploading] = useState(false);
  const [zoomSrc, setZoomSrc] = useState("");

  const frontUrl = targetUser.cccd_front ? fileUrl(targetUser, targetUser.cccd_front) : "";
  const backUrl = targetUser.cccd_back ? fileUrl(targetUser, targetUser.cccd_back) : "";

  const uploadCccd = (side: "cccd_front" | "cccd_back") => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn file ảnh");
      return;
    }
    setUploading(true);
    try {
      const compressed = await compressImage(file);

      const fd = new FormData();
      fd.append(side, compressed);

      const versionField = side === "cccd_front" ? "front_image" : "back_image";
      const [, currentVersion] = await Promise.all([
        pb.collection("users").update(targetUser.id, fd),
        getCurrentCccdVersion(targetUser.id),
      ]);
      if (currentVersion) {
        await updateCccdVersionImages(
          currentVersion.id,
          versionField === "front_image" ? compressed : undefined,
          versionField === "back_image" ? compressed : undefined,
        );
      }

      const action: StaffActionType = targetUser[side] ? "update" : "create";
      await createStaffActionLog({
        actor,
        targetUserId: targetUser.id,
        targetCollection: "users",
        targetRecord: targetUser.id,
        action,
        after: { [side]: compressed.name },
        note: `${actor?.role === "admin" ? "Admin" : "Staff"} ${action === "create" ? "thêm" : "cập nhật"} ảnh ${side === "cccd_front" ? "CCCD mặt trước" : "CCCD mặt sau"}`,
      });
      toast.success("Đã cập nhật ảnh CCCD");
      onUpdated();
    } catch (err: any) {
      toast.error(err?.message || "Lỗi upload ảnh");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const deleteCccd = async (side: "cccd_front" | "cccd_back") => {
    if (!confirm(`Xoá ảnh ${side === "cccd_front" ? "mặt trước" : "mặt sau"}?`)) return;
    setUploading(true);
    try {
      await pb.collection("users").update(targetUser.id, { [side]: null });
      await createStaffActionLog({
        actor,
        targetUserId: targetUser.id,
        targetCollection: "users",
        targetRecord: targetUser.id,
        action: "delete",
        before: { [side]: targetUser[side] },
        note: `${actor?.role === "admin" ? "Admin" : "Staff"} xoá ảnh ${side === "cccd_front" ? "CCCD mặt trước" : "CCCD mặt sau"}`,
      });
      toast.success("Đã xoá ảnh CCCD");
      onUpdated();
    } catch (err: any) {
      toast.error(err?.message || "Lỗi xoá ảnh");
    } finally {
      setUploading(false);
    }
  };

  const downloadCccd = async (url: string, side: "cccd_front" | "cccd_back") => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${targetUser.full_name || targetUser.username || "user"}_${side === "cccd_front" ? "mat_truoc" : "mat_sau"}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch {
      toast.error("Không tải được ảnh");
    }
  };

  return (
    <>
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-3">
          <CccdSlot
            label="Mặt trước"
            url={frontUrl}
            readOnly={readOnly}
            uploading={uploading}
            onPick={uploadCccd("cccd_front")}
            onDelete={() => deleteCccd("cccd_front")}
            onZoom={() => setZoomSrc(frontUrl)}
            onDownload={() => downloadCccd(frontUrl, "cccd_front")}
          />
          <CccdSlot
            label="Mặt sau"
            url={backUrl}
            readOnly={readOnly}
            uploading={uploading}
            onPick={uploadCccd("cccd_back")}
            onDelete={() => deleteCccd("cccd_back")}
            onZoom={() => setZoomSrc(backUrl)}
            onDownload={() => downloadCccd(backUrl, "cccd_back")}
          />
        </div>
      </div>

      <Dialog open={!!zoomSrc} onOpenChange={() => setZoomSrc("")}>
        <DialogContent className="max-w-[92vw] rounded-2xl p-2">
          <DialogHeader>
            <DialogTitle>Ảnh CCCD</DialogTitle>
          </DialogHeader>
          {zoomSrc && <img src={zoomSrc} alt="CCCD" className="w-full rounded-xl" />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function CccdSlot({
  label,
  url,
  readOnly,
  uploading,
  onPick,
  onDelete,
  onZoom,
  onDownload,
}: {
  label: string;
  url: string;
  readOnly?: boolean;
  uploading: boolean;
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDelete: () => void;
  onZoom: () => void;
  onDownload: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="relative aspect-[1.586/1] overflow-hidden rounded-xl border border-dashed border-border bg-muted/30">
        {url ? (
          <>
            <img src={url} alt={label} className="h-full w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1.5 bg-gradient-to-t from-black/50 to-transparent px-2 pb-1.5 pt-4">
              <button
                type="button"
                onClick={onZoom}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-foreground shadow"
                aria-label="Phóng to"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={onDownload}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-foreground shadow"
                aria-label="Tải xuống"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
              {!readOnly && (
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={uploading}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-destructive shadow"
                  aria-label="Xoá"
                >
                  <Trash className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </>
        ) : (
          !readOnly ? (
            <label className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-1 text-muted-foreground">
              <input type="file" accept="image/*" hidden onChange={onPick} disabled={uploading} />
              <IdCard className="h-6 w-6" />
              <span className="text-[11px] font-medium">Bấm để chọn ảnh</span>
            </label>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
              <IdCard className="h-6 w-6" />
              <span className="text-[11px]">Chưa có ảnh</span>
            </div>
          )
        )}
      </div>
      {url && !readOnly && (
        <label className="block cursor-pointer">
          <input type="file" accept="image/*" hidden onChange={onPick} disabled={uploading} />
          <span className="inline-flex items-center gap-1 text-[11px] text-primary">
            <ImagePlus className="h-3 w-3" /> Đổi ảnh
          </span>
        </label>
      )}
    </div>
  );
}
