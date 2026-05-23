import { Link } from "@tanstack/react-router";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  to: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  variant?: "default" | "accent";
  badge?: string;
}

export function FeatureTile({ to, label, description, icon: Icon, variant = "default", badge }: Props) {
  return (
    <Link
      to={to as any}
      className={cn(
        "group relative flex flex-col gap-3 rounded-2xl border bg-card p-4 transition-all",
        "shadow-soft hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]",
        "active:scale-[0.98]",
      )}
    >
      <div
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-xl text-primary-foreground shadow-sm",
          variant === "accent" ? "gradient-accent text-accent-foreground" : "gradient-primary",
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      {badge && (
        <span className="absolute right-3 top-3 inline-flex min-w-6 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm">
          {badge}
        </span>
      )}
      <div>
        <div className="text-sm font-semibold tracking-tight">{label}</div>
        {description && (
          <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {description}
          </div>
        )}
      </div>
    </Link>
  );
}
