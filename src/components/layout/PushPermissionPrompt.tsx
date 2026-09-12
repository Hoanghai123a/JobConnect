import { useEffect, useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { toast } from "@/lib/toast";

import { useAuth } from "@/lib/auth";
import {
  enablePushNotifications,
  getPushDismissed,
  getPushSupportState,
  setPushDismissed,
  syncExistingPushSubscription,
} from "@/lib/push-notifications";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function PushPermissionPrompt() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading || !user?.id) return;
    let alive = true;

    const timer = window.setTimeout(async () => {
      const state = await getPushSupportState().catch(() => null);
      if (!alive || !state?.supported || !state.standalone) return;
      if (!state.configured) {
        console.warn("[push] Thiếu VAPID_PUBLIC_KEY nên chưa hiện popup bật thông báo.");
        return;
      }

      if (state.permission === "granted") {
        syncExistingPushSubscription().catch(() => undefined);
        return;
      }

      if (state.permission === "default" && !getPushDismissed(user.id)) {
        setOpen(true);
      }
    }, 1200);

    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [loading, user?.id]);

  if (!user?.id) return null;

  async function enable() {
    setSubmitting(true);
    try {
      await enablePushNotifications();
      toast.success("Đã bật thông báo cho thiết bị này");
      setOpen(false);
    } catch (error: any) {
      toast.error(error?.message || "Không bật được thông báo");
    } finally {
      setSubmitting(false);
    }
  }

  function dismiss() {
    if (user?.id) setPushDismissed(user.id);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : dismiss())}>
      <DialogContent className="max-w-[calc(100vw-2rem)] rounded-3xl sm:max-w-sm">
        <DialogHeader>
          <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <BellRing className="h-5 w-5" />
          </div>
          <DialogTitle>Bật thông báo</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm leading-6 text-muted-foreground">
            Nhận thông báo khi có phê duyệt mới hoặc khi yêu cầu phê duyệt của bạn đã có kết quả.
          </p>

          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button onClick={enable} disabled={submitting} className="gap-2 rounded-xl">
              <Bell className="h-4 w-4" />
              {submitting ? "Đang bật..." : "Bật thông báo"}
            </Button>
            <Button type="button" variant="outline" onClick={dismiss} className="rounded-xl">
              Để sau
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
