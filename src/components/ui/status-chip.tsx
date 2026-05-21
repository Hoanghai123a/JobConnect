import { cn } from "@/lib/utils";

export type ChipTone = "neutral" | "info" | "success" | "warning" | "danger" | "primary";

export function StatusChip({
  tone = "neutral",
  children,
  className,
  icon: Icon,
}: {
  tone?: ChipTone;
  children: React.ReactNode;
  className?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <span className={cn("chip", `chip-${tone}`, className)}>
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </span>
  );
}

export const toneBorder: Record<ChipTone, string> = {
  neutral: "border-l-[color:var(--status-neutral)]",
  info: "border-l-[color:var(--status-info)]",
  success: "border-l-[color:var(--status-success)]",
  warning: "border-l-[color:var(--status-warning)]",
  danger: "border-l-[color:var(--status-danger)]",
  primary: "border-l-primary",
};
