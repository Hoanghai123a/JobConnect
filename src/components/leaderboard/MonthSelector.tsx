import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

interface MonthSelectorProps {
  id?: string;
  value: string; // Format: "YYYY-MM"
  onChange: (value: string) => void;
  className?: string;
  inputClassName?: string;
}

export function MonthSelector({ id, value, onChange, className, inputClassName }: MonthSelectorProps) {
  return (
    <div className={cn("relative inline-flex items-center gap-2", className)}>
      <Calendar aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
      <input
        id={id}
        name="month"
        type="month"
        value={value}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          inputClassName,
        )}
      />
    </div>
  );
}
