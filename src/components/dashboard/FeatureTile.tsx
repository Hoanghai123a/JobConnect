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
  badge,
  disabled = false,
  disabledReason,
}: Props) {
  const [open, setOpen] = useState(false);

  const tileClass = cn(
    "group relative flex flex-col gap-3 rounded-2xl border bg-card p-4 transition-all text-left",
    "shadow-soft",
    disabled
      ? "cursor-pointer opacity-60 hover:opacity-75"
      : "hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)] active:scale-[0.98]",
  );

  const iconClass = cn(
    "flex h-11 w-11 items-center justify-center rounded-xl text-primary-foreground shadow-sm",
    variant === "accent" ? "gradient-accent text-accent-foreground" : "gradient-primary",
    disabled && "grayscale",
  );

  const content = (
    <>
      <div className={iconClass}>
        <Icon className="h-5 w-5" />
      </div>
      {disabled ? (
        <span className="absolute right-3 top-3 inline-flex items-center justify-center rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">
          <Lock className="h-3 w-3" />
        </span>
      ) : (
        badge && (
          <span className="absolute right-3 top-3 inline-flex min-w-6 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm">
            {badge}
          </span>
        )
      )}
      <div>
        <div className="text-sm font-semibold tracking-tight">{label}</div>
        {description && (
          <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {description}
          </div>
        )}
      </div>
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
