import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

interface MonthSelectorProps {
  id?: string;
  value: string; // Format: "YYYY-MM"
  onChange: (value: string) => void;
  className?: string;
  inputClassName?: string;
}

export function MonthSelector({
  id,
  value,
  onChange,
  className,
  inputClassName,
}: MonthSelectorProps) {
  const displayValue = value ? value.split("-").reverse().join("/") : "";

  return (
    <div className={cn("relative inline-flex min-w-0 flex-1", className)}>
      <input
        id={id}
        name="month"
        type="text"
        inputMode="numeric"
        placeholder="MM/YYYY"
        value={displayValue}
        autoComplete="off"
        onChange={(e) => {
          const input = e.target.value.replace(/[^\d/]/g, "");
          const digits = input.replace(/\D/g, "").slice(0, 6);

          let formatted = digits;
          if (digits.length > 2) {
            formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
          }

          const [month, year] = formatted.split("/");

          if (month && month.length === 2 && Number(month) > 12) {
            return;
          }

          if (
            month?.length === 2 &&
            year?.length === 4 &&
            Number(month) >= 1 &&
            Number(month) <= 12
          ) {
            onChange(`${year}-${month}`);
          } else {
            onChange("");
          }
        }}
        className={cn(
          "w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          inputClassName,
        )}
      />
    </div>
  );
}
