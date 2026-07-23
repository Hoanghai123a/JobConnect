import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Lock, LucideIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface Props {
  to: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  variant?: "default" | "accent";
  size?: "default" | "compact";
  badge?: string;
  disabled?: boolean;
  disabledReason?: string;
}

export function FeatureTile({
  to,
  label,
  description,
  icon: Icon,
  variant = "default",
  size = "default",
  badge,
  disabled = false,
  disabledReason,
}: Props) {
  const [open, setOpen] = useState(false);

  const isCompact = size === "compact";

  const tileClass = cn(
    "group relative flex rounded-2xl border bg-card transition-all text-left shadow-soft",
    isCompact ? "flex-col items-center gap-1.5 p-2.5" : "flex-col gap-3 p-4",
    disabled
      ? "cursor-pointer opacity-60 hover:opacity-75"
      : "hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)] active:scale-[0.98]",
  );

  const iconClass = cn(
    "flex items-center justify-center rounded-xl text-primary-foreground shadow-sm",
    isCompact ? "h-10 w-10" : "h-11 w-11",
    variant === "accent" ? "gradient-accent text-accent-foreground" : "gradient-primary",
    disabled && "grayscale",
  );

  const content = (
    <>
      <div className={iconClass}>
        <Icon className={isCompact ? "h-[18px] w-[18px]" : "h-5 w-5"} />
      </div>
      {disabled ? (
        <span
          className={cn(
            "absolute inline-flex items-center justify-center rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground",
            isCompact ? "right-1.5 top-1.5" : "right-3 top-3",
          )}
        >
          <Lock className="h-3 w-3" />
        </span>
      ) : (
        badge && (
          <span
            className={cn(
              "absolute inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm",
              isCompact ? "right-1.5 top-1.5" : "right-3 top-3",
            )}
          >
            {badge}
          </span>
        )
      )}
      {isCompact ? (
        <div className="w-full min-w-0 text-center">
          <div className="truncate text-[12px] font-semibold leading-tight tracking-tight">
            {label}
          </div>
        </div>
      ) : (
        <div>
          <div className="text-sm font-semibold tracking-tight">{label}</div>
          {description && (
            <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              {description}
            </div>
          )}
        </div>
      )}
    </>
  );

  if (disabled) {
    return (
      <>
        <button type="button" onClick={() => setOpen(true)} className={tileClass}>
          {content}
        </button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="rounded-2xl">
            <DialogHeader>
              <DialogTitle>{label}</DialogTitle>
              <DialogDescription>
                {disabledReason ||
                  "Tính năng này dành cho nhân sự đã được admin xác nhận. Vui lòng liên hệ admin để được gắn mã NV và nhà máy."}
              </DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Link to={to as any} className={tileClass}>
      {content}
    </Link>
  );
}
