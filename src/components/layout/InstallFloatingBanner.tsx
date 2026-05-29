import { useEffect, useState } from "react";
import { BookOpen, Download, Smartphone, X } from "lucide-react";
import { useAppSettings } from "@/lib/app-settings";
import { fileUrl } from "@/lib/pocketbase";
import { isStandaloneMode, usePwaInstallPrompt } from "@/lib/pwa-install";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

const HIDE_FLAG_KEY = "hideInstallBanner";
const HIDE_UNTIL_KEY = "hideInstallBannerUntil";
const HIDE_MS = 7 * 24 * 60 * 60 * 1000;

function isTemporarilyHidden(now: number) {
  const until = Number(window.localStorage.getItem(HIDE_UNTIL_KEY) || 0);
  return Number.isFinite(until) && until > now;
}

export function InstallFloatingBanner() {
  const { data: settings } = useAppSettings();
  const { installPrompt, installApp, isAndroid, isIos } = usePwaInstallPrompt();
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [guideOpen, setGuideOpen] = useState(false);
  const guideImages = Array.isArray(settings.install_guide_images)
    ? settings.install_guide_images
    : [];

  useEffect(() => {
    if (typeof window === "undefined") return;

    const evaluateVisibility = () => {
      if (isStandaloneMode() || isTemporarilyHidden(Date.now())) {
        setHidden(true);
        setReady(true);
        return;
      }

      if (isIos) {
        setHidden(false);
        setReady(true);
        return;
      }

      if (isAndroid) {
        setHidden(false);
        setReady(true);
        return;
      }

      setHidden(true);
      setReady(true);
    };

    const onAppInstalled = () => {
      setHidden(true);
      window.localStorage.removeItem(HIDE_FLAG_KEY);
      window.localStorage.removeItem(HIDE_UNTIL_KEY);
    };

    window.addEventListener("appinstalled", onAppInstalled);
    evaluateVisibility();

    return () => {
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, [installPrompt, isAndroid, isIos]);

  const close = () => {
    window.localStorage.setItem(HIDE_FLAG_KEY, "true");
    window.localStorage.setItem(HIDE_UNTIL_KEY, String(Date.now() + HIDE_MS));
    setHidden(true);
  };

  const install = async () => {
    if (!installPrompt) {
      toast.info("Chưa thể mở hộp cài đặt", {
        description:
          "Vui lòng mở bằng Chrome trên Android, hoặc thử tải lại trang rồi bấm Cài đặt.",
      });
      return;
    }
    const choice = await installApp();
    if (choice === "accepted") setHidden(true);
  };

  if (!ready || hidden) return null;

  return (
    <>
      <div
        className="fixed left-1/2 z-50 w-[calc(100%-1rem)] max-w-[29rem] -translate-x-1/2 rounded-2xl border border-border/70 bg-card/95 px-3 py-2 shadow-[0_18px_45px_-20px_rgba(15,23,42,0.38)] backdrop-blur-xl"
        style={{ bottom: "calc(4.75rem + env(safe-area-inset-bottom))" }}
        role="status"
      >
        <button
          type="button"
          aria-label="Ẩn gợi ý cài đặt"
          onClick={close}
          className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-soft active:scale-95"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <div className="flex items-center gap-2.5 pr-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
            {isIos ? <Smartphone className="h-4.5 w-4.5" /> : <Download className="h-4.5 w-4.5" />}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight text-foreground">
              {isIos ? "Hướng dẫn cài app" : "Cài app ra màn hình chính"}
            </p>
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
              {isIos
                ? "Mở hướng dẫn để xem từng bước theo ảnh."
                : "Nhấn Cài đặt để thêm ứng dụng vào màn hình chính."}
            </p>
          </div>

          {isIos ? (
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              className="shrink-0 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground active:scale-95"
            >
              Hướng dẫn
            </button>
          ) : (
            isAndroid && (
              <button
                type="button"
                onClick={install}
                className="shrink-0 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground active:scale-95"
              >
                Cài đặt
              </button>
            )
          )}
        </div>
      </div>

      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Hướng dẫn cài đặt</DialogTitle>
          </DialogHeader>

          {guideImages.length > 0 ? (
            <Carousel opts={{ align: "start", loop: guideImages.length > 1 }} className="pt-2">
              <CarouselContent className="-ml-2">
                {guideImages.map((image, index) => (
                  <CarouselItem key={image} className="pl-2">
                    <div className="overflow-hidden rounded-2xl border bg-muted">
                      <div className="flex items-center justify-between border-b bg-card px-3 py-2">
                        <div className="flex items-center gap-2 text-xs font-medium">
                          <BookOpen className="h-4 w-4 text-primary" />
                          Bước {index + 1}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {index + 1}/{guideImages.length}
                        </div>
                      </div>
                      <img
                        src={fileUrl(settings, image)}
                        alt={`Hướng dẫn bước ${index + 1}`}
                        className="max-h-[60dvh] w-full object-contain bg-black"
                      />
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              {guideImages.length > 1 && (
                <>
                  <CarouselPrevious className="left-3 border-border/70 bg-background/90 shadow-soft" />
                  <CarouselNext className="right-3 border-border/70 bg-background/90 shadow-soft" />
                </>
              )}
            </Carousel>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              Chưa có ảnh hướng dẫn. Admin thêm ảnh trong Cài đặt hệ thống.
            </div>
          )}

          {guideImages.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Mẹo: Sau khi mở trang chia sẻ của iPhone, chọn <strong>Thêm vào MH chính</strong>.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
