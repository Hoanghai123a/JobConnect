import { useEffect, useMemo, useState } from "react";
import { Bell, BellOff, BellRing, RefreshCw } from "lucide-react";
import { toast } from "@/lib/toast";

import {
  enablePushNotifications,
  getPushSupportState,
  type PushSupportState,
} from "@/lib/push-notifications";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type StatusTone = "ready" | "success" | "warning" | "blocked";

function getStatus(state: PushSupportState | null): {
  title: string;
  description: string;
  tone: StatusTone;
  canEnable: boolean;
  buttonLabel: string;
} {
  if (!state) {
    return {
      title: "Đang kiểm tra thiết bị",
      description: "Ứng dụng đang kiểm tra quyền thông báo trên thiết bị này.",
      tone: "ready",
      canEnable: false,
      buttonLabel: "Đang kiểm tra",
    };
  }

  if (!state.supported) {
    return {
      title: "Thiết bị chưa hỗ trợ thông báo",
      description: "Trình duyệt hiện tại chưa hỗ trợ Web Push.",
      tone: "blocked",
      canEnable: false,
      buttonLabel: "Không hỗ trợ",
    };
  }

  if (!state.standalone) {
    return {
      title: "Cần mở bằng app đã cài",
      description: "Thông báo chỉ bật khi người dùng mở JobConnect ở dạng PWA.",
      tone: "warning",
      canEnable: false,
      buttonLabel: "Mở app PWA",
    };
  }

  if (!state.configured) {
    return {
      title: "Máy chủ chưa cấu hình thông báo",
      description: "Thiếu VAPID public/private key nên chưa thể lưu thiết bị nhận thông báo.",
      tone: "warning",
      canEnable: false,
      buttonLabel: "Chưa cấu hình",
    };
  }

  if (state.permission === "denied") {
    return {
      title: "Thông báo đang bị chặn",
      description: "Hãy mở cài đặt trình duyệt hoặc hệ điều hành để cho phép thông báo cho app.",
      tone: "blocked",
      canEnable: false,
      buttonLabel: "Đã bị chặn",
    };
  }

  if (state.permission === "granted") {
    return {
      title: "Thông báo đã được bật",
      description: "Bấm đồng bộ lại nếu thiết bị này chưa nhận được thông báo thử nghiệm.",
      tone: "success",
      canEnable: true,
      buttonLabel: "Đồng bộ lại thiết bị",
    };
  }

  return {
    title: "Chưa bật thông báo",
    description: "Bật để nhận thông báo khi có phê duyệt mới hoặc khi yêu cầu của bạn có kết quả.",
    tone: "ready",
    canEnable: true,
    buttonLabel: "Bật thông báo",
  };
}

function toneClass(tone: StatusTone) {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
  if (tone === "blocked") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-primary/20 bg-primary/10 text-primary";
}

export function PushNotificationSettingsCard({ buttonOnly = false }: { buttonOnly?: boolean }) {
  const [state, setState] = useState<PushSupportState | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const status = useMemo(() => getStatus(state), [state]);
  const Icon =
    state?.permission === "granted" ? BellRing : state?.permission === "denied" ? BellOff : Bell;

  async function refresh() {
    setLoading(true);
    try {
      setState(await getPushSupportState());
    } catch {
      setState(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function enable() {
    setSubmitting(true);
    try {
      await enablePushNotifications();
      toast.success("Đã bật thông báo cho thiết bị này");
    } catch (error: any) {
      toast.error(error?.message || "Không bật được thông báo");
    } finally {
      setSubmitting(false);
      refresh();
    }
  }

  const actionButton = (
    <Button
      type="button"
      onClick={enable}
      disabled={loading || submitting || !status.canEnable}
      className="w-full shrink-0 gap-2 rounded-xl sm:w-auto"
      variant={buttonOnly ? "default" : state?.permission === "granted" ? "outline" : "default"}
    >
      {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
      {submitting ? "Đang xử lý..." : status.buttonLabel}
    </Button>
  );

  if (buttonOnly) return actionButton;

  return (
    <Card className="mb-4 overflow-hidden rounded-2xl border-border/60 shadow-soft">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${toneClass(status.tone)}`}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">Thông báo phê duyệt</div>
            <div className="mt-1 text-sm font-medium text-foreground">{status.title}</div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{status.description}</p>
          </div>
        </div>

        {actionButton}
      </div>
    </Card>
  );
}
