import { useState } from "react";
import { Search } from "lucide-react";
import type { LeaderboardEntry } from "@/lib/leaderboard";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RankBadge } from "./RankBadge";
import { cn } from "@/lib/utils";
import { fileUrl } from "@/lib/pocketbase";

interface LeaderboardTableProps {
  entries: LeaderboardEntry[]; // From rank 4+
  currentUserId?: string;
  showSearch?: boolean;
  className?: string;
}

export function LeaderboardTable({
  entries,
  currentUserId,
  showSearch = true,
  className,
}: LeaderboardTableProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredEntries = entries.filter((entry) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      entry.fullName.toLowerCase().includes(query) ||
      entry.employeeCode.toLowerCase().includes(query) ||
      entry.factoryName.toLowerCase().includes(query)
    );
  });

  if (entries.length === 0) {
    return (
      <div className={cn("text-center py-8", className)}>
        <div className="text-muted-foreground">Không có dữ liệu ngoài top 3</div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Search */}
      {showSearch && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Tìm theo họ tên, mã NV hoặc nhà máy..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      )}

      {/* Desktop Table */}
      <div className="hidden md:block rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Hạng</TableHead>
              <TableHead>Nhân viên</TableHead>
              <TableHead className="w-32">Mã NV</TableHead>
              <TableHead>Nhà máy</TableHead>
              <TableHead className="w-24 text-right">Giờ HC</TableHead>
              <TableHead className="w-24 text-right">Giờ TC</TableHead>
              <TableHead className="w-24 text-right">Tổng giờ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEntries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Không tìm thấy kết quả
                </TableCell>
              </TableRow>
            ) : (
              filteredEntries.map((entry) => {
                const isCurrentUser = entry.userId === currentUserId;
                return (
                  <TableRow
                    key={entry.userId}
                    className={cn(isCurrentUser && "bg-primary/5 border-l-4 border-l-primary")}
                  >
                    <TableCell>
                      <RankBadge rank={entry.rank} size="sm" showIcon={false} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage
                            src={fileUrl(entry.avatarRecord, entry.avatar)}
                            alt={entry.fullName}
                          />
                          <AvatarFallback>{entry.fullName.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{entry.fullName}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.employeeCode || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.factoryName || "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {entry.hcHours.toFixed(1)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {entry.tcHours.toFixed(1)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {entry.totalHours.toFixed(1)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Card List */}
      <div className="md:hidden space-y-3">
        {filteredEntries.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">Không tìm thấy kết quả</div>
        ) : (
          filteredEntries.map((entry) => {
            const isCurrentUser = entry.userId === currentUserId;
            return (
              <div
                key={entry.userId}
                className={cn(
                  "rounded-lg border p-4 space-y-3",
                  isCurrentUser && "bg-primary/5 border-primary",
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage
                        src={fileUrl(entry.avatarRecord, entry.avatar)}
                        alt={entry.fullName}
                      />
                      <AvatarFallback>{entry.fullName.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">{entry.fullName}</div>
                      <div className="text-sm text-muted-foreground">
                        {entry.employeeCode || "—"} · {entry.factoryName || "Chưa có nhà máy"}
                      </div>
                    </div>
                  </div>
                  <RankBadge rank={entry.rank} size="sm" />
                </div>

                <div className="flex justify-between text-sm">
                  <div>
                    <div className="text-muted-foreground">Giờ HC</div>
                    <div className="font-semibold">{entry.hcHours.toFixed(1)}h</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Giờ TC</div>
                    <div className="font-semibold">{entry.tcHours.toFixed(1)}h</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Tổng</div>
                    <div className="font-bold text-primary">{entry.totalHours.toFixed(1)}h</div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
