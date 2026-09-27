import { Coins } from "lucide-react";
import { cn } from "@/lib/utils";

interface CoinBalanceProps {
  coins: number;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
  className?: string;
}

export function CoinBalance({ coins, size = "md", showIcon = true, className }: CoinBalanceProps) {
  const sizeClasses = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg font-semibold",
  };

  const iconSizes = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  };

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {showIcon && <Coins className={cn("text-amber-500", iconSizes[size])} />}
      <span className={cn("font-medium text-foreground", sizeClasses[size])}>
        {coins.toLocaleString("vi-VN")}
      </span>
      <span className={cn("text-muted-foreground", sizeClasses[size])}>xu</span>
    </div>
  );
}
