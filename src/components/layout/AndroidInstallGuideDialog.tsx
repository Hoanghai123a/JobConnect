import { Smartphone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AndroidInstallGuideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AndroidInstallGuideDialog({ open, onOpenChange }: AndroidInstallGuideDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] max-w-[26rem] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            Cài ứng dụng trên Android
          </DialogTitle>
          <DialogDescription>
            Làm theo hướng dẫn bên dưới để cài app vào điện thoại.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                1
              </span>
              <span className="font-medium leading-6">
                Mở trang này bằng trình duyệt Chrome trên Android
              </span>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                2
              </span>
              <div>
                <span className="font-medium leading-6">Bấm dấu 3 chấm ở góc trên bên phải</span>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Icon dấu 3 chấm dọc (⋮) trên thanh địa chỉ Chrome.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                3
              </span>
              <div>
                <span className="font-medium leading-6">Chọn "Thêm vào Màn hình chính"</span>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Hoặc "Add to Home screen" nếu Chrome hiển thị tiếng Anh.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                4
              </span>
              <span className="font-medium leading-6">
                Bấm "Thêm" hoặc "Add" trong hộp thoại xuất hiện
              </span>
            </div>
          </div>
          <div className="rounded-xl bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
            Sau khi cài, biểu tượng app sẽ xuất hiện trên màn hình chính. Chạm vào để mở như một ứng
            dụng độc lập.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
