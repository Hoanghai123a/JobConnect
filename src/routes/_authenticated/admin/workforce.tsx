import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronRight,
  FileDown,
  FileSpreadsheet,
  IdCard,
  Landmark,
  Plus,
  Search,
  ShieldCheck,
  Wallet,
  UserRoundCheck,
  UserRoundMinus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { StatCard } from "@/components/ui/stat-card";
import { StatusChip } from "@/components/ui/status-chip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { pb, fileUrl, type UserRecord } from "@/lib/pocketbase";
import { relationInFilter } from "@/lib/delegations";
import { useAppSettings } from "@/lib/app-settings";
import { formatMoneyInput, parseMoneyInput } from "@/lib/money";
import type { CccdVersionRecord } from "@/lib/cccd-versions";
import {
  createEmploymentHistory,
  deriveEmploymentStatus,
  fetchEmploymentHistories,
  getLatestEmploymentHistory,
  isCurrentlyWorking,
  maskCccd,
  syncLegacyUserWorkFields,
  updateEmploymentHistory,
  updateUserAndCache,
  type EmploymentHistoryRecord,
} from "@/lib/employment";
import { fetchFactories, type FactoryRecord } from "@/lib/factories";
import { fetchMainHouses, type MainHouseRecord } from "@/lib/main-houses";
import {
  fetchCachedStaffWorkspace,
  fetchStaffWorkspace,
  hasActiveOrRecentlyLeftEmployment,
} from "@/lib/staff-permissions";
import { useStaffCacheSignal } from "@/lib/use-staff-cache-signal";
import { cn } from "@/lib/utils";
import { createStaffActionLog } from "@/lib/staff-log";
import { CccdManager } from "@/components/cccd/CccdManager";
import { WorkerEmploymentDrawer } from "@/components/employment/WorkerEmploymentDrawer";
import { QuickWorkerAccountDialog } from "@/components/staff/QuickWorkerAccountDialog";
import { RecruitChartDialog } from "@/components/workforce/RecruitChartDialog";
import { RegisterDialog as SharedRegisterDialog } from "@/components/workforce/RegisterDialog";
import { VN_BANKS } from "@/lib/vn-banks";
import JSZip from "jszip";
import { saveAs } from "file-saver";

export const Route = createFileRoute("/_authenticated/admin/workforce")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const currentUser = pb.authStore.record as UserRecord | null;
    if (!currentUser || currentUser.role !== "admin") throw redirect({ to: "/" });
  },
  component: WorkforcePage,
});

type ActiveTab = "list" | "stats" | "my-recruited";
type RecruitSubTab = "factory" | "recruiter";
type ListScope = "all" | "working" | "left";
const RECRUITED_PAGE_SIZE = 20;

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function daysAgoIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function inDateRange(value: string | undefined, from: string, to: string) {
  if (!value) return false;
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return false;
  const fromT = new Date(`${from}T00:00:00`).getTime();
  const toT = new Date(`${to}T23:59:59.999`).getTime();
  return t >= fromT && t <= toT;
}

function endOfDayTime(value: string) {
  const t = new Date(`${value}T23:59:59.999`).getTime();
  return Number.isNaN(t) ? Date.now() : t;
}

function historySortTime(history: EmploymentHistoryRecord) {
  return new Date(history.join_date || history.created || 0).getTime();
}

function latestJoinTime(history: EmploymentHistoryRecord | null) {
  const time = new Date(history?.join_date || "").getTime();
  return Number.isNaN(time) ? null : time;
}

function getLatestHistoryAtEndDate(histories: EmploymentHistoryRecord[], to: string) {
  const toT = endOfDayTime(to);
  let latest: EmploymentHistoryRecord | null = null;
  for (const h of histories) {
    const joinT = new Date(h.join_date).getTime();
    if (Number.isNaN(joinT) || joinT > toT) continue;
    if (!latest || historySortTime(h) > historySortTime(latest)) {
      latest = h;
    }
  }
  return latest;
}

function isWorkingAtEndDate(history: EmploymentHistoryRecord, to: string) {
  const toT = endOfDayTime(to);
  const joinT = new Date(history.join_date).getTime();
  if (Number.isNaN(joinT) || joinT > toT) return false;
  if (!history.leave_date) return true;
  const leaveT = new Date(history.leave_date).getTime();
  return !Number.isNaN(leaveT) && leaveT > toT;
}

function formatDate(value?: string) {
  if (!value) return "—";
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getPocketBaseFieldErrors(error: unknown) {
  const data =
    typeof error === "object" && error !== null && "data" in error
      ? (error.data as { data?: Record<string, unknown> }).data
      : undefined;
  if (!data) return "";
  return Object.entries(data)
    .map(([field, value]) => {
      const message =
        typeof value === "object" && value !== null && "message" in value
          ? String(value.message)
          : String(value);
      return `${field}: ${message}`;
    })
    .join("; ");
}

function WorkforcePage() {
  const currentUser = pb.authStore.record as UserRecord | null;
  const [tab, setTab] = useState<ActiveTab>("list");
  const [from, setFrom] = useState(daysAgoIso(30));
  const [to, setTo] = useState(todayIso());
  const [loading, setLoading] = useState(true);
  const [histories, setHistories] = useState<EmploymentHistoryRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [factories, setFactories] = useState<FactoryRecord[]>([]);
  const [mainHouses, setMainHouses] = useState<MainHouseRecord[]>([]);
  const [openRegister, setOpenRegister] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [cccdExportOpen, setCccdExportOpen] = useState(false);
  const [chartOpen, setChartOpen] = useState(false);
  const [selectedFactoryIds, setSelectedFactoryIds] = useState<string[]>([]);
  const [selectedRecruiterIds, setSelectedRecruiterIds] = useState<string[]>([]);

  const load = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const [workspace, staffAdminUsers, factoryList, mainHouseList] = await Promise.all([
        fetchStaffWorkspace(currentUser),
        pb.collection("users").getFullList<UserRecord>({
          filter: `role="staff" || role="admin"`,
          sort: "full_name,username",
        }),
        fetchFactories(),
        fetchMainHouses().catch(() => [] as MainHouseRecord[]),
      ]);
      const workerUsers = workspace.workers.map((w) => w.user);
      const workerIds = new Set(workerUsers.map((u) => u.id));
      const mergedUsers = [...workerUsers, ...staffAdminUsers.filter((u) => !workerIds.has(u.id))];
      setHistories(workspace.workers.flatMap((w) => w.histories));
      setUsers(mergedUsers);
      setFactories(factoryList);
      setMainHouses(mainHouseList);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Không tải được dữ liệu"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const cacheSignal = useStaffCacheSignal();
  useEffect(() => {
    if (!currentUser?.id || cacheSignal === 0) return;
    const timer = setTimeout(async () => {
      const ws = await fetchCachedStaffWorkspace(currentUser);
      if (!ws) return;
      const workerUsers = ws.workers.map((w) => w.user);
      const workerIds = new Set(workerUsers.map((u) => u.id));
      setHistories(ws.workers.flatMap((w) => w.histories));
      setUsers((prev) => [...workerUsers, ...prev.filter((u) => !workerIds.has(u.id))]);
    }, 150);
    return () => clearTimeout(timer);
  }, [cacheSignal, currentUser?.id]);

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const factoryById = useMemo(() => new Map(factories.map((f) => [f.id, f])), [factories]);

  const historiesByUser = useMemo(() => {
    const map = new Map<string, EmploymentHistoryRecord[]>();
    for (const h of histories) {
      const arr = map.get(h.user) || [];
      arr.push(h);
      map.set(h.user, arr);
    }
    return map;
  }, [histories]);

  const latestByUser = useMemo(() => {
    const latest = new Map<string, EmploymentHistoryRecord>();
    for (const [userId, arr] of historiesByUser.entries()) {
      const l = getLatestEmploymentHistory(arr);
      if (l) latest.set(userId, l);
    }
    return latest;
  }, [historiesByUser]);

  const stats = useMemo(() => {
    let working = 0;
    let joined = 0;
    let left = 0;
    for (const arr of historiesByUser.values()) {
      const h = getLatestHistoryAtEndDate(arr, to);
      if (h && isWorkingAtEndDate(h, to)) working++;
    }
    for (const h of histories) {
      if (inDateRange(h.join_date, from, to)) joined++;
      if (h.status === "left" && inDateRange(h.leave_date, from, to)) left++;
    }
    return { working, joined, left };
  }, [historiesByUser, histories, from, to]);

  const filteredHistoriesByDate = useMemo(() => {
    return histories.filter(
      (h) =>
        inDateRange(h.join_date, from, to) ||
        (h.status === "left" && inDateRange(h.leave_date, from, to)),
    );
  }, [histories, from, to]);

  const filteredHistoriesForStats = useMemo(() => {
    let result = filteredHistoriesByDate;
    if (selectedFactoryIds.length > 0) {
      const set = new Set(selectedFactoryIds);
      result = result.filter((h) => set.has(h.factory));
    }
    if (selectedRecruiterIds.length > 0) {
      const set = new Set(selectedRecruiterIds);
      result = result.filter((h) => h.recruiter_staff && set.has(h.recruiter_staff));
    }
    return result;
  }, [filteredHistoriesByDate, selectedFactoryIds, selectedRecruiterIds]);

  const latestByUserForStats = useMemo(() => {
    const map = new Map<string, EmploymentHistoryRecord[]>();
    for (const h of histories) {
      if (selectedFactoryIds.length > 0 && !selectedFactoryIds.includes(h.factory)) continue;
      if (
        selectedRecruiterIds.length > 0 &&
        (!h.recruiter_staff || !selectedRecruiterIds.includes(h.recruiter_staff))
      ) {
        continue;
      }
      const arr = map.get(h.user) || [];
      arr.push(h);
      map.set(h.user, arr);
    }
    const latest = new Map<string, EmploymentHistoryRecord>();
    for (const [userId, arr] of map.entries()) {
      const l = getLatestHistoryAtEndDate(arr, to);
      if (l) latest.set(userId, l);
    }
    return latest;
  }, [histories, selectedFactoryIds, selectedRecruiterIds, to]);

  const filteredStats = useMemo(() => {
    let working = 0;
    let joined = 0;
    let left = 0;
    for (const h of latestByUserForStats.values()) {
      if (isWorkingAtEndDate(h, to)) working++;
    }
    for (const h of filteredHistoriesForStats) {
      if (inDateRange(h.join_date, from, to)) joined++;
      if (h.status === "left" && inDateRange(h.leave_date, from, to)) left++;
    }
    return { working, joined, left };
  }, [latestByUserForStats, filteredHistoriesForStats, from, to]);

  const filteredFactoriesForStats = useMemo(() => {
    if (selectedFactoryIds.length === 0) return factories;
    const set = new Set(selectedFactoryIds);
    return factories.filter((f) => set.has(f.id));
  }, [factories, selectedFactoryIds]);

  return (
    <PageContainer
      title="Nhân sự đi làm"
      subtitle="Quản trị tuyển dụng & danh sách lao động"
      right={
        <div className="flex gap-2">
          <button
            onClick={() => setOpenRegister(true)}
            className="flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium text-foreground shadow-sm active:scale-[0.98]"
            aria-label="Đăng ký đi làm"
          >
            <BriefcaseBusiness className="h-4 w-4" />
            Đăng ký
          </button>
          <button
            onClick={() => setQuickCreateOpen(true)}
            className="flex h-9 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground shadow active:scale-[0.98]"
            aria-label="Tạo nhanh tài khoản NLĐ"
          >
            <Plus className="h-4 w-4" />
            Tạo nhanh
          </button>
        </div>
      }
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as ActiveTab)} className="space-y-3">
        <TabsList className="sticky top-[calc(env(safe-area-inset-top)+3.25rem)] z-20 grid h-10 w-full grid-cols-3 rounded-xl bg-muted shadow-sm">
          <TabsTrigger value="list" className="rounded-lg text-xs">
            Danh sách
          </TabsTrigger>
          <TabsTrigger value="stats" className="rounded-lg text-xs">
            Thống kê
          </TabsTrigger>
          <TabsTrigger value="my-recruited" className="rounded-lg text-xs">
            Tôi tuyển
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-0">
          <WorkerList
            histories={histories}
            userById={userById}
            factoryById={factoryById}
            latestByUser={latestByUser}
            loading={loading}
            onSelectWorker={setSelectedUserId}
            headerSlot={
              <div className="flex gap-2">
                <Link
                  to="/admin/imports"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border bg-card px-3 py-2 text-xs font-medium text-foreground"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Nhập Excel
                </Link>
                <Link
                  to="/staff/export"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border bg-card px-3 py-2 text-xs font-medium text-foreground"
                >
                  <FileDown className="h-4 w-4" />
                  Xuất Excel
                </Link>
                <button
                  type="button"
                  onClick={() => setCccdExportOpen(true)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border bg-card px-3 py-2 text-xs font-medium text-foreground"
                >
                  <IdCard className="h-4 w-4" />
                  Xuất CCCD
                </button>
              </div>
            }
          />
        </TabsContent>

        <TabsContent value="stats" className="mt-0 space-y-3">
          <Card className="space-y-2 p-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Từ ngày</Label>
                <DateInput value={from} max={to} onChange={(v) => setFrom(v)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Đến ngày</Label>
                <DateInput value={to} min={from} max={todayIso()} onChange={(v) => setTo(v)} />
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setFrom(todayIso());
                    setTo(todayIso());
                  }}
                  className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                >
                  1 ngày
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFrom(daysAgoIso(2));
                    setTo(todayIso());
                  }}
                  className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                >
                  2 ngày
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFrom(daysAgoIso(7));
                    setTo(todayIso());
                  }}
                  className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                >
                  7 ngày
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFrom(daysAgoIso(30));
                    setTo(todayIso());
                  }}
                  className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                >
                  30 ngày
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFrom(daysAgoIso(90));
                    setTo(todayIso());
                  }}
                  className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                >
                  90 ngày
                </button>
              </div>
              <button
                type="button"
                onClick={() => setChartOpen(true)}
                className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm active:scale-[0.96]"
                aria-label="Biểu đồ tuyển dụng"
              >
                <BarChart3 className="h-3.5 w-3.5" />
              </button>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-2">
            <MultiSelectFactoryPicker
              factories={factories}
              selected={selectedFactoryIds}
              onChange={setSelectedFactoryIds}
            />
            <MultiSelectRecruiterPicker
              users={users.filter((u) => u.role === "staff" || u.role === "admin")}
              selected={selectedRecruiterIds}
              onChange={setSelectedRecruiterIds}
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <StatCard
              label="Còn đi làm"
              value={filteredStats.working}
              icon={UserRoundCheck}
              tone="success"
            />
            <StatCard label="Tuyển mới" value={filteredStats.joined} icon={Plus} tone="primary" />
            <StatCard
              label="Đã nghỉ"
              value={filteredStats.left}
              icon={UserRoundMinus}
              tone="warning"
            />
          </div>

          <RecruitGroups
            histories={filteredHistoriesForStats}
            factories={filteredFactoriesForStats}
            users={users}
            from={from}
            to={to}
            latestByUser={latestByUserForStats}
            loading={loading}
            onSelectWorker={setSelectedUserId}
          />
        </TabsContent>

        <TabsContent value="my-recruited" className="mt-0 space-y-3">
          <MyRecruitedTab
            histories={histories}
            userById={userById}
            factoryById={factoryById}
            onSelectWorker={setSelectedUserId}
          />
        </TabsContent>
      </Tabs>

      <RegisterDialog
        open={openRegister}
        actor={currentUser}
        onClose={() => setOpenRegister(false)}
        users={users}
        factories={factories}
        mainHouses={mainHouses}
        onCreated={load}
      />

      <QuickWorkerAccountDialog
        open={quickCreateOpen}
        onOpenChange={setQuickCreateOpen}
        actor={currentUser}
        factories={factories}
        mainHouses={mainHouses}
        staffUsers={users.filter((item) => item.role === "staff" || item.role === "admin")}
        onCreated={async (userId) => {
          await load();
          setSelectedUserId(userId);
        }}
      />

      <WorkerEmploymentDrawer
        user={selectedUserId ? userById.get(selectedUserId) || null : null}
        actor={currentUser}
        histories={selectedUserId ? histories.filter((h) => h.user === selectedUserId) : []}
        factories={factories}
        mainHouses={mainHouses}
        users={users}
        permissions={{
          canEditHistory: true,
          canAddOldHistory: true,
          canReportAdvance: true,
          canUpdateBank: true,
        }}
        open={!!selectedUserId}
        onClose={() => setSelectedUserId(null)}
        onDataChanged={load}
      />

      <CccdExportDialog
        open={cccdExportOpen}
        onClose={() => setCccdExportOpen(false)}
        histories={histories}
        users={users}
        factories={factories}
        from={from}
        to={to}
      />

      <RecruitChartDialog
        open={chartOpen}
        onOpenChange={setChartOpen}
        histories={histories}
        users={users}
        factories={factories}
      />
    </PageContainer>
  );
}

function RecruitGroups({
  histories,
  factories,
  users,
  from,
  to,
  latestByUser,
  loading,
  onSelectWorker,
}: {
  histories: EmploymentHistoryRecord[];
  factories: FactoryRecord[];
  users: UserRecord[];
  from: string;
  to: string;
  latestByUser: Map<string, EmploymentHistoryRecord>;
  loading: boolean;
  onSelectWorker: (userId: string) => void;
}) {
  const [sub, setSub] = useState<RecruitSubTab>("factory");

  const factoryStats = useMemo(() => {
    const map = new Map<string, { working: number; joined: number; left: number }>();
    for (const f of factories) map.set(f.id, { working: 0, joined: 0, left: 0 });

    for (const h of latestByUser.values()) {
      if (isWorkingAtEndDate(h, to)) {
        const s = map.get(h.factory) || { working: 0, joined: 0, left: 0 };
        s.working++;
        map.set(h.factory, s);
      }
    }
    for (const h of histories) {
      if (inDateRange(h.join_date, from, to)) {
        const s = map.get(h.factory) || { working: 0, joined: 0, left: 0 };
        s.joined++;
        map.set(h.factory, s);
      }
      if (h.status === "left" && inDateRange(h.leave_date, from, to)) {
        const s = map.get(h.factory) || { working: 0, joined: 0, left: 0 };
        s.left++;
        map.set(h.factory, s);
      }
    }
    return map;
  }, [factories, histories, latestByUser, from, to]);

  const recruiterStats = useMemo(() => {
    const map = new Map<string, { working: number; joined: number; left: number }>();
    const staffSet = new Set(users.filter((u) => u.role === "staff").map((u) => u.id));

    for (const h of latestByUser.values()) {
      const recruiterId = h.recruiter_staff;
      if (!recruiterId || !staffSet.has(recruiterId)) continue;
      if (isWorkingAtEndDate(h, to)) {
        const s = map.get(recruiterId) || { working: 0, joined: 0, left: 0 };
        s.working++;
        map.set(recruiterId, s);
      }
    }
    for (const h of histories) {
      const recruiterId = h.recruiter_staff;
      if (!recruiterId || !staffSet.has(recruiterId)) continue;
      if (inDateRange(h.join_date, from, to)) {
        const s = map.get(recruiterId) || { working: 0, joined: 0, left: 0 };
        s.joined++;
        map.set(recruiterId, s);
      }
      if (h.status === "left" && inDateRange(h.leave_date, from, to)) {
        const s = map.get(recruiterId) || { working: 0, joined: 0, left: 0 };
        s.left++;
        map.set(recruiterId, s);
      }
    }
    return map;
  }, [users, histories, latestByUser, from, to]);

  return (
    <Tabs value={sub} onValueChange={(v) => setSub(v as RecruitSubTab)} className="space-y-2">
      <TabsList className="grid h-9 w-full grid-cols-2 rounded-xl">
        <TabsTrigger value="factory" className="rounded-lg text-xs">
          Theo nhà máy
        </TabsTrigger>
        <TabsTrigger value="recruiter" className="rounded-lg text-xs">
          Theo người tuyển
        </TabsTrigger>
      </TabsList>

      <TabsContent value="factory" className="mt-0 space-y-2">
        {loading && <SkeletonRows />}
        {!loading && factories.length === 0 && (
          <EmptyState
            icon={Building2}
            title="Chưa có nhà máy"
            description="Thêm nhà máy ở phần Cài đặt để hiển thị tại đây."
          />
        )}
        {factories.map((f) => {
          const s = factoryStats.get(f.id) || { working: 0, joined: 0, left: 0 };
          if (s.working === 0 && s.joined === 0 && s.left === 0) return null;
          return (
            <GroupCard
              key={f.id}
              title={f.name}
              subtitle={f.code || ""}
              icon={Building2}
              stats={s}
              workers={collectWorkersForFactory(histories, latestByUser, f.id, from, to)}
              onSelectWorker={onSelectWorker}
            />
          );
        })}
      </TabsContent>

      <TabsContent value="recruiter" className="mt-0 space-y-2">
        {loading && <SkeletonRows />}
        {!loading && recruiterStats.size === 0 && (
          <EmptyState
            icon={ShieldCheck}
            title="Chưa có người tuyển"
            description="Khi có lịch sử đi làm gắn với staff người tuyển, dữ liệu sẽ hiển thị."
          />
        )}
        {[...recruiterStats.entries()]
          .sort(([, a], [, b]) => b.joined + b.working - (a.joined + a.working))
          .map(([staffId, s]) => {
            const staff = users.find((u) => u.id === staffId);
            if (!staff) return null;
            return (
              <GroupCard
                key={staffId}
                title={staff.full_name || staff.username || "Nhân sự"}
                subtitle={staff.phone || staff.username || ""}
                icon={ShieldCheck}
                stats={s}
                workers={collectWorkersForRecruiter(histories, latestByUser, staffId, from, to)}
                onSelectWorker={onSelectWorker}
              />
            );
          })}
      </TabsContent>
    </Tabs>
  );
}

type GroupWorker = {
  userId: string;
  fullName: string;
  factoryName: string;
  state: "working" | "joined" | "left";
  date: string;
};

function collectWorkersForFactory(
  histories: EmploymentHistoryRecord[],
  latestByUser: Map<string, EmploymentHistoryRecord>,
  factoryId: string,
  from: string,
  to: string,
): GroupWorker[] {
  const seen = new Map<string, GroupWorker>();
  for (const [userId, h] of latestByUser.entries()) {
    if (h.factory !== factoryId) continue;
    if (isWorkingAtEndDate(h, to)) {
      seen.set(`${userId}:working`, {
        userId,
        fullName: h.expand?.user?.full_name || h.worker_name_snapshot || "Người lao động",
        factoryName: h.expand?.factory?.name || "",
        state: "working",
        date: h.join_date,
      });
    }
  }
  for (const h of histories) {
    if (h.factory !== factoryId) continue;
    if (inDateRange(h.join_date, from, to)) {
      seen.set(`${h.user}:joined:${h.id}`, {
        userId: h.user,
        fullName: h.expand?.user?.full_name || h.worker_name_snapshot,
        factoryName: h.expand?.factory?.name || "",
        state: "joined",
        date: h.join_date,
      });
    }
    if (h.status === "left" && inDateRange(h.leave_date, from, to)) {
      seen.set(`${h.user}:left:${h.id}`, {
        userId: h.user,
        fullName: h.expand?.user?.full_name || h.worker_name_snapshot,
        factoryName: h.expand?.factory?.name || "",
        state: "left",
        date: h.leave_date || "",
      });
    }
  }
  return [...seen.values()];
}

function collectWorkersForRecruiter(
  histories: EmploymentHistoryRecord[],
  latestByUser: Map<string, EmploymentHistoryRecord>,
  staffId: string,
  from: string,
  to: string,
): GroupWorker[] {
  const seen = new Map<string, GroupWorker>();
  for (const [userId, h] of latestByUser.entries()) {
    if (h.recruiter_staff !== staffId) continue;
    if (isWorkingAtEndDate(h, to)) {
      seen.set(`${userId}:working`, {
        userId,
        fullName: h.expand?.user?.full_name || h.worker_name_snapshot || "Người lao động",
        factoryName: h.expand?.factory?.name || "",
        state: "working",
        date: h.join_date,
      });
    }
  }
  for (const h of histories) {
    if (h.recruiter_staff !== staffId) continue;
    if (inDateRange(h.join_date, from, to)) {
      seen.set(`${h.user}:joined:${h.id}`, {
        userId: h.user,
        fullName: h.expand?.user?.full_name || h.worker_name_snapshot,
        factoryName: h.expand?.factory?.name || "",
        state: "joined",
        date: h.join_date,
      });
    }
    if (h.status === "left" && inDateRange(h.leave_date, from, to)) {
      seen.set(`${h.user}:left:${h.id}`, {
        userId: h.user,
        fullName: h.expand?.user?.full_name || h.worker_name_snapshot,
        factoryName: h.expand?.factory?.name || "",
        state: "left",
        date: h.leave_date || "",
      });
    }
  }
  return [...seen.values()];
}

function GroupCard({
  title,
  subtitle,
  icon: Icon,
  stats,
  workers,
  onSelectWorker,
}: {
  title: string;
  subtitle?: string;
  icon: typeof Building2;
  stats: { working: number; joined: number; left: number };
  workers: GroupWorker[];
  onSelectWorker: (userId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"working" | "joined" | "left">("working");

  const filtered = workers.filter((w) => w.state === view);

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{title}</div>
          {subtitle && <div className="truncate text-[11px] text-muted-foreground">{subtitle}</div>}
          <div className="mt-1 flex flex-wrap gap-1.5">
            <StatusChip tone="success">Còn đi làm: {stats.working}</StatusChip>
            <StatusChip tone="primary">Tuyển mới: {stats.joined}</StatusChip>
            <StatusChip tone="warning">Đã nghỉ: {stats.left}</StatusChip>
          </div>
        </div>
        <ChevronRight
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
      </button>

      {open && (
        <div className="border-t bg-muted/30 p-3">
          <div className="mb-2 flex gap-1.5">
            <SubChip
              label={`Còn đi làm (${stats.working})`}
              active={view === "working"}
              onClick={() => setView("working")}
            />
            <SubChip
              label={`Tuyển mới (${stats.joined})`}
              active={view === "joined"}
              onClick={() => setView("joined")}
            />
            <SubChip
              label={`Đã nghỉ (${stats.left})`}
              active={view === "left"}
              onClick={() => setView("left")}
            />
          </div>
          {filtered.length === 0 ? (
            <div className="rounded-xl border bg-card p-3 text-center text-xs text-muted-foreground">
              Không có dữ liệu
            </div>
          ) : (
            <div className="space-y-1.5">
              {filtered.map((w, idx) => (
                <button
                  key={`${w.userId}-${w.state}-${idx}`}
                  type="button"
                  onClick={() => onSelectWorker(w.userId)}
                  className="flex w-full items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2 text-left text-sm"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{w.fullName}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {w.factoryName || "—"} · {w.state === "left" ? "Nghỉ" : "Vào"}{" "}
                      {formatDate(w.date)}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function SubChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "border border-border bg-card text-muted-foreground",
      )}
    >
      {label}
    </button>
  );
}

function WorkerList({
  histories,
  userById,
  factoryById,
  latestByUser,
  loading,
  onSelectWorker,
  headerSlot,
}: {
  histories: EmploymentHistoryRecord[];
  userById: Map<string, UserRecord>;
  factoryById: Map<string, FactoryRecord>;
  latestByUser: Map<string, EmploymentHistoryRecord>;
  loading: boolean;
  onSelectWorker: (userId: string) => void;
  headerSlot?: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<ListScope>("all");

  const rows = useMemo(() => {
    const userIds = new Set<string>();
    for (const h of histories) userIds.add(h.user);
    return [...userIds].map((id) => ({
      user: userById.get(id),
      latest: latestByUser.get(id) || null,
    }));
  }, [histories, userById, latestByUser]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter(({ user, latest }) => {
        if (!user) return false;
        const status = latest && isCurrentlyWorking(latest) ? "working" : "left";
        if (scope === "working" && status !== "working") return false;
        if (scope === "left" && status !== "left") return false;
        if (!q) return true;
        const haystack = [
          user.full_name,
          user.username,
          user.phone,
          user.cccd,
          latest?.employee_code,
          latest?.worker_name_snapshot,
          latest?.worker_cccd_snapshot,
          latest?.worker_tax_code_snapshot,
          factoryById.get(latest?.factory || "")?.name,
          latest?.expand?.factory?.name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => {
        const aTime = latestJoinTime(a.latest);
        const bTime = latestJoinTime(b.latest);
        if (aTime !== null && bTime !== null && aTime !== bTime) return bTime - aTime;
        if (aTime === null && bTime !== null) return 1;
        if (aTime !== null && bTime === null) return -1;

        const aName = a.user?.full_name || a.user?.username || "";
        const bName = b.user?.full_name || b.user?.username || "";
        const nameOrder = aName.localeCompare(bName, "vi", { sensitivity: "base" });
        return nameOrder || (a.user?.id || "").localeCompare(b.user?.id || "");
      });
  }, [rows, search, scope, factoryById]);

  return (
    <div className="space-y-3">
      <div className="sticky top-[calc(env(safe-area-inset-top)+6.5rem)] z-10 -mx-4 space-y-3 bg-background px-4 pb-2 pt-1">
        {headerSlot}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm tên, mã NV, CCCD, mã số thuế, SĐT, nhà máy..."
            className="rounded-full pl-9"
          />
        </div>
        <div className="flex gap-1.5">
          <SubChip
            label={`Tất cả (${rows.length})`}
            active={scope === "all"}
            onClick={() => setScope("all")}
          />
          <SubChip
            label="Đang làm"
            active={scope === "working"}
            onClick={() => setScope("working")}
          />
          <SubChip label="Đã nghỉ" active={scope === "left"} onClick={() => setScope("left")} />
        </div>
      </div>

      {loading ? (
        <SkeletonRows />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Không có hồ sơ"
          description="Thử đổi từ khoá hoặc bộ lọc."
        />
      ) : (
        filtered.map(({ user, latest }) => {
          if (!user) return null;
          const isWorking = !!latest && isCurrentlyWorking(latest);
          const factoryName =
            latest?.expand?.factory?.name || factoryById.get(latest?.factory || "")?.name;
          return (
            <button
              key={user.id}
              type="button"
              onClick={() => onSelectWorker(user.id)}
              className="list-card border-l-primary flex w-full items-start justify-between gap-3 text-left"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">
                  {user.full_name || user.username || "Người lao động"}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {user.uid && (
                    <>
                      <span className="text-primary font-medium">{user.uid}</span> ·{" "}
                    </>
                  )}
                  Mã NV: {latest?.employee_code || user.employee_code || "—"} · CCCD:{" "}
                  {maskCccd(latest?.worker_cccd_snapshot || user.cccd)}
                  {latest?.worker_tax_code_snapshot && ` · MST: ${latest.worker_tax_code_snapshot}`}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {factoryName || "Chưa có nhà máy"} · Vào {formatDate(latest?.join_date)}
                  {latest?.leave_date && ` · Nghỉ ${formatDate(latest.leave_date)}`}
                </div>
              </div>
              <StatusChip tone={isWorking ? "success" : "neutral"}>
                {isWorking ? "Đang làm" : "Đã nghỉ"}
              </StatusChip>
            </button>
          );
        })
      )}
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted/60" />
      ))}
    </div>
  );
}

function RegisterDialog({
  open,
  actor,
  onClose,
  users,
  factories,
  mainHouses,
  onCreated,
}: {
  open: boolean;
  actor: UserRecord | null;
  onClose: () => void;
  users: UserRecord[];
  factories: FactoryRecord[];
  mainHouses: MainHouseRecord[];
  onCreated: () => void;
}) {
  return (
    <SharedRegisterDialog
      open={open}
      actor={actor}
      onClose={onClose}
      users={users}
      factories={factories}
      mainHouses={mainHouses}
      onCreated={onCreated}
      includeLongLeft
    />
  );
}

function MultiSelectFactoryPicker({
  factories,
  selected,
  onChange,
}: {
  factories: FactoryRecord[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedSet = new Set(selected);

  const toggle = (id: string) => {
    if (selectedSet.has(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  const label =
    selected.length === 0
      ? "Tất cả nhà máy"
      : selected.length === 1
        ? factories.find((f) => f.id === selected[0])?.name || "1 nhà máy"
        : `${selected.length} nhà máy`;

  return (
    <div className="space-y-1">
      <Label className="text-xs">Nhà máy</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-left text-sm"
          >
            <span className={cn("truncate", selected.length === 0 && "text-muted-foreground")}>
              {label}
            </span>
            <ChevronRight className="h-4 w-4 rotate-90 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Tìm nhà máy..." />
            <CommandList>
              <CommandEmpty>Không tìm thấy.</CommandEmpty>
              <CommandGroup>
                {factories.map((f) => (
                  <CommandItem
                    key={f.id}
                    value={`${f.name} ${f.code || ""}`}
                    onSelect={() => toggle(f.id)}
                  >
                    <div
                      className={cn(
                        "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                        selectedSet.has(f.id) ? "bg-primary text-primary-foreground" : "opacity-50",
                      )}
                    >
                      {selectedSet.has(f.id) && <Check className="h-3 w-3" />}
                    </div>
                    <Building2 className="mr-1.5 h-4 w-4 text-muted-foreground" />
                    <span className="truncate text-sm">{f.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="text-[11px] text-muted-foreground underline"
        >
          Bỏ lọc
        </button>
      )}
    </div>
  );
}

function MultiSelectRecruiterPicker({
  users,
  selected,
  onChange,
}: {
  users: UserRecord[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedSet = new Set(selected);

  const toggle = (id: string) => {
    if (selectedSet.has(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  const label =
    selected.length === 0
      ? "Tất cả người tuyển"
      : selected.length === 1
        ? users.find((u) => u.id === selected[0])?.full_name || "1 người tuyển"
        : `${selected.length} người tuyển`;

  return (
    <div className="space-y-1">
      <Label className="text-xs">Người tuyển</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-left text-sm"
          >
            <span className={cn("truncate", selected.length === 0 && "text-muted-foreground")}>
              {label}
            </span>
            <ChevronRight className="h-4 w-4 rotate-90 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Tìm người tuyển..." />
            <CommandList>
              <CommandEmpty>Không tìm thấy.</CommandEmpty>
              <CommandGroup>
                {users.map((u) => (
                  <CommandItem
                    key={u.id}
                    value={`${u.full_name || ""} ${u.username || ""} ${u.phone || ""}`}
                    onSelect={() => toggle(u.id)}
                  >
                    <div
                      className={cn(
                        "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                        selectedSet.has(u.id) ? "bg-primary text-primary-foreground" : "opacity-50",
                      )}
                    >
                      {selectedSet.has(u.id) && <Check className="h-3 w-3" />}
                    </div>
                    <ShieldCheck className="mr-1.5 h-4 w-4 text-muted-foreground" />
                    <span className="truncate text-sm">{u.full_name || u.username || "—"}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="text-[11px] text-muted-foreground underline"
        >
          Bỏ lọc
        </button>
      )}
    </div>
  );
}

function CccdExportDialog({
  open,
  onClose,
  histories,
  users,
  factories,
  from: defaultFrom,
  to: defaultTo,
}: {
  open: boolean;
  onClose: () => void;
  histories: EmploymentHistoryRecord[];
  users: UserRecord[];
  factories: FactoryRecord[];
  from: string;
  to: string;
}) {
  const [factory, setFactory] = useState("all");
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [exporting, setExporting] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressText, setProgressText] = useState("");

  useEffect(() => {
    if (open) {
      setFrom(defaultFrom);
      setTo(defaultTo);
      setFactory("all");
      setProgressPct(0);
      setProgressText("");
    }
  }, [open, defaultFrom, defaultTo]);

  const matchingHistories = useMemo(() => {
    const fromT = new Date(`${from}T00:00:00`).getTime();
    const toT = new Date(`${to}T23:59:59.999`).getTime();

    return histories.filter((h) => {
      if (factory !== "all" && h.factory !== factory) return false;
      const joinT = new Date(h.join_date).getTime();
      if (Number.isNaN(joinT)) return false;
      const inRange = joinT >= fromT && joinT <= toT;
      if (inRange) return true;
      if (h.leave_date) {
        const leaveT = new Date(h.leave_date).getTime();
        if (!Number.isNaN(leaveT) && leaveT >= fromT && leaveT <= toT) return true;
      }
      return false;
    });
  }, [histories, factory, from, to]);

  const matchingWithCccd = useMemo(() => {
    const userMap = new Map(users.map((u) => [u.id, u]));
    return matchingHistories.filter((h) => {
      if (h.cccd_version) return true;
      const u = userMap.get(h.user);
      return u && (u.cccd_front || u.cccd_back);
    });
  }, [matchingHistories, users]);

  const doExport = async () => {
    if (!matchingWithCccd.length) {
      toast.warning("Không có ảnh CCCD phù hợp để xuất");
      return;
    }
    setExporting(true);
    setProgressText("Đang chuẩn bị...");
    setProgressPct(0);

    try {
      const zip = new JSZip();
      const userMap = new Map(users.map((u) => [u.id, u]));
      const factoryMap = new Map(factories.map((f) => [f.id, f]));

      const versionIds = [
        ...new Set(matchingWithCccd.map((h) => h.cccd_version).filter(Boolean)),
      ] as string[];
      const versionMap = new Map<string, CccdVersionRecord>();
      if (versionIds.length) {
        setProgressText("Đang tải thông tin CCCD...");
        const BATCH = 50;
        for (let i = 0; i < versionIds.length; i += BATCH) {
          const batch = versionIds.slice(i, i + BATCH);
          const items = (await pb.collection("cccd_versions").getFullList({
            filter: relationInFilter("id", batch),
          })) as unknown as CccdVersionRecord[];
          for (const v of items) versionMap.set(v.id, v);
        }
      }

      type DownloadTask = { url: string; zipPath: string };
      const tasks: DownloadTask[] = [];
      const fetchedVersions = new Set<string>();

      for (const h of matchingWithCccd) {
        const workerName = (h.worker_name_snapshot || "worker").replace(/[/\\:*?"<>|]/g, "_");
        const factoryName = (factoryMap.get(h.factory)?.name || "factory").replace(
          /[/\\:*?"<>|]/g,
          "_",
        );
        const dateStr = h.join_date ? h.join_date.slice(0, 10) : "";
        const prefix = `${workerName}_${factoryName}${dateStr ? `_${dateStr}` : ""}`;

        const ver = h.cccd_version ? versionMap.get(h.cccd_version) : undefined;
        if (ver && !fetchedVersions.has(ver.id)) {
          fetchedVersions.add(ver.id);
          if (ver.front_image) {
            tasks.push({ url: fileUrl(ver, ver.front_image), zipPath: `${prefix}_mat_truoc.jpg` });
          }
          if (ver.back_image) {
            tasks.push({ url: fileUrl(ver, ver.back_image), zipPath: `${prefix}_mat_sau.jpg` });
          }
        } else if (!ver) {
          const u = userMap.get(h.user);
          if (u?.cccd_front) {
            tasks.push({ url: fileUrl(u, u.cccd_front), zipPath: `${prefix}_mat_truoc.jpg` });
          }
          if (u?.cccd_back) {
            tasks.push({ url: fileUrl(u, u.cccd_back), zipPath: `${prefix}_mat_sau.jpg` });
          }
        }
      }

      if (!tasks.length) {
        toast.warning("Không tải được ảnh nào");
        return;
      }

      setProgressText(`0 / ${tasks.length} ảnh`);
      let completed = 0;
      const CONCURRENCY = 4;

      const downloadOne = async (task: DownloadTask) => {
        try {
          const res = await fetch(task.url);
          if (!res.ok) return;
          const blob = await res.blob();
          zip.file(task.zipPath, blob);
        } catch {
          /* skip failed */
        }
        completed++;
        const pct = Math.round((completed / tasks.length) * 100);
        setProgressPct(pct);
        setProgressText(`${completed} / ${tasks.length} ảnh`);
      };

      let idx = 0;
      const workers = Array.from({ length: CONCURRENCY }, async () => {
        while (idx < tasks.length) {
          const current = idx++;
          await downloadOne(tasks[current]);
        }
      });
      await Promise.all(workers);

      setProgressText("Đang nén file...");
      const content = await zip.generateAsync({ type: "blob" });
      const factoryLabel =
        factory === "all"
          ? "tat_ca"
          : (factories.find((f) => f.id === factory)?.name || factory).replace(
              /[/\\:*?"<>|]/g,
              "_",
            );
      saveAs(content, `CCCD_${factoryLabel}_${from}_${to}.zip`);

      toast.success(`Đã xuất ${completed} ảnh CCCD`);
      onClose();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Lỗi xuất CCCD"));
    } finally {
      setExporting(false);
      setProgressText("");
      setProgressPct(0);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Xuất ảnh CCCD hàng loạt</DialogTitle>
          <DialogDescription>
            Tải toàn bộ ảnh CCCD (mặt trước + mặt sau) theo công ty và khoảng ngày thành file ZIP.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Nhà máy / Công ty</Label>
            <Select value={factory} onValueChange={setFactory}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Chọn nhà máy" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả nhà máy</SelectItem>
                {factories.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Từ ngày</Label>
              <DateInput value={from} onChange={(v) => setFrom(v)} className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Đến ngày</Label>
              <DateInput value={to} onChange={(v) => setTo(v)} className="rounded-xl" />
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-center text-sm">
            <span className="font-semibold text-primary">{matchingWithCccd.length}</span> lịch sử có
            ảnh CCCD phù hợp
          </div>

          {progressText && (
            <div className="space-y-1.5">
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="text-center text-xs text-muted-foreground">{progressText}</div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={exporting} className="rounded-xl">
            Đóng
          </Button>
          <Button
            onClick={doExport}
            disabled={exporting || !matchingWithCccd.length}
            className="rounded-xl"
          >
            {exporting ? "Đang xuất..." : "Tải ZIP"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MyRecruitedTab({
  histories,
  userById,
  factoryById,
  onSelectWorker,
}: {
  histories: EmploymentHistoryRecord[];
  userById: Map<string, UserRecord>;
  factoryById: Map<string, FactoryRecord>;
  onSelectWorker: (userId: string) => void;
}) {
  const currentUser = pb.authStore.record as UserRecord | null;
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"all" | "working" | "left">("all");
  const [visibleCount, setVisibleCount] = useState(RECRUITED_PAGE_SIZE);

  const recruitedWorkers = useMemo(() => {
    if (!currentUser?.id) return [];

    const historiesByUser = new Map<string, EmploymentHistoryRecord[]>();
    for (const history of histories) {
      const workerHistories = historiesByUser.get(history.user) || [];
      workerHistories.push(history);
      historiesByUser.set(history.user, workerHistories);
    }

    return [...historiesByUser.entries()]
      .filter(([, workerHistories]) => {
        const recruitedByCurrentAdmin = workerHistories.some(
          (history) => history.recruiter_staff === currentUser.id,
        );
        return recruitedByCurrentAdmin && hasActiveOrRecentlyLeftEmployment(workerHistories);
      })
      .map(([userId, workerHistories]) => ({
        userId,
        histories: workerHistories,
        latest: getLatestEmploymentHistory(workerHistories),
      }))
      .filter((item) => item.latest && userById.has(item.userId))
      .sort((a, b) => {
        const aTime = latestJoinTime(a.latest);
        const bTime = latestJoinTime(b.latest);
        if (aTime !== null && bTime !== null && aTime !== bTime) return bTime - aTime;
        if (aTime === null && bTime !== null) return 1;
        if (aTime !== null && bTime === null) return -1;
        return a.userId.localeCompare(b.userId);
      });
  }, [histories, currentUser?.id, userById]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return recruitedWorkers.filter(({ userId, histories: workerHistories, latest }) => {
      const isWorking = latest ? isCurrentlyWorking(latest) : false;
      if (scope === "working" && !isWorking) return false;
      if (scope === "left" && isWorking) return false;
      if (query) {
        const user = userById.get(userId);
        const haystack = [
          user?.full_name,
          user?.username,
          user?.phone,
          user?.cccd,
          user?.employee_code,
          ...workerHistories.flatMap((history) => [
            history.worker_name_snapshot,
            history.worker_cccd_snapshot,
            history.worker_tax_code_snapshot,
            history.employee_code,
            history.expand?.factory?.name,
            factoryById.get(history.factory)?.name,
          ]),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [recruitedWorkers, search, scope, userById, factoryById]);

  const visibleWorkers = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  const updateSearch = (value: string) => {
    setSearch(value);
    setVisibleCount(RECRUITED_PAGE_SIZE);
  };

  const updateScope = (value: "all" | "working" | "left") => {
    setScope(value);
    setVisibleCount(RECRUITED_PAGE_SIZE);
  };

  return (
    <div className="space-y-3">
      <div className="sticky top-[calc(env(safe-area-inset-top)+6.5rem)] z-10 -mx-4 space-y-3 bg-background px-4 pb-2 pt-1">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => updateSearch(e.target.value)}
            placeholder="Tìm tên, mã NV, CCCD, nhà máy..."
            className="rounded-full pl-9"
          />
        </div>

        <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <button
            type="button"
            onClick={() => updateScope("all")}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition",
              scope === "all"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground",
            )}
          >
            Tất cả
          </button>
          <button
            type="button"
            onClick={() => updateScope("working")}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition",
              scope === "working"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground",
            )}
          >
            Đang làm
          </button>
          <button
            type="button"
            onClick={() => updateScope("left")}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition",
              scope === "left"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground",
            )}
          >
            Đã nghỉ
          </button>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        Đang hiển thị {Math.min(visibleCount, filtered.length)}/{filtered.length} lao động bạn
        tuyển.
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Không có hồ sơ phù hợp"
          description="Không có lao động đang làm hoặc đã nghỉ trong 90 ngày gần đây do bạn tuyển."
        />
      ) : (
        <div className="space-y-2">
          {visibleWorkers.map(({ userId, latest }) => {
            if (!latest) return null;
            const user = userById.get(userId);
            const factory = factoryById.get(latest.factory);
            const isWorking = isCurrentlyWorking(latest);
            return (
              <button
                key={userId}
                type="button"
                onClick={() => onSelectWorker(userId)}
                className="w-full rounded-2xl border border-border/60 bg-card p-3 text-left shadow-soft transition-colors hover:bg-muted/30 active:scale-[0.99]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">
                      {latest.worker_name_snapshot || user?.full_name || "Người lao động"}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      Mã NV: {latest.employee_code || user?.employee_code || "Chưa có"} · CCCD:{" "}
                      {maskCccd(latest.worker_cccd_snapshot || user?.cccd)}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {latest.expand?.factory?.name || factory?.name || "Chưa có nhà máy"} · Vào:{" "}
                      {formatDate(latest.join_date)}
                      {latest.leave_date ? ` · Nghỉ: ${formatDate(latest.leave_date)}` : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <StatusChip tone={isWorking ? "success" : "neutral"}>
                      {isWorking ? "Đang làm" : "Đã nghỉ"}
                    </StatusChip>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </button>
            );
          })}
          {visibleCount < filtered.length && (
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-full"
              onClick={() => setVisibleCount((count) => count + RECRUITED_PAGE_SIZE)}
            >
              Tải thêm người lao động
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
