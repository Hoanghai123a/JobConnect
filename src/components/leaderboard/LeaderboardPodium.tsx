import { Crown, Medal } from "lucide-react";
import type { LeaderboardEntry } from "@/lib/leaderboard";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { fileUrl } from "@/lib/pocketbase";

interface LeaderboardPodiumProps {
  entries: LeaderboardEntry[]; // Top 3
  className?: string;
}

interface PodiumCardProps {
  entry: LeaderboardEntry;
  position: "left" | "center" | "right";
}

function PodiumCard({ entry, position }: PodiumCardProps) {
  const colors = {
    1: {
      bg: "bg-amber-50/80",
      border: "border-amber-400",
      text: "text-amber-600",
      step: "bg-amber-400 text-amber-950",
      ring: "#FFD700",
    },
    2: {
      bg: "bg-slate-50",
      border: "border-slate-300",
      text: "text-slate-600",
      step: "bg-slate-300 text-slate-900",
      ring: "#C0C0C0",
    },
    3: {
      bg: "bg-orange-50/80",
      border: "border-orange-300",
      text: "text-orange-700",
      step: "bg-orange-300 text-orange-950",
      ring: "#CD7F32",
    },
  }[entry.rank] || {
    bg: "bg-background",
    border: "border-border",
    text: "text-foreground",
    step: "bg-muted text-foreground",
    ring: "transparent",
  };

  const heightClass = {
    center: "min-h-[300px]", // Rank 1 - cao nhất
    right: "min-h-[265px]", // Rank 2
    left: "min-h-[235px]", // Rank 3
  }[position];

  return (
    <div
      aria-label={`Hạng ${entry.rank}: ${entry.fullName}`}
      className={cn(
        "flex w-full max-w-[280px] flex-col items-center justify-end overflow-hidden rounded-lg border-2 px-4 pt-5 transition-shadow hover:shadow-md",
        heightClass,
        colors.bg,
        colors.border,
      )}
    >
      <div className={cn("mb-3 flex h-9 items-center", colors.text)}>
        {entry.rank === 1 ? <Crown className="h-8 w-8" /> : <Medal className="h-7 w-7" />}
      </div>

      <Avatar
        className="mb-3 h-16 w-16 shrink-0 ring-2 ring-offset-2"
        style={{ outline: `2px solid ${colors.ring}`, outlineOffset: "2px" }}
      >
        <AvatarImage src={fileUrl(entry.avatarRecord, entry.avatar)} alt={entry.fullName} />
        <AvatarFallback>{entry.fullName.charAt(0)}</AvatarFallback>
      </Avatar>

      <div className="mb-2 min-w-0 max-w-full text-center">
        <div className="truncate text-sm font-semibold" title={entry.fullName}>
          {entry.fullName}
        </div>
        {entry.employeeCode && (
          <div className="truncate text-xs text-muted-foreground">{entry.employeeCode}</div>
        )}
        {entry.factoryName && (
          <div className="truncate text-xs text-muted-foreground" title={entry.factoryName}>
            {entry.factoryName}
          </div>
        )}
      </div>

      <div className={cn("text-2xl font-bold tabular-nums", colors.text)}>
        {entry.totalHours.toFixed(1)}h
      </div>
      <div className="text-xs text-muted-foreground">
        HC: {entry.hcHours}h · TC: {entry.tcHours}h
      </div>

      <div
        className={cn(
          "mt-4 flex h-14 w-full items-center justify-center rounded-t-md",
          colors.step,
        )}
      >
        <span className="text-2xl font-black tabular-nums">#{entry.rank}</span>
      </div>
    </div>
  );
}

export function LeaderboardPodium({ entries, className }: LeaderboardPodiumProps) {
  if (entries.length === 0) {
    return (
      <div className={cn("text-center py-12", className)}>
        <div className="text-muted-foreground">Chưa có dữ liệu xếp hạng</div>
      </div>
    );
  }

  // The admin factory filter can pass entries whose original ranks start above 1.
  // The podium always represents the first three entries in the current view.
  const podiumEntries = entries.slice(0, 3).map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));
  const rank1 = podiumEntries[0];
  const rank2 = podiumEntries[1];
  const rank3 = podiumEntries[2];

  return (
    <div className={cn("w-full", className)}>
      {/* Desktop: Grid layout - Rank 3 (trái), Rank 1 (giữa, cao nhất), Rank 2 (phải) */}
      <div className="hidden md:grid md:grid-cols-3 gap-4 items-end">
        {/* Rank 3 - Left */}
        <div className="flex justify-center">
          {rank3 && <PodiumCard entry={rank3} position="left" />}
        </div>

        {/* Rank 1 - Center */}
        <div className="flex justify-center">
          {rank1 && <PodiumCard entry={rank1} position="center" />}
        </div>

        {/* Rank 2 - Right */}
        <div className="flex justify-center">
          {rank2 && <PodiumCard entry={rank2} position="right" />}
        </div>
      </div>

      {/* Mobile: Stack layout - Top to bottom */}
      <div className="md:hidden space-y-4">
        {rank1 && <PodiumCard entry={rank1} position="center" />}
        {rank2 && <PodiumCard entry={rank2} position="right" />}
        {rank3 && <PodiumCard entry={rank3} position="left" />}
      </div>
    </div>
  );
}
