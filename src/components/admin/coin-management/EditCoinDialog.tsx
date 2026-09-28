import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus, Minus } from "lucide-react";
import { addCoinsToUser, subtractCoinsFromUser } from "@/lib/coin-management";
import { toast } from "sonner";

interface EditCoinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  currentBalance: number;
  adminId: string;
  onSuccess: () => void;
}

export function EditCoinDialog({
  open,
  onOpenChange,
  userId,
  userName,
  currentBalance,
  adminId,
  onSuccess,
}: EditCoinDialogProps) {
  const [mode, setMode] = useState<"add" | "subtract">("add");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const numAmount = parseInt(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error("Vui lòng nhập số xu hợp lệ");
      return;
    }

    if (!reason.trim()) {
      toast.error("Vui lòng nhập lý do");
      return;
    }

    setLoading(true);
    try {
      const result =
        mode === "add"
          ? await addCoinsToUser({
              userId,
              amount: numAmount,
              reason: reason.trim(),
              adminId,
            })
          : await subtractCoinsFromUser({
              userId,
              amount: numAmount,
              reason: reason.trim(),
              adminId,
            });

      if (result.success) {
        toast.success(result.message);
        setAmount("");
        setReason("");
        onOpenChange(false);
        onSuccess();
      } else {
        toast.error(result.message);
      }
    } catch (error: any) {
      toast.error(error.message || "Có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  };

  const previewBalance = () => {
    const numAmount = parseInt(amount);
    if (isNaN(numAmount) || numAmount <= 0) return currentBalance;
    return mode === "add"
      ? currentBalance + numAmount
      : currentBalance - numAmount;
  };

  const isValidAmount = () => {
    const numAmount = parseInt(amount);
    if (isNaN(numAmount) || numAmount <= 0) return false;
    if (mode === "subtract" && numAmount > currentBalance) return false;
    return true;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Chỉnh sửa xu</DialogTitle>
          <DialogDescription>
            Thay đổi số xu của <span className="font-medium">{userName}</span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Loại thao tác</Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as any)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="add" id="add" />
                <Label htmlFor="add" className="flex items-center gap-1.5 cursor-pointer">
                  <Plus className="h-4 w-4 text-green-600" />
                  Cộng xu
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="subtract" id="subtract" />
                <Label htmlFor="subtract" className="flex items-center gap-1.5 cursor-pointer">
                  <Minus className="h-4 w-4 text-red-600" />
                  Trừ xu
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Số lượng xu</Label>
            <Input
              id="amount"
              type="number"
              min="1"
              max={mode === "subtract" ? currentBalance : undefined}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Nhập số xu..."
              required
            />
            {mode === "subtract" && (
              <p className="text-xs text-muted-foreground">
                Số xu hiện tại: {currentBalance.toLocaleString()}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Lý do</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Nhập lý do thay đổi..."
              rows={3}
              required
            />
          </div>

          {amount && isValidAmount() && (
            <div className="rounded-md bg-muted p-3 space-y-1">
              <div className="text-sm font-medium">Xem trước</div>
              <div className="text-sm">
                <span className="text-muted-foreground">Số xu sau thay đổi: </span>
                <span
                  className={`font-semibold ${
                    mode === "add" ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {previewBalance().toLocaleString()}
                </span>
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={loading || !isValidAmount()}>
              {loading ? "Đang xử lý..." : "Xác nhận"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
