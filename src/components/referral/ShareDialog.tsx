import { useState } from "react";
import { Copy, Check, MessageCircle, Facebook } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  generateShareContent,
  getZaloShareUrl,
  getFacebookShareUrl,
  copyToClipboard,
} from "@/lib/share";
import { toast } from "@/lib/toast";

interface ShareDialogProps {
  referralCode: string;
  userName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareDialog({
  referralCode,
  userName,
  open,
  onOpenChange,
}: ShareDialogProps) {
  const [copied, setCopied] = useState(false);

  const { url: shareUrl, fullMessage } = generateShareContent({
    referralCode,
    userName,
  });

  const handleCopy = async () => {
    const success = await copyToClipboard(fullMessage);
    if (success) {
      setCopied(true);
      toast.success("Đã copy link giới thiệu");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleZaloShare = () => {
    window.open(getZaloShareUrl(shareUrl), "_blank");
  };

  const handleFacebookShare = () => {
    window.open(getFacebookShareUrl(shareUrl), "_blank");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Chia sẻ mã giới thiệu</DialogTitle>
          <DialogDescription>
            Mã của bạn: <b className="text-primary">{referralCode}</b>. Gửi
            liên kết bên dưới cho bạn bè để nhận ưu đãi.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center space-x-2">
            <Input
              value={shareUrl}
              readOnly
              className="flex-1 text-xs"
            />
            <Button size="icon" onClick={handleCopy} variant="outline">
              {copied ? (
                <Check className="w-4 h-4 text-green-600" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button
              variant="outline"
              className="w-full gap-2 text-blue-600 border-blue-200 hover:bg-blue-50"
              onClick={handleZaloShare}
            >
              <MessageCircle className="w-4 h-4" />
              Gửi qua Zalo
            </Button>

            <Button
              variant="outline"
              className="w-full gap-2 text-blue-800 border-blue-200 hover:bg-blue-50"
              onClick={handleFacebookShare}
            >
              <Facebook className="w-4 h-4" />
              Facebook
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
