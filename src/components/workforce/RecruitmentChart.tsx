import { useMemo, useState } from "react";
import { Bar, CartesianGrid, Cell, ComposedChart, LabelList, Line, XAxis, YAxis } from "recharts";
import { Building2 } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { EmploymentHistoryRecord } from "@/lib/employment";
import type { FactoryRecord } from "@/lib/factories";
import type { UserRecord } from "@/lib/pocketbase";

export type RecruitmentChartProps = {
  histories: EmploymentHistoryRecord[];
  users: UserRecord[];
  factories: FactoryRecord[];
};

type DailyRecruitment = {
  date: string;
  label: string;
  joined: number;
  working: number;
};

function daysAgoIso(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const chartConfig = {
  joined: { label: "Tuyển mới", color: "oklch(0.65 0.2 250)" },
  working: { label: "Còn đi làm", color: "oklch(0.7 0.18 145)" },
} satisfies ChartConfig;

export function RecruitmentChart({ histories, users, factories }: RecruitmentChartProps) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const dailyData = useMemo(() => {
    const days: DailyRecruitment[] = [];
    for (let i = 6; i >= 0; i--) {
      const dateStr = daysAgoIso(i);
      const label = new Date(`${dateStr}T00:00:00`).toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
      });

      const joined = histories.filter((h) => h.join_date?.slice(0, 10) === dateStr).length;
      let working = 0;
      for (const h of histories) {
        if (!h.join_date || h.join_date.slice(0, 10) > dateStr) continue;
        if (!h.leave_date || h.leave_date.slice(0, 10) > dateStr) working++;
      }

      days.push({ date: dateStr, label, joined, working });
    }
    return days;
  }, [histories]);

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const factoryById = useMemo(() => new Map(factories.map((f) => [f.id, f])), [factories]);

  const breakdown = useMemo(() => {
    if (!selectedDay) return [];

    const dayHistories = histories.filter((h) => h.join_date?.slice(0, 10) === selectedDay);
    const factoryMap = new Map<string, Map<string, number>>();

    for (const h of dayHistories) {
      const factoryId = h.factory || "__none__";
      const recruiterId = h.recruiter_staff || "__none__";
      if (!factoryMap.has(factoryId)) factoryMap.set(factoryId, new Map());
      const recruiterMap = factoryMap.get(factoryId)!;
      recruiterMap.set(recruiterId, (recruiterMap.get(recruiterId) || 0) + 1);
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

        return {
          factoryId,
          factoryName: factory?.name || "Không xác định",
          total: recruiters.reduce((sum, item) => sum + item.count, 0),
          recruiters,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [factoryById, histories, selectedDay, userById]);

  return (
    <div className="space-y-4">
      <ChartContainer config={chartConfig} className="h-[240px] w-full">
        <ComposedChart data={dailyData} margin={{ top: 16, right: 4, bottom: 0, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} />
          <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar
            yAxisId="left"
            dataKey="joined"
            radius={[4, 4, 0, 0]}
            cursor="pointer"
            onClick={(_: unknown, index: number) => setSelectedDay(dailyData[index]?.date || null)}
          >
            <LabelList
              dataKey="joined"
              position="top"
              fontSize={11}
              fontWeight={600}
              formatter={(value: number) => (value > 0 ? value : "")}
            />
            {dailyData.map((entry) => (
              <Cell
                key={entry.date}
                fill={selectedDay === entry.date ? "oklch(0.55 0.22 250)" : "var(--color-joined)"}
              />
            ))}
          </Bar>
          <Line
            yAxisId="right"
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
            {new Date(`${selectedDay}T00:00:00`).toLocaleDateString("vi-VN")}
          </p>

          {breakdown.length === 0 && (
            <p className="text-xs text-muted-foreground">Không có dữ liệu tuyển mới ngày này.</p>
          )}

          {breakdown.map((group) => {
            const internal = group.recruiters.filter((item) => !item.isVendor);
            const vendors = group.recruiters.filter((item) => item.isVendor);
            const internalTotal = internal.reduce((sum, item) => sum + item.count, 0);
            const vendorTotal = vendors.reduce((sum, item) => sum + item.count, 0);
            const internalPct = group.total ? Math.round((internalTotal / group.total) * 100) : 0;
            const vendorPct = group.total ? Math.round((vendorTotal / group.total) * 100) : 0;

            return (
              <div key={group.factoryId} className="space-y-2 rounded-xl border bg-card p-3">
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{group.factoryName}</span>
                  <span className="text-muted-foreground">— {group.total}</span>
                </div>

                {internal.length > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 pl-5 text-[11px] font-semibold text-muted-foreground">
                      <span>Nội bộ</span>
                      <span className="ml-auto tabular-nums">
                        {internalTotal} ({internalPct}%)
                      </span>
                    </div>
                    <div className="space-y-0.5 pl-5">
                      {internal.map((item) => (
                        <div key={item.id} className="flex items-center gap-1.5 text-xs">
                          <span className="text-foreground">{item.name}</span>
                          <span className="ml-auto font-medium tabular-nums">{item.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {vendors.length > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 pl-5 text-[11px] font-semibold text-purple-600">
                      <span>Đối tác</span>
                      <span className="ml-auto tabular-nums">
                        {vendorTotal} ({vendorPct}%)
                      </span>
                    </div>
                    <div className="space-y-0.5 pl-5">
                      {vendors.map((item) => (
                        <div key={item.id} className="flex items-center gap-1.5 text-xs">
                          <span className="text-foreground">{item.name}</span>
                          <span className="rounded-full bg-purple-600 px-2 py-0.5 text-[10px] font-medium leading-none text-white">
                            Đối tác
                          </span>
                          <span className="ml-auto font-medium tabular-nums">{item.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
