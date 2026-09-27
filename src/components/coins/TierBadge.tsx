import { cn } from "@/lib/utils";
import { Award } from "lucide-react";

type Tier = "bronze" | "silver" | "gold" | "platinum";

interface TierBadgeProps {
  tier: Tier;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
  className?: string;
}

const tierConfig = {
  bronze: {
    label: "Đồng",
    className: "bg-amber-100 text-amber-800 border-amber-300",
    iconClassName: "text-amber-600",
  },
  silver: {
    label: "Bạc",
    className: "bg-slate-100 text-slate-800 border-slate-300",
    iconClassName: "text-slate-600",
  },
  gold: {
    label: "Vàng",
    className: "bg-yellow-100 text-yellow-800 border-yellow-300",
    iconClassName: "text-yellow-600",
  },
  platinum: {
    label: "Bạch kim",
    className: "bg-cyan-100 text-cyan-800 border-cyan-300",
    iconClassName: "text-cyan-600",
  },
};

export function TierBadge({ tier, size = "md", showIcon = true, className }: TierBadgeProps) {
  const config = tierConfig[tier];

  const sizeClasses = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-2.5 py-1",
    lg: "text-base px-3 py-1.5",
  };

  const iconSizes = {
    sm: "h-3 w-3",
    md: "h-3.5 w-3.5",
    lg: "h-4 w-4",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-medium",
        config.className,
        sizeClasses[size],
        className
      )}
    >
      {showIcon && <Award className={cn(config.iconClassName, iconSizes[size])} />}
      <span>{config.label}</span>
    </div>
  );
}
