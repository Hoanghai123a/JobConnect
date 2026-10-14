import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Crown, Medal, Search } from "lucide-react";
import type { LeaderboardEntry } from "@/lib/leaderboard";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fileUrl } from "@/lib/pocketbase";
import { matchesLeaderboardSearch } from "@/lib/leaderboard-search";

interface LeaderboardRankingListProps {
  entries: LeaderboardEntry[];
  currentUserId?: string;
  visibleCount?: number;
  showSearch?: boolean;
  className?: string;
}

const rankStyles = {
  1: {
    row: "border-amber-300 bg-amber-50/80",
    rank: "bg-amber-400 text-amber-950 shadow-amber-200",
    avatar: "ring-amber-400",
    text: "text-amber-700",
  },
  2: {
    row: "border-slate-300 bg-slate-50",
    rank: "bg-slate-300 text-slate-900 shadow-slate-200",
    avatar: "ring-slate-400",
    text: "text-slate-700",
  },
  3: {
    row: "border-orange-300 bg-orange-50/80",
    rank: "bg-orange-300 text-orange-950 shadow-orange-200",
    avatar: "ring-orange-400",
    text: "text-orange-700",
  },
} as const;

function RankingRow({ entry, currentUserId }: { entry: LeaderboardEntry; currentUserId?: string }) {
  const specialStyle = rankStyles[entry.rank as 1 | 2 | 3];
  const isCurrentUser = entry.userId === currentUserId;
  const Icon = entry.rank === 1 ? Crown : entry.rank <= 3 ? Medal : null;

  return (
    <div
      className={cn(
        "grid grid-cols-[2rem_2.5rem_minmax(0,1fr)] items-center gap-x-2 gap-y-2 rounded-lg border px-3 py-3 transition-colors sm:min-h-[68px] sm:grid-cols-[2.5rem_3rem_minmax(0,1fr)_auto] sm:gap-x-4 sm:px-4",
        specialStyle?.row || "border-border bg-background hover:bg-muted/40",
        isCurrentUser && "border-primary bg-primary/5 ring-1 ring-primary/30",
      )}
    >
      <div
        className={cn(
          "col-start-1 row-start-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black tabular-nums shadow-sm sm:h-10 sm:w-10",
          entry.rank <= 3 && "sm:text-lg",
          specialStyle?.rank || "bg-muted text-muted-foreground",
        )}
      >
        {Icon ? <Icon aria-hidden="true" className="h-4 w-4 sm:h-5 sm:w-5" /> : `#${entry.rank}`}
      </div>

      <Avatar
        className={cn(
          "col-start-2 row-start-1 h-10 w-10 shrink-0 ring-2 ring-offset-2 sm:h-11 sm:w-11",
          specialStyle?.avatar || "ring-transparent",
        )}
      >
        <AvatarImage src={fileUrl(entry.avatarRecord, entry.avatar)} alt={entry.fullName} />
        <AvatarFallback>{entry.fullName.charAt(0)}</AvatarFallback>
      </Avatar>

      <div className="col-start-3 row-start-1 min-w-0">
        <div
          className={cn("break-words font-semibold leading-tight [overflow-wrap:anywhere]", specialStyle?.text)}
          title={entry.fullName}
        >
          {entry.fullName}
          {isCurrentUser && <span className="ml-1 text-xs font-medium text-primary">Bạn</span>}
        </div>
      </div>

      <div className="col-start-2 col-span-2 row-start-2 min-w-0 text-xs text-muted-foreground sm:col-start-3 sm:col-span-1 sm:row-start-2">
        <div className="break-words [overflow-wrap:anywhere]">Mã NV: {entry.employeeCode || "Chưa có mã NV"}</div>
        <div className="mt-0.5 break-words [overflow-wrap:anywhere]">Nhà máy: {entry.factoryName || "Chưa có nhà máy"}</div>
      </div>

      <div className="col-start-2 col-span-2 row-start-3 flex min-w-0 items-center justify-between gap-2 border-t border-current/10 pt-2 sm:col-start-4 sm:col-span-1 sm:row-start-1 sm:row-span-2 sm:flex-col sm:items-end sm:justify-center sm:gap-0 sm:border-0 sm:pt-0">
        <div className="text-[11px] text-muted-foreground sm:order-2 sm:text-xs">
          HC {entry.hcHours.toFixed(1)} · TC {entry.tcHours.toFixed(1)}
        </div>
        <div className={cn("shrink-0 text-base font-bold tabular-nums sm:order-1 sm:text-lg", specialStyle?.text)}>
          {entry.totalHours.toFixed(1)}h
        </div>
      </div>
    </div>
  );
}

export function LeaderboardRankingList({
  entries,
  currentUserId,
  visibleCount = 8,
  showSearch = false,
  className,
}: LeaderboardRankingListProps) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => matchesLeaderboardSearch(entry, query));
  }, [entries, query]);

  if (entries.length === 0) {
    return (
      <div className={cn("py-10 text-center text-muted-foreground", className)}>
        Chưa có dữ liệu xếp hạng
      </div>
    );
  }

  const displayedEntries = showAll ? filteredEntries : filteredEntries.slice(0, visibleCount);
  const canExpand = filteredEntries.length > visibleCount;

  return (
    <div className={cn("space-y-3", className)}>
      {showSearch && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm theo họ tên, mã NV hoặc nhà máy..."
            className="pl-9"
          />
        </div>
      )}

      {displayedEntries.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">Không tìm thấy kết quả</div>
      ) : (
        <div className="space-y-2">
          {displayedEntries.map((entry) => (
            <RankingRow key={entry.userId} entry={entry} currentUserId={currentUserId} />
          ))}
        </div>
      )}

      {canExpand && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => setShowAll((value) => !value)}
        >
          {showAll ? <ChevronUp /> : <ChevronDown />}
          {showAll ? "Thu gọn danh sách" : "Xem toàn bộ danh sách top"}
        </Button>
      )}
    </div>
  );
}
