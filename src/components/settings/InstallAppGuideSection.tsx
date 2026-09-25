import { useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getClientDeviceProfile } from "@/lib/device-profile";
import { IosInstallGuideDialog } from "@/components/layout/IosInstallGuideDialog";
import { DesktopInstallGuideDialog } from "@/components/layout/DesktopInstallGuideDialog";
import { AndroidInstallGuideDialog } from "@/components/layout/AndroidInstallGuideDialog";

export function InstallAppGuideSection() {
  const [iosGuideOpen, setIosGuideOpen] = useState(false);
  const [desktopGuideOpen, setDesktopGuideOpen] = useState(false);
  const [androidGuideOpen, setAndroidGuideOpen] = useState(false);
  const deviceProfile = getClientDeviceProfile();

  return (
    <>
      <Card className="space-y-4 rounded-2xl border-border/60 p-4 shadow-soft">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Smartphone className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold">Cài đặt ứng dụng</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Cài JobConnect ra màn hình chính để trải nghiệm như ứng dụng độc lập.
            </p>
          </div>
        </div>

        {deviceProfile === "desktop" ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Monitor className="h-4 w-4 text-primary" />
                <div className="text-xs font-semibold">Máy tính</div>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Cài đặt JobConnect như một ứng dụng riêng trên Windows, Mac hoặc Linux.
              </p>
              <Button
                onClick={() => setDesktopGuideOpen(true)}
                variant="outline"
                size="sm"
                className="mt-3 w-full rounded-xl"
              >
                Xem hướng dẫn cài đặt
              </Button>
            </div>

            <div className="text-center text-xs text-muted-foreground">
              Đang truy cập từ máy tính? Làm theo hướng dẫn bên trên.
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-primary" />
                <div className="text-xs font-semibold">iPhone / iPad</div>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Thêm JobConnect vào màn hình chính iPhone hoặc iPad của bạn.
              </p>
              <Button
                onClick={() => setIosGuideOpen(true)}
                variant="outline"
                size="sm"
                className="mt-3 w-full rounded-xl"
              >
                Xem hướng dẫn iOS
              </Button>
            </div>

            <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-primary" />
                <div className="text-xs font-semibold">Android</div>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Thêm JobConnect vào màn hình chính điện thoại Android của bạn.
              </p>
              <Button
                onClick={() => setAndroidGuideOpen(true)}
                variant="outline"
                size="sm"
                className="mt-3 w-full rounded-xl"
              >
                Xem hướng dẫn Android
              </Button>
            </div>

            <div className="text-center text-xs text-muted-foreground">
              Đang truy cập từ điện thoại? Chọn hướng dẫn phù hợp với thiết bị.
            </div>
          </div>
        )}
      </Card>

      <IosInstallGuideDialog open={iosGuideOpen} onOpenChange={setIosGuideOpen} />
      <DesktopInstallGuideDialog open={desktopGuideOpen} onOpenChange={setDesktopGuideOpen} />
      <AndroidInstallGuideDialog open={androidGuideOpen} onOpenChange={setAndroidGuideOpen} />
    </>
  );
}
