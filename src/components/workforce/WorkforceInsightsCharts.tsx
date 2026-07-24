import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts";
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
import { isCurrentlyWorking, type EmploymentHistoryRecord } from "@/lib/employment";
import type { FactoryRecord } from "@/lib/factories";
import type { UserRecord } from "@/lib/pocketbase";

type WorkforceInsightsChartsProps = {
  histories: EmploymentHistoryRecord[];
  users: UserRecord[];
  factories: FactoryRecord[];
};

type InsightRow = {
  id: string;
  name: string;
  count: number;
};

type DetailKind = "staff" | "factory" | null;

const staffChartConfig = {
  count: { label: "Số lượt tuyển", color: "oklch(0.65 0.2 250)" },
} satisfies ChartConfig;

const factoryChartConfig = {
  count: { label: "Đang đi làm", color: "oklch(0.7 0.18 145)" },
} satisfies ChartConfig;

function historyTime(history: EmploymentHistoryRecord) {
  const time = new Date(history.join_date || history.created || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function InsightBarChart({
  rows,
  config,
  color,
  emptyMessage,
  minHeight,
}: {
  rows: InsightRow[];
  config: ChartConfig;
  color: string;
  emptyMessage: string;
  minHeight: number;
}) {
  if (rows.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-center text-sm text-muted-foreground"
        style={{ height: minHeight }}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <ChartContainer config={config} className="w-full" style={{ height: minHeight }}>
      <BarChart data={rows} margin={{ top: 20, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="name"
          interval={0}
          height={54}
          tick={{ fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => (value.length > 10 ? `${value.slice(0, 10)}\u2026` : value)}
        />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="count" radius={[5, 5, 0, 0]}>
          {rows.map((row) => (
            <Cell key={row.id} fill={color} />
          ))}
          <LabelList dataKey="count" position="top" fontSize={11} fontWeight={600} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

function DetailDialog({
  detail,
  rows,
  onOpenChange,
}: {
  detail: DetailKind;
  rows: InsightRow[];
  onOpenChange: (open: boolean) => void;
}) {
  const isStaff = detail === "staff";
  const title = isStaff ? "Toàn bộ Staff tuyển dụng" : "Toàn bộ nhà máy";
  const description = isStaff
    ? "Xếp hạng theo tổng số lượt tuyển được ghi nhận."
    : "Xếp hạng theo số lao động đang đi làm.";

  return (
    <Dialog open={detail !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Chưa có dữ liệu để hiển thị.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/70">
            <div className="max-h-[58dvh] divide-y divide-border/70 overflow-y-auto">
              {rows.map((row, index) => (
                <div key={row.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium" title={row.name}>
                    {row.name}
                  </span>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-primary">
                    {row.count} {isStaff ? "lượt" : "NLĐ"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function WorkforceInsightsCharts({
  histories,
  users,
  factories,
}: WorkforceInsightsChartsProps) {
  const [detail, setDetail] = useState<DetailKind>(null);
  const userById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const factoryById = useMemo(
    () => new Map(factories.map((factory) => [factory.id, factory])),
    [factories],
  );

  const allStaff = useMemo(() => {
    const counts = new Map<string, InsightRow>();

    for (const history of histories) {
      const staffId = history.recruiter_staff;
      if (!staffId) continue;

      const staff = history.expand?.recruiter_staff || userById.get(staffId);
      if (staff?.role && staff.role !== "staff") continue;

      const current = counts.get(staffId) || {
        id: staffId,
        name: staff?.full_name || staff?.username || "Staff chưa xác định",
        count: 0,
      };
      current.count++;
      counts.set(staffId, current);
    }

    return [...counts.values()].sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name, "vi"),
    );
  }, [histories, userById]);

  const allFactories = useMemo(() => {
    const latestByUser = new Map<string, EmploymentHistoryRecord>();
    for (const history of histories) {
      const current = latestByUser.get(history.user);
      if (!current || historyTime(history) > historyTime(current)) {
        latestByUser.set(history.user, history);
      }
    }

    const counts = new Map<string, InsightRow>();
    for (const history of latestByUser.values()) {
      if (!isCurrentlyWorking(history)) continue;

      const factoryId = history.factory || "__unassigned__";
      const factory = history.expand?.factory || factoryById.get(factoryId);
      const current = counts.get(factoryId) || {
        id: factoryId,
        name: factory?.name || "Chưa gắn nhà máy",
        count: 0,
      };
      current.count++;
      counts.set(factoryId, current);
    }

    return [...counts.values()].sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name, "vi"),
    );
  }, [factoryById, histories]);

  const detailRows = detail === "staff" ? allStaff : detail === "factory" ? allFactories : [];

  return (
    <>
      <div className="grid grid-cols-2 items-start gap-4">
        <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-soft">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold">Top 5 Staff tuyển dụng</h3>
              <p className="text-xs text-muted-foreground">
                Xếp hạng theo số lượt tuyển được ghi nhận.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDetail("staff")}
              className="shrink-0 rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              Xem toàn bộ
            </button>
          </div>
          <button
            type="button"
            onClick={() => setDetail("staff")}
            className="block w-full cursor-pointer rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            aria-label="Xem toàn bộ danh sách Staff tuyển dụng"
          >
            <InsightBarChart
              rows={allStaff.slice(0, 5)}
              config={staffChartConfig}
              color="var(--color-count)"
              minHeight={210}
              emptyMessage="Chưa có dữ liệu Staff tuyển dụng."
            />
          </button>
        </section>

        <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-soft">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold">Top 10 nhà máy</h3>
              <p className="text-xs text-muted-foreground">
                Số lao động đang đi làm theo dữ liệu hiện tại.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDetail("factory")}
              className="shrink-0 rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              Xem toàn bộ
            </button>
          </div>
          <button
            type="button"
            onClick={() => setDetail("factory")}
            className="block w-full cursor-pointer rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            aria-label="Xem toàn bộ danh sách nhà máy"
          >
            <InsightBarChart
              rows={allFactories.slice(0, 10)}
              config={factoryChartConfig}
              color="var(--color-count)"
              minHeight={300}
              emptyMessage="Chưa có dữ liệu lao động theo nhà máy."
            />
          </button>
        </section>
      </div>

      <DetailDialog
        detail={detail}
        rows={detailRows}
        onOpenChange={(open) => !open && setDetail(null)}
      />
    </>
  );
}
