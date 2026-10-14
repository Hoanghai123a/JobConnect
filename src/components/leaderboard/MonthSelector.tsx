import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

interface MonthSelectorProps {
  value: string; // Format: "YYYY-MM"
  onChange: (value: string) => void;
  className?: string;
}

export function MonthSelector({ value, onChange, className }: MonthSelectorProps) {
  return (
    <div className={cn("relative inline-flex items-center gap-2", className)}>
      <Calendar className="h-4 w-4 text-muted-foreground" />
      <input
        type="month"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  );
}
