import { useMemo, useState } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
} from "recharts";
import { Building2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { EmploymentHistoryRecord } from "@/lib/employment";
import type { UserRecord } from "@/lib/pocketbase";
import type { FactoryRecord } from "@/lib/factories";

interface RecruitChartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  histories: EmploymentHistoryRecord[];
  users: UserRecord[];
  factories: FactoryRecord[];
}

function daysAgoIso(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const chartConfig = {
  joined: { label: "Tuyển mới", color: "oklch(0.65 0.2 250)" },
  working: { label: "Còn đi làm", color: "oklch(0.7 0.18 145)" },
} satisfies ChartConfig;

export function RecruitChartDialog({
  open,
  onOpenChange,
  histories,
  users,
  factories,
}: RecruitChartDialogProps) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const dailyData = useMemo(() => {
    const days: { date: string; label: string; joined: number; working: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const dateStr = daysAgoIso(i);
      const label = new Date(dateStr + "T00:00:00").toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
      });

      const joined = histories.filter((h) => h.join_date === dateStr).length;

      let working = 0;
      for (const h of histories) {
        if (!h.join_date || h.join_date > dateStr) continue;
        if (!h.leave_date || h.leave_date > dateStr) working++;
      }

      days.push({ date: dateStr, label, joined, working });
    }
    return days;
  }, [histories]);

  const userById = useMemo(
    () => new Map(users.map((u) => [u.id, u])),
    [users],
  );

  const factoryById = useMemo(
    () => new Map(factories.map((f) => [f.id, f])),
    [factories],
  );

  const breakdown = useMemo(() => {
    if (!selectedDay) return [];

    const dayHistories = histories.filter((h) => h.join_date === selectedDay);

    const factoryMap = new Map<string, Map<string, number>>();
    for (const h of dayHistories) {
      const fid = h.factory || "__none__";
      const rid = h.recruiter_staff || "__none__";
      if (!factoryMap.has(fid)) factoryMap.set(fid, new Map());
      const rMap = factoryMap.get(fid)!;
      rMap.set(rid, (rMap.get(rid) || 0) + 1);
    }

    return [...factoryMap.entries()]
      .map(([factoryId, recruiterMap]) => {
        const factory = factoryById.get(factoryId);
        const recruiters = [...recruiterMap.entries()]
          .filter(([, count]) => count > 0)
          .map(([recruiterId, count]) => {
            const user = userById.get(recruiterId);
            return {
              id: recruiterId,
              name: user?.full_name || user?.username || "Không xác định",
              username: user?.username || "",
              count,
              isVendor: user?.username?.startsWith("vd_") ?? false,
            };
          })
          .sort((a, b) => b.count - a.count);

        const total = recruiters.reduce((s, r) => s + r.count, 0);
        return {
          factoryId,
          factoryName: factory?.name || "Không xác định",
          total,
          recruiters,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [selectedDay, histories, userById, factoryById]);

  const handleBarClick = (data: { date?: string } | undefined) => {
    if (data?.date) {
      setSelectedDay((prev) => (prev === data.date ? null : data.date!));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-2xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Biểu đồ tuyển dụng 7 ngày</DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto">
          <ChartContainer config={chartConfig} className="h-[220px] w-full">
            <ComposedChart
              data={dailyData}
              margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar
                dataKey="joined"
                radius={[4, 4, 0, 0]}
                cursor="pointer"
                onClick={(_: unknown, index: number) =>
                  handleBarClick(dailyData[index])
                }
              >
                {dailyData.map((entry) => (
                  <Cell
                    key={entry.date}
                    fill={
                      selectedDay === entry.date
                        ? "oklch(0.55 0.22 250)"
                        : "var(--color-joined)"
                    }
                  />
                ))}
              </Bar>
              <Line
                type="monotone"
                dataKey="working"
                stroke="var(--color-working)"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ChartContainer>

          {selectedDay && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground">
                Chi tiết tuyển mới ngày{" "}
                {new Date(selectedDay + "T00:00:00").toLocaleDateString("vi-VN")}
              </p>

              {breakdown.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Không có dữ liệu tuyển mới ngày này.
                </p>
              )}

              {breakdown.map((group) => (
                <div
                  key={group.factoryId}
                  className="rounded-xl border bg-card p-3 space-y-1.5"
                >
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{group.factoryName}</span>
                    <span className="text-muted-foreground">— {group.total}</span>
                  </div>

                  <div className="space-y-1 pl-5">
                    {group.recruiters.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center gap-1.5 text-xs"
                      >
                        <span className="text-foreground">{r.name}</span>
                        {r.isVendor && (
                          <span className="rounded-full bg-purple-600 px-2 py-0.5 text-[10px] font-medium leading-none text-white">
                            vendor
                          </span>
                        )}
                        <span className="ml-auto font-medium tabular-nums">
                          {r.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
