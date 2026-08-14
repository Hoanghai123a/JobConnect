import { useMemo, useState } from "react";
import { Bar, CartesianGrid, Cell, ComposedChart, LabelList, Line, XAxis, YAxis } from "recharts";
import { Building2 } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { WorkforceDashboardDay, WorkforceLookups } from "@/lib/workforce-dashboard";

const chartConfig = {
  joined: { label: "Tuyển mới", color: "oklch(0.65 0.2 250)" },
  working: { label: "Còn đi làm", color: "oklch(0.7 0.18 145)" },
  left: { label: "Đã nghỉ", color: "oklch(0.68 0.2 35)" },
} satisfies ChartConfig;

export function WorkforceDailyChart({
  days,
  lookups,
}: {
  days: WorkforceDashboardDay[];
  lookups: WorkforceLookups | null;
}) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const factoryNames = useMemo(
    () => new Map((lookups?.factories || []).map((item) => [item.id, item.name])),
    [lookups],
  );
  const recruiterNames = useMemo(
    () =>
      new Map((lookups?.recruiters || []).map((item) => [`${item.source}:${item.id}`, item.name])),
    [lookups],
  );
  const data = useMemo(
    () =>
      days.map((day) => ({
        ...day,
        label: new Date(`${day.date}T12:00:00`).toLocaleDateString("vi-VN", {
          day: "2-digit",
          month: "2-digit",
        }),
      })),
    [days],
  );
  const selected = days.find((day) => day.date === selectedDay) || null;

  return (
    <>
      <ChartContainer config={chartConfig} className="h-[240px] w-full">
        <ComposedChart
          data={data}
          margin={{ top: 16, right: 4, bottom: 0, left: -8 }}
          onClick={(state) => {
            const value = state?.activePayload?.[0]?.payload as WorkforceDashboardDay | undefined;
            if (value?.date) setSelectedDay(value.date);
          }}
        >
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            interval="preserveStartEnd"
            minTickGap={12}
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            yAxisId="left"
            allowDecimals={false}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            allowDecimals={false}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar yAxisId="left" dataKey="joined" fill="var(--color-joined)" radius={[5, 5, 0, 0]}>
            <LabelList
              dataKey="joined"
              position="top"
              fontSize={11}
              fontWeight={600}
              formatter={(value: number) => (value > 0 ? value : "")}
            />
            {data.map((entry) => (
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
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="left"
            stroke="var(--color-left)"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </ChartContainer>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelectedDay(null)}>
        <DialogContent layout="raw" className="max-h-[88dvh] max-w-4xl overflow-hidden p-0">
          {selected && (
            <>
              <DialogHeader className="border-b px-5 pb-4 pt-5 pr-14">
                <DialogTitle>
                  Chi tiết tuyển mới ngày{" "}
                  {new Date(`${selected.date}T12:00:00`).toLocaleDateString("vi-VN")}
                </DialogTitle>
                <DialogDescription>
                  {selected.joined} lượt tuyển mới, {selected.left} phát sinh nghỉ và{" "}
                  {selected.working} người còn làm.
                </DialogDescription>
              </DialogHeader>
              <div className="grid max-h-[68dvh] gap-4 overflow-y-auto px-5 pb-5 desktop:grid-cols-2">
                {[...selected.factories]
                  .sort((a, b) => b.joined - a.joined)
                  .map((factory) => (
                    <section
                      key={factory.id}
                      className="rounded-2xl border border-border/70 bg-card p-4"
                    >
                      <div className="flex items-center gap-2 border-b pb-3 text-sm font-semibold">
                        <Building2 className="h-4 w-4 text-primary" />
                        <span className="min-w-0 flex-1 truncate">
                          {factoryNames.get(factory.id) || "Chưa gắn nhà máy"}
                        </span>
                        <span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
                          {factory.joined}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="rounded-xl bg-primary/5 p-2">
                          <strong className="block text-base text-primary">{factory.joined}</strong>
                          Tuyển mới
                        </div>
                        <div className="rounded-xl bg-amber-500/5 p-2">
                          <strong className="block text-base text-amber-600">{factory.left}</strong>
                          Đã nghỉ
                        </div>
                        <div className="rounded-xl bg-emerald-500/5 p-2">
                          <strong className="block text-base text-emerald-600">
                            {factory.working}
                          </strong>
                          Còn làm
                        </div>
                      </div>
                    </section>
                  ))}
                <section className="rounded-2xl border border-border/70 bg-card p-4 desktop:col-span-2">
                  <h4 className="mb-3 text-sm font-semibold">Theo người tuyển</h4>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[...selected.recruiters]
                      .sort((a, b) => b.joined - a.joined)
                      .map((item) => (
                        <div
                          key={`${item.source}:${item.id}`}
                          className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2 text-sm"
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {recruiterNames.get(`${item.source}:${item.id}`) ||
                              (item.source === "partner"
                                ? "Đối tác chưa xác định"
                                : "Nhân sự chưa xác định")}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {item.source === "partner" ? "Đối tác" : "Nội bộ"}
                          </span>
                          <strong className="tabular-nums text-primary">{item.joined}</strong>
                        </div>
                      ))}
                  </div>
                </section>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
