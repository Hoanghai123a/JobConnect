import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusChip, ChipTone } from "@/components/ui/status-chip";

export interface FilterChip {
  key: string;
  label: string;
  tone?: ChipTone;
  count?: number;
}

export function FilterBar({
  search,
  onSearchChange,
  placeholder = "Tìm kiếm…",
  chips,
  activeChip,
  onChipChange,
  actions,
  chipActions,
  className,
}: {
  search?: string;
  onSearchChange?: (v: string) => void;
  placeholder?: string;
  chips?: FilterChip[];
  activeChip?: string;
  onChipChange?: (key: string) => void;
  actions?: React.ReactNode;
  chipActions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sticky top-[var(--header-h,3.25rem)] z-20 -mx-4 space-y-2 bg-background/85 px-4 py-2 backdrop-blur-md",
        className,
      )}
    >
      {onSearchChange && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search || ""}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={placeholder}
              className="h-10 w-full rounded-full border border-border bg-card pl-9 pr-9 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            {search && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                aria-label="Xoá tìm kiếm"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {actions}
        </div>
      )}
      {chips && chips.length > 0 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 scrollbar-none">
          {chips.map((c) => {
            const active = (activeChip ?? chips[0]?.key) === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => onChipChange?.(c.key)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1 text-[12px] font-medium transition",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-card text-muted-foreground border border-border",
                )}
              >
                {c.label}
                {typeof c.count === "number" && (
                  <span className={cn("ml-1.5 text-[10px]", active ? "opacity-80" : "opacity-60")}>
                    {c.count}
                  </span>
                )}
              </button>
            );
          })}
          {chipActions}
        </div>
      )}
    </div>
  );
}

// Re-export for convenience
export { StatusChip };
