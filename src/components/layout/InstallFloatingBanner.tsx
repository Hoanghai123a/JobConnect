import { useEffect, useMemo, useState } from "react";
import { Download, X } from "lucide-react";

const HIDE_FLAG_KEY = "hideInstallBanner";
const HIDE_UNTIL_KEY = "hideInstallBannerUntil";
const HIDE_MS = 7 * 24 * 60 * 60 * 1000;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isStandaloneMode() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isTemporarilyHidden(now: number) {
  const until = Number(window.localStorage.getItem(HIDE_UNTIL_KEY) || 0);
  return Number.isFinite(until) && until > now;
}

export function InstallFloatingBanner() {
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const isIos = useMemo(() => {
    if (typeof window === "undefined") return false;
    const ua = window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(ua);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const evaluateVisibility = () => {
      if (isStandaloneMode() || isTemporarilyHidden(Date.now())) {
        setHidden(true);
        setReady(true);
        return;
      }
      setHidden(false);
      setReady(true);
    };

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      evaluateVisibility();
    };

    const onAppInstalled = () => {
      setHidden(true);
      setInstallPrompt(null);
      window.localStorage.removeItem(HIDE_FLAG_KEY);
      window.localStorage.removeItem(HIDE_UNTIL_KEY);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    evaluateVisibility();

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const close = () => {
    window.localStorage.setItem(HIDE_FLAG_KEY, "true");
    window.localStorage.setItem(HIDE_UNTIL_KEY, String(Date.now() + HIDE_MS));
    setHidden(true);
  };

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === "accepted") setHidden(true);
  };

  if (!ready || hidden) return null;

  return (
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
          <Download className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight text-foreground">
            Cài app ra màn hình chính
          </p>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
            Trên iPhone: bấm Chia sẻ rồi chọn Thêm vào màn hình chính.
          </p>
        </div>
        {installPrompt && (
          <button
            type="button"
            onClick={install}
            className="shrink-0 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground active:scale-95"
          >
            Cài đặt
          </button>
        )}
      </div>
    </div>
  );
}
