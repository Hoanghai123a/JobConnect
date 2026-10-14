import { Award, Crown, Medal } from "lucide-react";
import { cn } from "@/lib/utils";

export type RankVariant = "gold" | "silver" | "bronze" | "primary" | "muted";
export type RankSize = "sm" | "md" | "lg";

interface RankBadgeProps {
  rank: number;
  variant?: RankVariant;
  size?: RankSize;
  showIcon?: boolean;
  className?: string;
}

function getRankVariant(rank: number): RankVariant {
  if (rank === 1) return "gold";
  if (rank === 2) return "silver";
  if (rank === 3) return "bronze";
  if (rank <= 10) return "primary";
  return "muted";
}

function getRankIcon(rank: number) {
  if (rank === 1) return Crown;
  if (rank === 2 || rank === 3) return Medal;
  return Award;
}

const variantClasses: Record<RankVariant, string> = {
  gold: "bg-[#FFD700]/20 text-[#FFD700] border-[#FFD700]/50",
  silver: "bg-[#C0C0C0]/20 text-[#C0C0C0] border-[#C0C0C0]/50",
  bronze: "bg-[#CD7F32]/20 text-[#CD7F32] border-[#CD7F32]/50",
  primary: "bg-primary/10 text-primary border-primary/20",
  muted: "bg-muted text-muted-foreground border-muted-foreground/20",
};

const sizeClasses: Record<RankSize, { container: string; icon: string; text: string }> = {
  sm: {
    container: "h-6 px-2 text-xs",
    icon: "h-3 w-3",
    text: "text-xs",
  },
  md: {
    container: "h-8 px-3 text-sm",
    icon: "h-4 w-4",
    text: "text-sm",
  },
  lg: {
    container: "h-10 px-4 text-base",
    icon: "h-5 w-5",
    text: "text-base",
  },
};

export function RankBadge({
  rank,
  variant,
  size = "md",
  showIcon = true,
  className,
}: RankBadgeProps) {
  const computedVariant = variant || getRankVariant(rank);
  const Icon = getRankIcon(rank);
  const sizeStyle = sizeClasses[size];

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold",
        variantClasses[computedVariant],
        sizeStyle.container,
        className,
      )}
    >
      {showIcon && <Icon className={sizeStyle.icon} />}
      <span className={sizeStyle.text}>#{rank}</span>
    </div>
  );
}
