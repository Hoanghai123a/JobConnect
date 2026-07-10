import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  ChevronRight,
  FileDown,
  FileSpreadsheet,
  IdCard,
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
  fetchEmploymentHistories,
  getLatestEmploymentHistory,
  maskCccd,
  syncLegacyUserWorkFields,
  updateEmploymentHistory,
  type EmploymentHistoryRecord,
} from "@/lib/employment";
import { fetchFactories, type FactoryRecord } from "@/lib/factories";
import { fetchMainHouses, type MainHouseRecord } from "@/lib/main-houses";
import { cn } from "@/lib/utils";
import { createStaffActionLog } from "@/lib/staff-log";
import { CccdManager } from "@/components/cccd/CccdManager";
import { QuickWorkerAccountDialog } from "@/components/staff/QuickWorkerAccountDialog";
import { RecruitChartDialog } from "@/components/workforce/RecruitChartDialog";
import JSZip from "jszip";
import { saveAs } from "file-saver";

export const Route = createFileRoute("/_authenticated/admin/workforce")({
  beforeLoad: () => {
    const currentUser = pb.authStore.record as UserRecord | null;
    if (!currentUser || currentUser.role !== "admin") throw redirect({ to: "/" });
  },
  component: WorkforcePage,
});

type ActiveTab = "recruit" | "list" | "my-recruited";
type RecruitSubTab = "factory" | "recruiter";
type ListScope = "all" | "working" | "left";

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
  const [tab, setTab] = useState<ActiveTab>("recruit");
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

  const load = async () => {
    setLoading(true);
    try {
      const [histList, userList, factoryList, mainHouseList] = await Promise.all([
        fetchEmploymentHistories(),
        pb
          .collection("users")
          .getFullList<UserRecord>({ sort: "full_name,username" }),
        fetchFactories(),
        fetchMainHouses().catch(() => [] as MainHouseRecord[]),
      ]);
      setHistories(histList);
      setUsers(userList);
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

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const factoryById = useMemo(() => new Map(factories.map((f) => [f.id, f])), [factories]);

  const latestByUser = useMemo(() => {
    const map = new Map<string, EmploymentHistoryRecord[]>();
    for (const h of histories) {
      const arr = map.get(h.user) || [];
      arr.push(h);
      map.set(h.user, arr);
    }
    const latest = new Map<string, EmploymentHistoryRecord>();
    for (const [userId, arr] of map.entries()) {
      const l = getLatestEmploymentHistory(arr);
      if (l) latest.set(userId, l);
    }
    return latest;
  }, [histories]);

  const stats = useMemo(() => {
    let working = 0;
    let joined = 0;
    let left = 0;
    for (const h of latestByUser.values()) {
      if (h.status === "working" && !h.leave_date) working++;
    }
    for (const h of histories) {
      if (inDateRange(h.join_date, from, to)) joined++;
      if (h.status === "left" && inDateRange(h.leave_date, from, to)) left++;
    }
    return { working, joined, left };
  }, [latestByUser, histories, from, to]);

  const filteredHistoriesByDate = useMemo(() => {
    return histories.filter(
      (h) => inDateRange(h.join_date, from, to) || (h.status === "left" && inDateRange(h.leave_date, from, to)),
    );
  }, [histories, from, to]);

  const latestByUserFiltered = useMemo(() => {
    const map = new Map<string, EmploymentHistoryRecord[]>();
    for (const h of filteredHistoriesByDate) {
      const arr = map.get(h.user) || [];
      arr.push(h);
      map.set(h.user, arr);
    }
    const latest = new Map<string, EmploymentHistoryRecord>();
    for (const [userId, arr] of map.entries()) {
      const l = getLatestEmploymentHistory(arr);
      if (l) latest.set(userId, l);
    }
    return latest;
  }, [filteredHistoriesByDate]);

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
        <TabsList className="grid h-10 w-full grid-cols-3 rounded-xl">
          <TabsTrigger value="recruit" className="rounded-lg text-xs">
            Tuyển dụng
          </TabsTrigger>
          <TabsTrigger value="list" className="rounded-lg text-xs">
            Danh sách
          </TabsTrigger>
          <TabsTrigger value="my-recruited" className="rounded-lg text-xs">
            Tôi tuyển
          </TabsTrigger>
        </TabsList>

        <TabsContent value="recruit" className="mt-0 space-y-3">
          <Card className="space-y-2 p-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Từ ngày</Label>
                <Input
                  type="date"
                  value={from}
                  max={to}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Đến ngày</Label>
                <Input
                  type="date"
                  value={to}
                  min={from}
                  max={todayIso()}
                  onChange={(e) => setTo(e.target.value)}
                />
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

          <div className="grid grid-cols-3 gap-2">
            <StatCard
              label="Còn đi làm"
              value={stats.working}
              icon={UserRoundCheck}
              tone="success"
            />
            <StatCard label="Tuyển mới" value={stats.joined} icon={Plus} tone="primary" />
            <StatCard label="Đã nghỉ" value={stats.left} icon={UserRoundMinus} tone="warning" />
          </div>


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

          <WorkerList
            histories={filteredHistoriesByDate}
            userById={userById}
            factoryById={factoryById}
            latestByUser={latestByUserFiltered}
            loading={loading}
            onSelectWorker={setSelectedUserId}
          />
        </TabsContent>

        <TabsContent value="list" className="mt-0">
          <WorkerList
            histories={histories}
            userById={userById}
            factoryById={factoryById}
            latestByUser={latestByUser}
            loading={loading}
            onSelectWorker={setSelectedUserId}
          />
        </TabsContent>

        <TabsContent value="my-recruited" className="mt-0 space-y-3">
          <MyRecruitedTab histories={histories} userById={userById} factoryById={factoryById} />
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
        staffUsers={users.filter(
          (item) => item.role === "staff" || item.role === "admin",
        )}
        onCreated={async (userId) => {
          await load();
          setSelectedUserId(userId);
        }}
      />

      <AdminWorkerDrawer
        user={selectedUserId ? userById.get(selectedUserId) || null : null}
        actor={currentUser}
        histories={selectedUserId ? histories.filter((h) => h.user === selectedUserId) : []}
        factories={factories}
        mainHouses={mainHouses}
        users={users}
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
      if (h.status === "working" && !h.leave_date) {
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
      if (h.status === "working" && !h.leave_date) {
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
    if (h.status === "working" && !h.leave_date) {
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
    if (h.status === "working" && !h.leave_date) {
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
}: {
  histories: EmploymentHistoryRecord[];
  userById: Map<string, UserRecord>;
  factoryById: Map<string, FactoryRecord>;
  latestByUser: Map<string, EmploymentHistoryRecord>;
  loading: boolean;
  onSelectWorker: (userId: string) => void;
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
    return rows.filter(({ user, latest }) => {
      if (!user) return false;
      const status = latest?.status === "working" && !latest.leave_date ? "working" : "left";
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
    });
  }, [rows, search, scope, factoryById]);

  return (
    <div className="space-y-3">
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
          const isWorking = latest?.status === "working" && !latest.leave_date;
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

function AdminWorkerDrawer({
  user,
  actor,
  histories,
  factories,
  mainHouses,
  users,
  open,
  onClose,
  onDataChanged,
}: {
  user: UserRecord | null;
  actor: UserRecord | null;
  histories: EmploymentHistoryRecord[];
  factories: FactoryRecord[];
  mainHouses: MainHouseRecord[];
  users: UserRecord[];
  open: boolean;
  onClose: () => void;
  onDataChanged: () => void;
}) {
  const { data: settings } = useAppSettings();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advanceReason, setAdvanceReason] = useState("");
  const [advanceBankChoice, setAdvanceBankChoice] = useState<"worker" | "actor">("worker");
  const [form, setForm] = useState({
    employee_code: "",
    worker_name_snapshot: "",
    worker_cccd_snapshot: "",
    worker_tax_code_snapshot: "",
    recruiter_staff: "",
    main_house: "",
    join_date: "",
    leave_date: "",
    status: "working",
    note: "",
  });
  const [saving, setSaving] = useState(false);
  const [submittingAdvance, setSubmittingAdvance] = useState(false);

  const staffUsers = useMemo(
    () => users.filter((u) => u.role === "staff" || u.role === "admin"),
    [users],
  );

  const startEdit = (h: EmploymentHistoryRecord) => {
    setEditingId(h.id);
    setForm({
      employee_code: h.employee_code || "",
      worker_name_snapshot: h.worker_name_snapshot || "",
      worker_cccd_snapshot: h.worker_cccd_snapshot || "",
      worker_tax_code_snapshot: h.worker_tax_code_snapshot || "",
      recruiter_staff: h.recruiter_staff || "",
      main_house: h.main_house || "",
      join_date: h.join_date?.slice(0, 10) || "",
      leave_date: h.leave_date?.slice(0, 10) || "",
      status: h.status || "working",
      note: h.note || "",
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      const before = histories.find((item) => item.id === editingId) || null;
      const updated = await updateEmploymentHistory(editingId, {
        employee_code: form.employee_code.trim(),
        worker_name_snapshot: form.worker_name_snapshot.trim(),
        worker_cccd_snapshot: form.worker_cccd_snapshot.trim(),
        worker_tax_code_snapshot: form.worker_tax_code_snapshot.trim(),
        recruiter_staff: form.recruiter_staff || undefined,
        main_house: form.main_house || undefined,
        join_date: form.join_date || undefined,
        leave_date: form.leave_date || undefined,
        status: form.status as "working" | "left",
        note: form.note.trim(),
      });
      if (user) {
        const updatedHistories = await fetchEmploymentHistories([user.id]);
        const latest = getLatestEmploymentHistory(updatedHistories);
        await syncLegacyUserWorkFields(user.id, latest);
      }
      await createStaffActionLog({
        actor,
        targetUserId: user?.id,
        targetCollection: "employment_histories",
        targetRecord: editingId,
        action: "update",
        before,
        after: updated,
        note: "Quản trị viên cập nhật lịch sử đi làm",
      });
      toast.success("Đã lưu thay đổi");
      setEditingId(null);
      onDataChanged();
    } catch (error: unknown) {
      const fieldErrors = getPocketBaseFieldErrors(error);
      if (fieldErrors) {
        toast.error(fieldErrors);
      } else {
        toast.error(getErrorMessage(error, "Lỗi lưu"));
      }
    } finally {
      setSaving(false);
    }
  };

  const submitAdvance = async () => {
    const activeHistory = histories.find((item) => item.status === "working" && !item.leave_date);
    if (!user || !actor || !activeHistory) {
      toast.error("Chỉ báo ứng cho người lao động đang đi làm");
      return;
    }

    const amount = parseMoneyInput(advanceAmount);
    if (!amount) {
      toast.warning("Nhập số tiền ứng");
      return;
    }
    if (!advanceReason.trim()) {
      toast.warning("Nhập lý do ứng");
      return;
    }
    const bankSource = advanceBankChoice === "actor" ? actor : user;
    if (!bankSource.bank_account_number) {
      toast.warning(
        advanceBankChoice === "actor"
          ? "Tài khoản của người thao tác chưa có số tài khoản ngân hàng"
          : "Người lao động chưa có số tài khoản ngân hàng",
      );
      return;
    }

    setSubmittingAdvance(true);
    try {
      const existingAdvances = await pb.collection("advances").getList(1, 500, {
        filter: `user="${user.id}" && (status="pending" || status="recruiter_approved" || (status="accepted" && (recovery_status="" || recovery_status="none")))`,
        fields: "amount",
      });
      const outstanding = existingAdvances.items.reduce(
        (sum: number, item: any) => sum + Number(item.amount || 0),
        0,
      );
      const limit = Number(settings?.advance_limit || 0);
      if (limit <= 0) {
        toast.error("Admin chưa cài hạn mức Ứng lương");
        return;
      }
      if (outstanding + amount > limit) {
        toast.error(
          `Vượt hạn mức ứng lương. Đang dùng ${outstanding.toLocaleString("vi-VN")} đ / ${limit.toLocaleString("vi-VN")} đ. Còn lại ${(limit - outstanding).toLocaleString("vi-VN")} đ`,
        );
        return;
      }

      const created = await pb.collection("advances").create({
        user: user.id,
        requested_by: actor.id,
        recruiter_id: activeHistory.recruiter_staff || "",
        employee_code: activeHistory.employee_code || user.employee_code || "",
        full_name: activeHistory.worker_name_snapshot || user.full_name || "",
        company: activeHistory.expand?.factory?.name || user.company || "",
        phone: user.phone || "",
        join_date: activeHistory.join_date || "",
        bank_name: bankSource.bank_name || "",
        bank_account_number: bankSource.bank_account_number || "",
        bank_account_name: bankSource.bank_account_name || "",
        amount,
        reason: advanceReason.trim(),
        status: "recruiter_approved",
        recovery_status: "none",
      });
      await createStaffActionLog({
        actor,
        targetUserId: user.id,
        targetCollection: "advances",
        targetRecord: created.id,
        action: "report_advance",
        after: created,
        note: "Admin báo ứng cho người lao động đang đi làm",
      });
      toast.success("Đã tạo yêu cầu ứng lương");
      setAdvanceAmount("");
      setAdvanceReason("");
      setAdvanceOpen(false);
      onDataChanged();
    } catch (error: unknown) {
      const fieldErrors = getPocketBaseFieldErrors(error);
      toast.error(fieldErrors || getErrorMessage(error, "Lỗi báo ứng"));
    } finally {
      setSubmittingAdvance(false);
    }
  };

  if (!user) return null;

  const activeHistory = histories.find((item) => item.status === "working" && !item.leave_date);
  const isWorking = Boolean(activeHistory);
  const advanceLimit = Number(settings?.advance_limit || 0);
  const workerBank = user.bank_account_number
    ? `${user.bank_name || "NH"} · ${user.bank_account_number} · ${user.bank_account_name || ""}`
    : "";
  const actorBank = actor?.bank_account_number
    ? `${actor.bank_name || "NH"} · ${actor.bank_account_number} · ${actor.bank_account_name || ""}`
    : "";
  const actorBankRoleLabel = actor?.role === "admin" ? "Admin" : "Staff";

  const openAdvanceDialog = () => {
    setAdvanceBankChoice(workerBank ? "worker" : actorBank ? "actor" : "worker");
    setAdvanceOpen(true);
  };

  return (
  <>
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{user.full_name || user.username || "Người lao động"}</DialogTitle>
          <DialogDescription>
            {isWorking ? "Đang đi làm" : "Đã nghỉ"} · Quản trị viên có toàn quyền chỉnh sửa
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 text-sm">
            {user.uid && (
              <div className="col-span-2 rounded-xl bg-primary/10 p-2.5">
                <div className="text-[10px] text-muted-foreground">Mã tài khoản</div>
                <div className="mt-0.5 text-sm font-semibold text-primary">{user.uid}</div>
              </div>
            )}
            <div className="rounded-xl bg-muted/35 p-2.5">
              <div className="text-[10px] text-muted-foreground">Họ tên tài khoản</div>
              <div className="mt-0.5 text-sm font-semibold">{user.full_name || "—"}</div>
            </div>
            <div className="rounded-xl bg-muted/35 p-2.5">
              <div className="text-[10px] text-muted-foreground">CCCD tài khoản</div>
              <div className="mt-0.5 text-sm font-semibold">{maskCccd(user.cccd)}</div>
            </div>
            <div className="rounded-xl bg-muted/35 p-2.5">
              <div className="text-[10px] text-muted-foreground">SĐT</div>
              <div className="mt-0.5 text-sm font-semibold">{user.phone || "—"}</div>
            </div>
            <div className="rounded-xl bg-muted/35 p-2.5">
              <div className="text-[10px] text-muted-foreground">Tên đăng nhập</div>
              <div className="mt-0.5 text-sm font-semibold">{user.username || "—"}</div>
            </div>
          </div>

          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Ảnh CCCD
          </div>
          <CccdManager targetUser={user} actor={actor} onUpdated={onDataChanged} readOnly />

          {isWorking && (
            <button
              type="button"
              onClick={openAdvanceDialog}
              className="flex w-full items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-3 text-left shadow-soft active:scale-[0.99]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Wallet className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Báo ứng lương</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  Tạo yêu cầu ứng cho lao động đang đi làm
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          )}

          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Lịch sử đi làm ({histories.length})
          </div>

          {histories.length === 0 ? (
            <div className="rounded-xl border bg-card p-3 text-center text-xs text-muted-foreground">
              Chưa có lịch sử
            </div>
          ) : (
            histories.map((h) => (
              <Card
                key={h.id}
                className="cursor-pointer space-y-2 rounded-2xl p-3 transition-colors hover:bg-muted/30"
                onClick={() => startEdit(h)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">
                      {h.expand?.factory?.name || "Nhà máy"}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {h.worker_name_snapshot} · {maskCccd(h.worker_cccd_snapshot)} · Mã:{" "}
                      {h.employee_code || "—"}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Mã số thuế: {h.worker_tax_code_snapshot || "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusChip tone={h.status === "working" ? "success" : "neutral"}>
                      {h.status === "working" ? "Đang làm" : "Đã nghỉ"}
                    </StatusChip>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  <div>Vào: {formatDate(h.join_date)}</div>
                  <div>Nghỉ: {formatDate(h.leave_date) || "—"}</div>
                  <div>
                    Người tuyển:{" "}
                    {h.expand?.recruiter_staff?.full_name ||
                      h.expand?.recruiter_staff?.username ||
                      "—"}
                  </div>
                  <div>Nhà chính: {h.expand?.main_house?.name || "—"}</div>
                  {h.note && <div className="col-span-2 text-muted-foreground">{h.note}</div>}
                </div>
              </Card>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={!!editingId} onOpenChange={(v) => !v && setEditingId(null)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sửa lịch sử đi làm</DialogTitle>
          <DialogDescription>Chỉnh sửa thông tin lịch sử đi làm của người lao động.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Họ tên (NM)</Label>
              <Input
                value={form.worker_name_snapshot}
                onChange={(e) => setForm((f) => ({ ...f, worker_name_snapshot: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">CCCD (NM)</Label>
              <Input
                value={form.worker_cccd_snapshot}
                onChange={(e) =>
                  setForm((f) => ({ ...f, worker_cccd_snapshot: e.target.value.replace(/[^\d]/g, "") }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Mã NV</Label>
              <Input
                value={form.employee_code}
                onChange={(e) => setForm((f) => ({ ...f, employee_code: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Mã số thuế</Label>
              <Input
                value={form.worker_tax_code_snapshot}
                onChange={(e) =>
                  setForm((f) => ({ ...f, worker_tax_code_snapshot: e.target.value.replace(/[^\d]/g, "") }))
                }
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Trạng thái</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="working">Đang làm</SelectItem>
                  <SelectItem value="left">Đã nghỉ</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ngày vào</Label>
              <Input
                type="date"
                value={form.join_date}
                onChange={(e) => setForm((f) => ({ ...f, join_date: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ngày nghỉ</Label>
              <Input
                type="date"
                value={form.leave_date}
                onChange={(e) => setForm((f) => ({ ...f, leave_date: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Người tuyển</Label>
            <Select value={form.recruiter_staff} onValueChange={(v) => setForm((f) => ({ ...f, recruiter_staff: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Chọn người tuyển" />
              </SelectTrigger>
              <SelectContent>
                {staffUsers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.full_name || s.username || s.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nhà chính</Label>
            <Select value={form.main_house} onValueChange={(v) => setForm((f) => ({ ...f, main_house: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Chọn nhà chính" />
              </SelectTrigger>
              <SelectContent>
                {mainHouses.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ghi chú</Label>
            <Input
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="Tuỳ chọn"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ảnh CCCD</Label>
            <CccdManager targetUser={user} actor={actor} onUpdated={onDataChanged} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditingId(null)}>
            Huỷ
          </Button>
          <Button onClick={saveEdit} disabled={saving}>
            {saving ? "Đang lưu..." : "Lưu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={advanceOpen} onOpenChange={setAdvanceOpen}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>Báo ứng lương</DialogTitle>
          <DialogDescription>
            Chỉ áp dụng cho người lao động đang có trạng thái đi làm.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-xl border bg-muted/30 p-3 text-sm">
            <div className="font-semibold">{user.full_name || user.username || "Người lao động"}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {activeHistory?.expand?.factory?.name || user.company || "Chưa có nhà máy"} · Mã NV:{" "}
              {activeHistory?.employee_code || user.employee_code || "—"}
            </div>
          </div>

          {advanceLimit > 0 && (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-2.5 text-xs text-muted-foreground">
              Hạn mức ứng lương:{" "}
              <span className="font-semibold text-foreground">
                {advanceLimit.toLocaleString("vi-VN")} đ
              </span>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Tài khoản nhận tiền</Label>
            <div className="space-y-1.5">
              {workerBank && (
                <button
                  type="button"
                  onClick={() => setAdvanceBankChoice("worker")}
                  className={`flex w-full items-start gap-2 rounded-xl border p-2.5 text-left text-xs transition ${advanceBankChoice === "worker" ? "border-primary bg-primary/5" : "border-border bg-card"}`}
                >
                  <div
                    className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${advanceBankChoice === "worker" ? "border-primary bg-primary" : "border-muted-foreground"}`}
                  />
                  <div>
                    <div className="font-medium">STK của NLĐ</div>
                    <div className="text-muted-foreground">{workerBank}</div>
                  </div>
                </button>
              )}
              {actorBank && (
                <button
                  type="button"
                  onClick={() => setAdvanceBankChoice("actor")}
                  className={`flex w-full items-start gap-2 rounded-xl border p-2.5 text-left text-xs transition ${advanceBankChoice === "actor" ? "border-primary bg-primary/5" : "border-border bg-card"}`}
                >
                  <div
                    className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${advanceBankChoice === "actor" ? "border-primary bg-primary" : "border-muted-foreground"}`}
                  />
                  <div>
                    <div className="font-medium">STK của tôi ({actorBankRoleLabel})</div>
                    <div className="text-muted-foreground">{actorBank}</div>
                  </div>
                </button>
              )}
              {!workerBank && !actorBank && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                  Chưa có STK nào. Cập nhật ngân hàng trước khi báo ứng.
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Số tiền</Label>
            <Input
              value={advanceAmount}
              onChange={(e) => setAdvanceAmount(formatMoneyInput(e.target.value))}
              inputMode="numeric"
              placeholder="Nhập số tiền ứng"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Lý do</Label>
            <Textarea
              rows={3}
              value={advanceReason}
              onChange={(e) => setAdvanceReason(e.target.value)}
              placeholder="Ví dụ: ứng tiền sinh hoạt..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setAdvanceOpen(false)}>
            Huỷ
          </Button>
          <Button
            onClick={submitAdvance}
            disabled={submittingAdvance || !isWorking || (!workerBank && !actorBank)}
          >
            {submittingAdvance ? "Đang gửi..." : "Gửi yêu cầu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
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
  const [userId, setUserId] = useState("");
  const [factoryId, setFactoryId] = useState("");
  const [mainHouseId, setMainHouseId] = useState("");
  const [recruiterId, setRecruiterId] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [workerName, setWorkerName] = useState("");
  const [workerCccd, setWorkerCccd] = useState("");
  const [workerTaxCode, setWorkerTaxCode] = useState("");
  const [joinDate, setJoinDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setUserId("");
    setFactoryId("");
    setMainHouseId("");
    setRecruiterId("");
    setEmployeeCode("");
    setWorkerName("");
    setWorkerCccd("");
    setWorkerTaxCode("");
    setJoinDate(todayIso());
    setNote("");
  };

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  const candidateUsers = useMemo(() => users.filter((u) => u.role === "user" || !u.role), [users]);
  const staffUsers = useMemo(() => users.filter((u) => u.role === "staff"), [users]);

  const selectedUser = users.find((u) => u.id === userId);

  useEffect(() => {
    if (!selectedUser) return;
    setWorkerName((cur) => cur || selectedUser.full_name || selectedUser.username || "");
    setWorkerCccd((cur) => cur || selectedUser.cccd || "");
  }, [selectedUser]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return toast.error("Chọn người lao động");
    if (!factoryId) return toast.error("Chọn nhà máy");
    if (!joinDate) return toast.error("Nhập ngày vào làm");
    if (!recruiterId) return toast.error("Chọn người tuyển");
    if (!mainHouseId) return toast.error("Chọn nhà chính");
    if (!selectedUser) return;

    setSubmitting(true);
    try {
      const created = await createEmploymentHistory({
        user: userId,
        factory: factoryId,
        main_house: mainHouseId,
        employee_code: employeeCode.trim() || undefined,
        worker_name_snapshot:
          workerName.trim() || selectedUser.full_name || selectedUser.username || "",
        worker_cccd_snapshot: workerCccd.trim() || selectedUser.cccd || "",
        worker_tax_code_snapshot: workerTaxCode.trim(),
        recruiter_staff: recruiterId,
        join_date: joinDate,
        status: "working",
        note: note.trim() || undefined,
      });
      await syncLegacyUserWorkFields(userId, created);
      await createStaffActionLog({
        actor,
        targetUserId: userId,
        targetCollection: "employment_histories",
        targetRecord: created.id,
        action: "create",
        after: created,
        note: "Quản trị viên đăng ký đi làm",
      });
      toast.success("Đã đăng ký đi làm");
      onClose();
      onCreated();
    } catch (error: unknown) {
      const fieldErrors = getPocketBaseFieldErrors(error);
      const message = getErrorMessage(error, "Lỗi đăng ký đi làm");
      if (fieldErrors) {
        toast.error(fieldErrors);
      } else if (message.includes("UNIQUE")) {
        toast.error(
          "Người lao động này đã có lịch sử đang đi làm. Hãy cập nhật trạng thái nghỉ trước khi đăng ký mới.",
        );
      } else {
        toast.error(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Đăng ký đi làm</DialogTitle>
          <DialogDescription>
            Tạo bản ghi lịch sử đi làm cho người lao động đã có tài khoản.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3">
          <UserPicker
            label="Người lao động"
            users={candidateUsers}
            value={userId}
            onChange={setUserId}
            placeholder="Tìm họ tên, SĐT, mã NV..."
          />

          {selectedUser && (
            <div className="rounded-xl border border-dashed bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
              Gợi ý từ tài khoản:{" "}
              <span className="font-medium text-foreground">
                {selectedUser.full_name || selectedUser.username}
              </span>
              {selectedUser.cccd && ` · CCCD ${maskCccd(selectedUser.cccd)}`}
              {selectedUser.phone && ` · ${selectedUser.phone}`}
              <div className="mt-1">
                Có thể sửa họ tên / CCCD bên dưới nếu nhà máy ghi nhận khác.
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Họ tên (theo nhà máy)</Label>
              <Input
                value={workerName}
                onChange={(e) => setWorkerName(e.target.value)}
                placeholder="Họ tên ghi nhận"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">CCCD (theo nhà máy)</Label>
              <Input
                value={workerCccd}
                onChange={(e) => setWorkerCccd(e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                placeholder="CCCD ghi nhận"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Mã số thuế</Label>
            <Input
              value={workerTaxCode}
              onChange={(e) => setWorkerTaxCode(e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              placeholder="Mã số thuế theo lịch sử đi làm"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Nhà máy</Label>
            <FactoryPicker factories={factories} value={factoryId} onChange={setFactoryId} />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Nhà chính</Label>
            <Select
              value={mainHouseId}
              onValueChange={setMainHouseId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn nhà chính" />
              </SelectTrigger>
              <SelectContent>
                {mainHouses.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Người tuyển</Label>
            <UserPicker
              users={staffUsers}
              value={recruiterId}
              onChange={setRecruiterId}
              placeholder="Chọn nhân sự tuyển"
              allowClear
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Mã NV</Label>
              <Input
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                placeholder="Tuỳ chọn"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ngày vào làm</Label>
              <Input
                type="date"
                value={joinDate}
                onChange={(e) => setJoinDate(e.target.value)}
                max={todayIso()}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Ghi chú</Label>
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Tuỳ chọn"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Huỷ
            </Button>
            <Button type="submit" disabled={submitting}>
              <BriefcaseBusiness className="h-4 w-4" />
              {submitting ? "Đang lưu..." : "Đăng ký"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UserPicker({
  label,
  users,
  value,
  onChange,
  placeholder,
  allowClear,
}: {
  label?: string;
  users: UserRecord[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = users.find((u) => u.id === value);

  return (
    <div className="space-y-1">
      {label && <Label className="text-xs">{label}</Label>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-left text-sm"
          >
            <span className={cn("truncate", !selected && "text-muted-foreground")}>
              {selected
                ? `${selected.full_name || selected.username} · ${selected.phone || "—"}`
                : placeholder || "Chọn..."}
            </span>
            <ChevronRight className="h-4 w-4 rotate-90 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Tìm kiếm..." />
            <CommandList>
              <CommandEmpty>Không tìm thấy.</CommandEmpty>
              <CommandGroup>
                {allowClear && value && (
                  <CommandItem
                    value="__clear__"
                    onSelect={() => {
                      onChange("");
                      setOpen(false);
                    }}
                  >
                    <span className="text-muted-foreground">Bỏ chọn</span>
                  </CommandItem>
                )}
                {users.map((u) => (
                  <CommandItem
                    key={u.id}
                    value={`${u.full_name || ""} ${u.username || ""} ${u.phone || ""} ${u.employee_code || ""}`}
                    onSelect={() => {
                      onChange(u.id);
                      setOpen(false);
                    }}
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">
                        {u.full_name || u.username || "—"}
                      </span>
                      <span className="truncate text-[11px] text-muted-foreground">
                        {[u.username, u.phone, u.employee_code].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function FactoryPicker({
  factories,
  value,
  onChange,
}: {
  factories: FactoryRecord[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = factories.find((f) => f.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-left text-sm"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.name : "Chọn nhà máy..."}
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
                  onSelect={() => {
                    onChange(f.id);
                    setOpen(false);
                  }}
                >
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate text-sm">{f.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
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

      const versionIds = [...new Set(matchingWithCccd.map((h) => h.cccd_version).filter(Boolean))] as string[];
      let versionMap = new Map<string, CccdVersionRecord>();
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
        const factoryName = (factoryMap.get(h.factory)?.name || "factory").replace(/[/\\:*?"<>|]/g, "_");
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
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Đến ngày</Label>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-xl"
              />
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-center text-sm">
            <span className="font-semibold text-primary">{matchingWithCccd.length}</span> lịch sử
            có ảnh CCCD phù hợp
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
}: {
  histories: EmploymentHistoryRecord[];
  userById: Map<string, UserRecord>;
  factoryById: Map<string, FactoryRecord>;
}) {
  const currentUser = pb.authStore.record as UserRecord | null;
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"all" | "working" | "left">("all");

  const since = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const myHistories = useMemo(() => {
    if (!currentUser?.id) return [];
    return histories.filter(
      (h) => h.recruiter_staff === currentUser.id && h.join_date >= since,
    );
  }, [histories, currentUser?.id, since]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return myHistories.filter((h) => {
      if (scope === "working" && h.status !== "working") return false;
      if (scope === "left" && h.status !== "left") return false;
      if (query) {
        const u = userById.get(h.user);
        const f = factoryById.get(h.factory);
        const haystack = [
          h.worker_name_snapshot,
          h.worker_cccd_snapshot,
          h.employee_code,
          u?.full_name,
          u?.username,
          u?.phone,
          f?.name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [myHistories, search, scope, userById, factoryById]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm tên, mã NV, CCCD, nhà máy..."
          className="rounded-full pl-9"
        />
      </div>

      <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <button
          type="button"
          onClick={() => setScope("all")}
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
          onClick={() => setScope("working")}
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
          onClick={() => setScope("left")}
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

      <div className="text-xs text-muted-foreground">
        Tổng {filtered.length} hồ sơ bạn tuyển trong 90 ngày.
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Không có hồ sơ phù hợp"
          description="Chưa có lao động nào do bạn tuyển trong 90 ngày gần đây."
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((h) => {
            const u = userById.get(h.user);
            const f = factoryById.get(h.factory);
            return (
              <div
                key={h.id}
                className="rounded-2xl border border-border/60 bg-card p-3 shadow-soft"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">
                      {h.worker_name_snapshot || u?.full_name || "Người lao động"}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      Mã NV: {h.employee_code || "Chưa có"} · CCCD: {maskCccd(h.worker_cccd_snapshot)}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {f?.name || "Chưa có nhà máy"} · Vào: {formatDate(h.join_date)}
                      {h.leave_date ? ` · Nghỉ: ${formatDate(h.leave_date)}` : ""}
                    </div>
                  </div>
                  <StatusChip tone={h.status === "working" ? "success" : "neutral"}>
                    {h.status === "working" ? "Đang làm" : "Đã nghỉ"}
                  </StatusChip>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}