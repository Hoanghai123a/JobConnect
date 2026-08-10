import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, ClipboardCheck, SlidersHorizontal, UserRoundMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { DataLoadingState } from "@/components/ui/data-loading-state";
import type { EmploymentHistoryRecord } from "@/lib/employment";
import type { FactoryRecord } from "@/lib/factories";
import type { UserRecord } from "@/lib/pocketbase";
import { RecruitmentChart } from "./RecruitmentChart";
import { WorkforceInsightsCharts } from "./WorkforceInsightsCharts";
import {
  filterWorkforceHistoriesByRecruitmentScope,
  getWorkforceSummary,
  isIsoDate,
  localIsoDate,
  shiftIsoDate,
  type RecruitmentSourceScope,
} from "./workforce-stats";

const STORAGE_KEY = "jobconnect:workforce-dashboard-date-range";
const RECRUITMENT_SCOPE_STORAGE_KEY = "jobconnect:workforce-dashboard-recruitment-scope";

type DateRange = { from: string; to: string };
type StoredDateRange = DateRange & { savedOn?: string };

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

function validRecruitmentScope(value: unknown): value is RecruitmentSourceScope {
  return value === "all" || value === "internal" || value === "partner";
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("vi-VN");
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone,
  compact = false,
}: {
  label: string;
  value: number;
  icon: typeof CalendarCheck;
  tone: "success" | "primary" | "warning";
  compact?: boolean;
}) {
  const tones = {
    success: "bg-emerald-500/10 text-emerald-600",
    primary: "bg-primary/10 text-primary",
    warning: "bg-amber-500/10 text-amber-600",
  };
  return (
    <div
      className={`rounded-2xl border border-border/70 bg-card shadow-soft ${compact ? "p-3" : "p-4"}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className={`${compact ? "mt-1 text-xl" : "mt-2 text-2xl"} font-bold tabular-nums`}>
        {value}
      </div>
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
  presentation = "default",
}: {
  histories: EmploymentHistoryRecord[];
  users: UserRecord[];
  factories: FactoryRecord[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  detailHref: string;
  presentation?: "default" | "mobile-dialog";
}) {
  const [range, setRange] = useState<DateRange>(defaultRange);
  const [recruitmentScope, setRecruitmentScope] = useState<RecruitmentSourceScope>("all");
  const [storageReady, setStorageReady] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftRange, setDraftRange] = useState<DateRange>(range);
  const [draftRecruitmentScope, setDraftRecruitmentScope] =
    useState<RecruitmentSourceScope>(recruitmentScope);
  const today = localIsoDate();
  const compactMobile = presentation === "mobile-dialog";

  useEffect(() => {
    try {
      const savedRange = JSON.parse(
        window.localStorage.getItem(STORAGE_KEY) || "null",
      ) as StoredDateRange | null;
      if (validRange(savedRange)) {
        const nextRange = savedRange.savedOn === today ? savedRange : { ...savedRange, to: today };
        if (validRange(nextRange)) setRange(nextRange);
      }

      const savedScope = JSON.parse(
        window.localStorage.getItem(RECRUITMENT_SCOPE_STORAGE_KEY) || "null",
      );
      if (validRecruitmentScope(savedScope)) setRecruitmentScope(savedScope);
    } catch {
      // Keep the default values when saved data is invalid or unavailable.
    } finally {
      setStorageReady(true);
    }
  }, [today]);

  useEffect(() => {
    if (!storageReady) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...range, savedOn: today }));
      window.localStorage.setItem(RECRUITMENT_SCOPE_STORAGE_KEY, JSON.stringify(recruitmentScope));
    } catch {
      // The dashboard remains usable when local storage is unavailable.
    }
  }, [range, recruitmentScope, storageReady, today]);

  const filteredHistories = useMemo(
    () => filterWorkforceHistoriesByRecruitmentScope(histories, users, recruitmentScope),
    [histories, recruitmentScope, users],
  );

  const summary = useMemo(
    () => getWorkforceSummary(filteredHistories, range.from, range.to),
    [filteredHistories, range],
  );

  const setPreset = (days: number) =>
    setRange({ from: shiftIsoDate(today, -(days - 1)), to: today });

  const openMobileFilter = () => {
    setDraftRange(range);
    setDraftRecruitmentScope(recruitmentScope);
    setFilterOpen(true);
  };

  const setDraftPreset = (days: number) =>
    setDraftRange({ from: shiftIsoDate(today, -(days - 1)), to: today });

  const applyMobileFilter = () => {
    if (!validRange(draftRange)) return;
    setRange(draftRange);
    setRecruitmentScope(draftRecruitmentScope);
    setFilterOpen(false);
  };

  const resetMobileFilter = () => {
    setDraftRange(defaultRange());
    setDraftRecruitmentScope("all");
  };

  return (
    <div className="space-y-4">
      <section
        className={
          compactMobile
            ? "space-y-3"
            : "sticky top-[calc(env(safe-area-inset-top)+4.5rem)] z-20 -mx-2 space-y-3 bg-background/95 px-2 py-2 backdrop-blur desktop:top-20"
        }
      >
        {compactMobile ? (
          <button
            type="button"
            onClick={openMobileFilter}
            className="flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-card p-3 text-left shadow-soft active:scale-[0.99]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <SlidersHorizontal className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-foreground">Bộ lọc nhân lực</span>
              <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                {formatDate(range.from)} – {formatDate(range.to)} ·{" "}
                {recruitmentScope === "all"
                  ? "Toàn bộ"
                  : recruitmentScope === "internal"
                    ? "Nội bộ"
                    : "Đối tác"}
              </span>
            </span>
            <span className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
              Bộ lọc
            </span>
          </button>
        ) : (
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
            <div className="space-y-1.5">
              <Label>Nguồn tuyển</Label>
              <div className="inline-flex rounded-xl border border-border bg-background p-1">
                <button
                  type="button"
                  aria-pressed={recruitmentScope === "all"}
                  onClick={() => setRecruitmentScope("all")}
                  className={`rounded-lg px-3 py-2 text-xs font-medium transition ${
                    recruitmentScope === "all"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  Toàn bộ
                </button>
                <button
                  type="button"
                  aria-pressed={recruitmentScope === "internal"}
                  onClick={() => setRecruitmentScope("internal")}
                  className={`rounded-lg px-3 py-2 text-xs font-medium transition ${
                    recruitmentScope === "internal"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  Nội bộ
                </button>
                <button
                  type="button"
                  aria-pressed={recruitmentScope === "partner"}
                  onClick={() => setRecruitmentScope("partner")}
                  className={`rounded-lg px-3 py-2 text-xs font-medium transition ${
                    recruitmentScope === "partner"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  Đối tác
                </button>
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
        )}
        <div
          className={
            compactMobile ? "grid grid-cols-3 gap-2" : "grid grid-cols-2 gap-3 sm:grid-cols-3"
          }
        >
          <SummaryCard
            label="Còn đi làm"
            value={summary.working}
            icon={CalendarCheck}
            tone="success"
            compact={compactMobile}
          />
          <SummaryCard
            label="Tuyển mới"
            value={summary.joined}
            icon={ClipboardCheck}
            tone="primary"
            compact={compactMobile}
          />
          <SummaryCard
            label="Đã nghỉ"
            value={summary.left}
            icon={UserRoundMinus}
            tone="warning"
            compact={compactMobile}
          />
        </div>
      </section>

      {compactMobile && (
        <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
          <DialogContent
            className="max-h-[90dvh] w-[calc(100%-1rem)] rounded-3xl"
            bodyClassName="space-y-4 px-4 py-4"
          >
            <DialogHeader className="px-4">
              <DialogTitle>Bộ lọc nhân lực</DialogTitle>
              <DialogDescription>
                Chọn khoảng thời gian và nguồn tuyển rồi nhấn Áp dụng.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="workforce-mobile-from">Từ ngày</Label>
                <DateInput
                  id="workforce-mobile-from"
                  value={draftRange.from}
                  max={draftRange.to}
                  onChange={(from) =>
                    isIsoDate(from) && setDraftRange((current) => ({ ...current, from }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="workforce-mobile-to">Đến ngày</Label>
                <DateInput
                  id="workforce-mobile-to"
                  value={draftRange.to}
                  min={draftRange.from}
                  max={today}
                  onChange={(to) =>
                    isIsoDate(to) && setDraftRange((current) => ({ ...current, to }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Mốc thời gian nhanh</Label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Hôm nay", days: 1 },
                  { label: "7 ngày", days: 7 },
                  { label: "30 ngày", days: 30 },
                  { label: "90 ngày", days: 90 },
                ].map((preset) => (
                  <button
                    key={preset.days}
                    type="button"
                    onClick={() => setDraftPreset(preset.days)}
                    className="min-h-10 rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground active:bg-muted"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Nguồn tuyển</Label>
              <div className="grid grid-cols-3 gap-2 rounded-2xl bg-muted/60 p-1.5">
                {(
                  [
                    { key: "all", label: "Toàn bộ" },
                    { key: "internal", label: "Nội bộ" },
                    { key: "partner", label: "Đối tác" },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    aria-pressed={draftRecruitmentScope === option.key}
                    onClick={() => setDraftRecruitmentScope(option.key)}
                    className={`min-h-10 rounded-xl px-2 text-xs font-semibold transition ${
                      draftRecruitmentScope === option.key
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <DialogFooter className="grid grid-cols-2 px-4 sm:grid-cols-2">
              <Button type="button" variant="outline" onClick={resetMobileFilter}>
                Đặt lại
              </Button>
              <Button type="button" onClick={applyMobileFilter} disabled={!validRange(draftRange)}>
                Áp dụng
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <section
        className={`rounded-3xl border border-border/70 bg-card shadow-soft ${
          compactMobile ? "p-3" : "p-5"
        }`}
      >
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
          <DataLoadingState variant="grid" label="Đang tải dữ liệu nhân lực..." rows={4} />
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
        ) : filteredHistories.length === 0 ? (
          <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed text-sm text-muted-foreground">
            {recruitmentScope === "internal"
              ? "Chưa có dữ liệu nhân lực nội bộ."
              : "Chưa có dữ liệu nhân lực."}
          </div>
        ) : (
          <RecruitmentChart
            histories={filteredHistories}
            users={users}
            factories={factories}
            from={range.from}
            to={range.to}
            dayDetailPresentation="dialog"
          />
        )}
      </section>

      {!loading && !error && (
        <WorkforceInsightsCharts
          histories={filteredHistories}
          users={users}
          factories={factories}
          from={range.from}
          to={range.to}
        />
      )}
    </div>
  );
}
