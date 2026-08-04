import { useEffect, useState } from "react";
import { AlertTriangle, Eye, EyeOff, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pb, type UserRecord } from "@/lib/pocketbase";

type DeleteDependency = {
  collection: string;
  label: string;
  count: number;
};

type DeleteErrorPayload = {
  code?: string;
  message?: string;
  dependencies?: DeleteDependency[];
};

type DeleteWorkerDialogProps = {
  worker: UserRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: (workerId: string) => void | Promise<void>;
};

export function DeleteWorkerDialog({
  worker,
  open,
  onOpenChange,
  onDeleted,
}: DeleteWorkerDialogProps) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dependencies, setDependencies] = useState<DeleteDependency[]>([]);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!open) {
      setPassword("");
      setShowPassword(false);
      setDependencies([]);
      setErrorMessage("");
    }
  }, [open, worker?.id]);

  const submit = async () => {
    if (!worker?.id || submitting) return;
    if (!password) {
      setErrorMessage("Vui lòng nhập mật khẩu Admin.");
      return;
    }

    setSubmitting(true);
    setDependencies([]);
    setErrorMessage("");
    try {
      const response = await fetch(`/api/admin/workers/${encodeURIComponent(worker.id)}/delete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${pb.authStore.token}`,
        },
        body: JSON.stringify({ password }),
      });
      const payload = (await response.json().catch(() => ({}))) as DeleteErrorPayload & {
        workerId?: string;
      };

      if (!response.ok) {
        if (payload.code === "WORKER_HAS_DEPENDENCIES") {
          setDependencies(Array.isArray(payload.dependencies) ? payload.dependencies : []);
        }
        throw new Error(payload.message || "Không thể xóa tài khoản NLĐ.");
      }

      await onDeleted(payload.workerId || worker.id);
      toast.success("Đã xóa tài khoản NLĐ và lưu nhật ký");
      onOpenChange(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Không thể xóa tài khoản NLĐ.");
    } finally {
      setSubmitting(false);
    }
  };

  const name = worker?.full_name || worker?.username || worker?.uid || "NLĐ này";

  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => !submitting && onOpenChange(nextOpen)}>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <div className="flex items-start gap-3 text-left">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div className="min-w-0 space-y-1">
              <AlertDialogTitle>Xóa tài khoản NLĐ?</AlertDialogTitle>
              <AlertDialogDescription>
                Hành động này không thể hoàn tác. Lịch sử đi làm và hồ sơ liên quan có thể bị xóa
                theo cấu hình PocketBase. Các nghiệp vụ liên quan tới tiền sẽ chặn xóa.
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        <div className="space-y-4 px-6 py-4">
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm">
            <div className="font-semibold text-foreground">{name}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              @{worker?.username || "chưa có username"}
              {worker?.uid ? ` · UID ${worker.uid}` : ""}
              {worker?.phone ? ` · ${worker.phone}` : ""}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="delete-worker-admin-password">Mật khẩu Admin hiện tại</Label>
            <div className="relative">
              <Input
                id="delete-worker-admin-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setErrorMessage("");
                  setDependencies([]);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void submit();
                  }
                }}
                autoComplete="current-password"
                autoFocus
                disabled={submitting}
                placeholder="Nhập mật khẩu để xác nhận"
                className="pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                disabled={submitting}
                className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {errorMessage && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {errorMessage}
            </div>
          )}

          {dependencies.length > 0 && (
            <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <div className="font-semibold">Nghiệp vụ tiền đang chặn xóa</div>
              <ul className="space-y-1 text-xs">
                {dependencies.map((item) => (
                  <li key={item.collection} className="flex items-center justify-between gap-3">
                    <span>{item.label}</span>
                    <span className="font-semibold">{item.count} bản ghi</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs">
                Hãy xử lý các nghiệp vụ tiền trước hoặc vô hiệu hóa tài khoản.
              </p>
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Hủy</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={submitting || !password}
            onClick={() => void submit()}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Đang kiểm tra...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" /> Xác nhận xóa
              </>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
