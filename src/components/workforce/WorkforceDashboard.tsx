import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, ClipboardCheck, UserRoundMinus } from "lucide-react";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import type { EmploymentHistoryRecord } from "@/lib/employment";
import type { FactoryRecord } from "@/lib/factories";
import type { UserRecord } from "@/lib/pocketbase";
import { RecruitmentChart } from "./RecruitmentChart";
import { WorkforceInsightsCharts } from "./WorkforceInsightsCharts";
import { getWorkforceSummary, isIsoDate, localIsoDate, shiftIsoDate } from "./workforce-stats";

const STORAGE_KEY = "jobconnect:workforce-dashboard-date-range";

type DateRange = { from: string; to: string };

function defaultRange(): DateRange {
  const to = localIsoDate();
  return { from: shiftIsoDate(to, -6), to };
}

function validRange(value: unknown): value is DateRange {
  if (!value || typeof value !== "object") return false;
  const range = value as DateRange;
  const today = localIsoDate();
  return (
    isIsoDate(range.from) && isIsoDate(range.to) && range.from <= range.to && range.to <= today
  );
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("vi-VN");
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof CalendarCheck;
  tone: "success" | "primary" | "warning";
}) {
  const tones = {
    success: "bg-emerald-500/10 text-emerald-600",
    primary: "bg-primary/10 text-primary",
    warning: "bg-amber-500/10 text-amber-600",
  };
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

export function WorkforceDashboard({
  histories,
  users,
  factories,
  loading,
  error,
  onRetry,
  detailHref,
}: {
  histories: EmploymentHistoryRecord[];
  users: UserRecord[];
  factories: FactoryRecord[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  detailHref: string;
}) {
  const [range, setRange] = useState<DateRange>(defaultRange);
  const [storageReady, setStorageReady] = useState(false);
  const today = localIsoDate();

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
      if (validRange(saved)) setRange(saved);
    } catch {
      // Keep the default seven-day range when saved data is invalid.
    } finally {
      setStorageReady(true);
    }
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(range));
  }, [range, storageReady]);

  const summary = useMemo(
    () => getWorkforceSummary(histories, range.from, range.to),
    [histories, range],
  );

  const setPreset = (days: number) =>
    setRange({ from: shiftIsoDate(today, -(days - 1)), to: today });

  return (
    <div className="space-y-4">
      <section className="sticky top-20 z-20 -mx-2 space-y-3 bg-background/95 px-2 py-2 backdrop-blur">
        <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-4 shadow-soft desktop:flex-row desktop:items-end">
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="workforce-from">Từ ngày</Label>
              <DateInput
                id="workforce-from"
                value={range.from}
                max={range.to}
                onChange={(from) =>
                  isIsoDate(from) && setRange((current) => ({ ...current, from }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="workforce-to">Đến ngày</Label>
              <DateInput
                id="workforce-to"
                value={range.to}
                min={range.from}
                max={today}
                onChange={(to) => isIsoDate(to) && setRange((current) => ({ ...current, to }))}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Hôm nay", days: 1 },
              { label: "7 ngày", days: 7 },
              { label: "30 ngày", days: 30 },
              { label: "90 ngày", days: 90 },
            ].map((preset) => (
              <button
                key={preset.days}
                type="button"
                onClick={() => setPreset(preset.days)}
                className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SummaryCard
            label="Còn đi làm"
            value={summary.working}
            icon={CalendarCheck}
            tone="success"
          />
          <SummaryCard
            label="Tuyển mới"
            value={summary.joined}
            icon={ClipboardCheck}
            tone="primary"
          />
          <SummaryCard label="Đã nghỉ" value={summary.left} icon={UserRoundMinus} tone="warning" />
        </div>
      </section>

      <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-soft">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Biểu đồ nhân lực theo ngày</h3>
            <p className="text-xs text-muted-foreground">
              Từ {formatDate(range.from)} đến {formatDate(range.to)} · Tuyển mới, còn đi làm và phát
              sinh nghỉ.
            </p>
          </div>
          <a
            href={detailHref}
            className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            Xem chi tiết
          </a>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            Đang tải dữ liệu nhân lực...
          </div>
        ) : error ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-destructive/40 bg-destructive/5 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="rounded-xl bg-primary px-4 py-2 text-xs font-medium text-primary-foreground"
            >
              Thử lại
            </button>
          </div>
        ) : histories.length === 0 ? (
          <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed text-sm text-muted-foreground">
            Chưa có dữ liệu nhân lực.
          </div>
        ) : (
          <RecruitmentChart
            histories={histories}
            users={users}
            factories={factories}
            from={range.from}
            to={range.to}
          />
        )}
      </section>

      {!loading && !error && (
        <WorkforceInsightsCharts
          histories={histories}
          users={users}
          factories={factories}
          from={range.from}
          to={range.to}
        />
      )}
    </div>
  );
}
