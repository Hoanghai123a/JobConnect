import { useEffect, useRef, useState } from "react";
import { IdCard, LoaderCircle, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { displayDateToPocketBase, scanCccdQrFromFile, type CccdQrData } from "@/lib/cccd-qr";

export type JoinCccdFields = {
  worker_name_snapshot: string;
  worker_cccd_snapshot: string;
  worker_date_of_birth_snapshot: string;
  worker_address_snapshot: string;
  cccd_issue_date: string;
  hometown_snapshot?: string;
};

type LocationField = {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
};

type QrConfirmDraft = {
  fullName: string;
  cccd: string;
  dateOfBirth: string;
  issueDate: string;
  address: string;
};

export function JoinCccdSection({
  value,
  onChange,
  frontFile,
  backFile,
  onFrontFileChange,
  onBackFileChange,
  frontImageUrl,
  backImageUrl,
  locationField,
}: {
  value: JoinCccdFields;
  onChange: (changes: Partial<JoinCccdFields>) => void;
  frontFile: File | null;
  backFile: File | null;
  onFrontFileChange: (file: File | null) => void;
  onBackFileChange: (file: File | null) => void;
  frontImageUrl?: string;
  backImageUrl?: string;
  locationField?: LocationField;
}) {
  const [scanning, setScanning] = useState(false);
  const locationLabel = locationField?.label || "Địa chỉ thường trú";
  const locationValue =
    locationField?.value ?? value.worker_address_snapshot ?? value.hometown_snapshot ?? "";
  const locationPlaceholder = locationField?.placeholder || "Nhập địa chỉ thường trú";
  const updateLocation = (nextValue: string) => {
    if (locationField) {
      locationField.onChange(nextValue);
      return;
    }
    onChange({
      worker_address_snapshot: nextValue,
      hometown_snapshot: nextValue,
    });
  };
  const [confirmDraft, setConfirmDraft] = useState<QrConfirmDraft | null>(null);
  const scanSequence = useRef(0);

  const handleImagePick = async (file: File | null, side: "front" | "back") => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(`Vui lòng chọn ảnh CCCD ${side === "front" ? "mặt trước" : "mặt sau"}`);
      return;
    }

    if (side === "front") onFrontFileChange(file);
    else onBackFileChange(file);

    const sequence = ++scanSequence.current;
    setScanning(true);
    try {
      const data = await scanCccdQrFromFile(file);
      if (sequence !== scanSequence.current) return;
      if (!data) {
        toast.warning("Không đọc được mã QR, vui lòng nhập tay thông tin CCCD");
        return;
      }
      setConfirmDraft(toQrConfirmDraft(data));
    } catch {
      if (sequence === scanSequence.current) {
        toast.warning("Không đọc được mã QR, vui lòng nhập tay thông tin CCCD");
      }
    } finally {
      if (sequence === scanSequence.current) setScanning(false);
    }
  };

  const handleFrontPick = (file: File | null) => handleImagePick(file, "front");
  const handleBackPick = (file: File | null) => handleImagePick(file, "back");

  const applyQrData = () => {
    if (!confirmDraft) return;
    onChange({
      worker_name_snapshot: confirmDraft.fullName.trim(),
      worker_cccd_snapshot: confirmDraft.cccd.replace(/\D/g, ""),
      worker_date_of_birth_snapshot: displayDateToPocketBase(confirmDraft.dateOfBirth),
      cccd_issue_date: displayDateToPocketBase(confirmDraft.issueDate),
    });
    updateLocation(confirmDraft.address.trim());
    setConfirmDraft(null);
    toast.success("Đã áp dụng thông tin từ mã QR CCCD");
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Họ tên tại nhà máy</Label>
          <Input
            value={value.worker_name_snapshot}
            onChange={(event) => onChange({ worker_name_snapshot: event.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Số CCCD tại nhà máy</Label>
          <Input
            value={value.worker_cccd_snapshot}
            onChange={(event) =>
              onChange({ worker_cccd_snapshot: event.target.value.replace(/\D/g, "") })
            }
            inputMode="numeric"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Ngày sinh</Label>
          <DateInput
            value={value.worker_date_of_birth_snapshot}
            onChange={(worker_date_of_birth_snapshot) =>
              onChange({ worker_date_of_birth_snapshot })
            }
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Ngày cấp CCCD</Label>
          <DateInput
            value={value.cccd_issue_date}
            onChange={(cccd_issue_date) => onChange({ cccd_issue_date })}
          />
        </div>
        <div className="space-y-1 min-[420px]:col-span-2">
          <Label className="text-xs">{locationLabel}</Label>
          <Input
            value={locationValue}
            onChange={(event) => updateLocation(event.target.value)}
            placeholder={locationPlaceholder}
          />
        </div>
        <div className="space-y-1.5 min-[420px]:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <Label className="text-xs font-semibold">Ảnh CCCD (tùy chọn)</Label>
            {scanning && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Đang đọc mã QR…
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <CccdFileSlot
              label="Mặt trước"
              file={frontFile}
              existingUrl={frontImageUrl}
              onPick={handleFrontPick}
              onClear={() => {
                scanSequence.current += 1;
                setScanning(false);
                onFrontFileChange(null);
              }}
            />
            <CccdFileSlot
              label="Mặt sau"
              file={backFile}
              existingUrl={backImageUrl}
              onPick={handleBackPick}
              onClear={() => {
                scanSequence.current += 1;
                setScanning(false);
                onBackFileChange(null);
              }}
            />
          </div>
          <p className="text-[11px] leading-4 text-muted-foreground">
            Chọn ảnh có mã QR ở mặt trước hoặc mặt sau để tự đọc thông tin. Dữ liệu chỉ được điền
            sau khi bạn xác nhận.
          </p>
        </div>
      </div>

      <Dialog
        open={Boolean(confirmDraft)}
        onOpenChange={(open) => {
          if (!open) setConfirmDraft(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Xác nhận dữ liệu đọc từ CCCD</DialogTitle>
            <DialogDescription>
              Kiểm tra trước khi áp dụng vào biểu mẫu báo đi làm. Địa chỉ đọc từ mã QR có thể chỉnh
              sửa trước khi áp dụng.
            </DialogDescription>
          </DialogHeader>
          {confirmDraft && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Họ tên</Label>
                  <Input
                    value={confirmDraft.fullName}
                    onChange={(event) =>
                      setConfirmDraft((current) =>
                        current ? { ...current, fullName: event.target.value } : current,
                      )
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Số CCCD</Label>
                  <Input
                    value={confirmDraft.cccd}
                    inputMode="numeric"
                    onChange={(event) =>
                      setConfirmDraft((current) =>
                        current
                          ? { ...current, cccd: event.target.value.replace(/\D/g, "") }
                          : current,
                      )
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Ngày sinh</Label>
                  <DateInput
                    value={displayDateToPocketBase(confirmDraft.dateOfBirth)}
                    onChange={(dateOfBirth) =>
                      setConfirmDraft((current) =>
                        current ? { ...current, dateOfBirth } : current,
                      )
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Ngày cấp CCCD</Label>
                  <DateInput
                    value={displayDateToPocketBase(confirmDraft.issueDate)}
                    onChange={(issueDate) =>
                      setConfirmDraft((current) => (current ? { ...current, issueDate } : current))
                    }
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{locationLabel}</Label>
                <Textarea
                  value={confirmDraft.address}
                  rows={2}
                  onChange={(event) =>
                    setConfirmDraft((current) =>
                      current ? { ...current, address: event.target.value } : current,
                    )
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmDraft(null)}>
              Huỷ
            </Button>
            <Button type="button" onClick={applyQrData}>
              Áp dụng dữ liệu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function toQrConfirmDraft(data: CccdQrData): QrConfirmDraft {
  return {
    fullName: data.fullName || "",
    cccd: data.cccd || "",
    dateOfBirth: displayDateToPocketBase(data.dateOfBirth),
    issueDate: displayDateToPocketBase(data.issuedDate),
    address: data.address || "",
  };
}

function CccdFileSlot({
  label,
  file,
  existingUrl,
  onPick,
  onClear,
}: {
  label: string;
  file: File | null;
  existingUrl?: string;
  onPick: (file: File | null) => void | Promise<void>;
  onClear: () => void;
}) {
  const filePreview = useFilePreview(file);
  const preview = filePreview || existingUrl || "";

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="relative aspect-[1.586/1] overflow-hidden rounded-xl border border-dashed border-border bg-muted/30">
        {preview ? (
          <>
            <img
              src={preview}
              alt={`CCCD ${label.toLowerCase()}`}
              className="h-full w-full object-cover"
            />
            {file && (
              <button
                type="button"
                onClick={onClear}
                className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-destructive shadow"
                aria-label={`Bỏ ảnh CCCD ${label.toLowerCase()} vừa chọn`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <label className="absolute inset-x-0 bottom-0 flex cursor-pointer items-center justify-center gap-1 bg-gradient-to-t from-black/70 to-transparent px-2 pb-2 pt-6 text-[11px] font-medium text-white">
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => {
                  void onPick(event.target.files?.[0] || null);
                  event.target.value = "";
                }}
              />
              <RefreshCw className="h-3 w-3" /> Đổi ảnh
            </label>
          </>
        ) : (
          <label className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-1 text-muted-foreground">
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                void onPick(event.target.files?.[0] || null);
                event.target.value = "";
              }}
            />
            <IdCard className="h-6 w-6" />
            <span className="text-[11px] font-medium">Chọn ảnh</span>
          </label>
        )}
      </div>
    </div>
  );
}

function useFilePreview(file: File | null) {
  const [preview, setPreview] = useState("");

  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return preview;
}
