import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  BriefcaseBusiness,
  Building2,
  ChevronRight,
  FileDown,
  FileSpreadsheet,
  IdCard,
  Plus,
  Search,
  ShieldCheck,
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
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { pb, fileUrl, type UserRecord } from "@/lib/pocketbase";
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
import { assignUidIfMissing } from "@/lib/uid";
import { CccdManager } from "@/components/cccd/CccdManager";
import JSZip from "jszip";
import { saveAs } from "file-saver";

export const Route = createFileRoute("/_authenticated/admin/workforce")({
  beforeLoad: () => {
    const currentUser = pb.authStore.record as UserRecord | null;
    if (!currentUser || currentUser.role !== "admin") throw redirect({ to: "/" });
  },
  component: WorkforcePage,
});

type ActiveTab = "recruit" | "list";
type RecruitSubTab = "factory" | "recruiter";
type ListScope = "all" | "working" | "left";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
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

function WorkforcePage() {
  const [tab, setTab] = useState<ActiveTab>("recruit");
  const [from, setFrom] = useState(daysAgoIso(30));
  const [to, setTo] = useState(todayIso());
  const [loading, setLoading] = useState(true);
  const [histories, setHistories] = useState<EmploymentHistoryRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [factories, setFactories] = useState<FactoryRecord[]>([]);
  const [mainHouses, setMainHouses] = useState<MainHouseRecord[]>([]);
  const [openRegister, setOpenRegister] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [cccdExportOpen, setCccdExportOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [histList, userList, factoryList, mainHouseList] = await Promise.all([
        fetchEmploymentHistories(),
        pb
          .collection("users")
          .getList<UserRecord>(1, 1000, { sort: "full_name,username" })
          .then((res) => res.items),
        fetchFactories(),
        fetchMainHouses().catch(() => [] as MainHouseRecord[]),
      ]);
      setHistories(histList);
      setUsers(userList);
      setFactories(factoryList);
      setMainHouses(mainHouseList);
    } catch (error: any) {
      toast.error(error?.message || "Không tải được dữ liệu");
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

  return (
    <PageContainer
      title="Nhân sự đi làm"
      subtitle="Quản trị tuyển dụng & danh sách lao động"
      right={
        <button
          onClick={() => setOpenRegister(true)}
          className="flex h-9 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground shadow active:scale-[0.98]"
          aria-label="Đăng ký đi làm"
        >
          <Plus className="h-4 w-4" />
          Đăng ký
        </button>
      }
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as ActiveTab)} className="space-y-3">
        <TabsList className="grid h-10 w-full grid-cols-2 rounded-xl">
          <TabsTrigger value="recruit" className="rounded-lg text-xs">
            Tuyển dụng
          </TabsTrigger>
          <TabsTrigger value="list" className="rounded-lg text-xs">
            Danh sách
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
            <div className="flex flex-wrap gap-1.5">
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

          <RecruitGroups
            histories={histories}
            factories={factories}
            users={users}
            from={from}
            to={to}
            latestByUser={latestByUser}
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
      </Tabs>

      <RegisterDialog
        open={openRegister}
        onClose={() => setOpenRegister(false)}
        users={users}
        factories={factories}
        mainHouses={mainHouses}
        onCreated={load}
      />

      <AdminWorkerDrawer
        user={selectedUserId ? userById.get(selectedUserId) || null : null}
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
                title={staff.full_name || staff.username || "Staff"}
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
          placeholder="Tìm tên, mã NV, CCCD, SĐT, nhà máy..."
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
  histories,
  factories,
  mainHouses,
  users,
  open,
  onClose,
  onDataChanged,
}: {
  user: UserRecord | null;
  histories: EmploymentHistoryRecord[];
  factories: FactoryRecord[];
  mainHouses: MainHouseRecord[];
  users: UserRecord[];
  open: boolean;
  onClose: () => void;
  onDataChanged: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    employee_code: "",
    worker_name_snapshot: "",
    worker_cccd_snapshot: "",
    recruiter_staff: "",
    main_house: "",
    join_date: "",
    leave_date: "",
    status: "working",
    note: "",
  });
  const [saving, setSaving] = useState(false);

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
      await updateEmploymentHistory(editingId, {
        employee_code: form.employee_code.trim(),
        worker_name_snapshot: form.worker_name_snapshot.trim(),
        worker_cccd_snapshot: form.worker_cccd_snapshot.trim(),
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
      toast.success("Đã lưu thay đổi");
      setEditingId(null);
      onDataChanged();
    } catch (error: any) {
      const pbData = error?.data?.data;
      if (pbData) {
        const fieldErrors = Object.entries(pbData)
          .map(([k, v]: [string, any]) => `${k}: ${v?.message || v}`)
          .join("; ");
        toast.error(fieldErrors || error?.message || "Lỗi lưu");
      } else {
        toast.error(error?.message || "Lỗi lưu");
      }
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  const latest = histories[0] || null;
  const isWorking = latest?.status === "working" && !latest.leave_date;

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent className="max-h-[92dvh]">
        <DrawerHeader>
          <DrawerTitle>{user.full_name || user.username || "Người lao động"}</DrawerTitle>
          <DrawerDescription>
            {isWorking ? "Đang đi làm" : "Đã nghỉ"} · Admin có toàn quyền chỉnh sửa
          </DrawerDescription>
        </DrawerHeader>

        <div className="space-y-4 overflow-y-auto px-4 pb-6">
          <div className="grid grid-cols-2 gap-2 text-sm">
            {user.uid && (
              <div className="col-span-2 rounded-xl bg-primary/10 p-2.5">
                <div className="text-[10px] text-muted-foreground">Mã tài khoản</div>
                <div className="mt-0.5 text-sm font-semibold text-primary">{user.uid}</div>
              </div>
            )}
            <div className="rounded-xl bg-muted/35 p-2.5">
              <div className="text-[10px] text-muted-foreground">Họ tên (TK)</div>
              <div className="mt-0.5 text-sm font-semibold">{user.full_name || "—"}</div>
            </div>
            <div className="rounded-xl bg-muted/35 p-2.5">
              <div className="text-[10px] text-muted-foreground">CCCD (TK)</div>
              <div className="mt-0.5 text-sm font-semibold">{maskCccd(user.cccd)}</div>
            </div>
            <div className="rounded-xl bg-muted/35 p-2.5">
              <div className="text-[10px] text-muted-foreground">SĐT</div>
              <div className="mt-0.5 text-sm font-semibold">{user.phone || "—"}</div>
            </div>
            <div className="rounded-xl bg-muted/35 p-2.5">
              <div className="text-[10px] text-muted-foreground">Username</div>
              <div className="mt-0.5 text-sm font-semibold">{user.username || "—"}</div>
            </div>
          </div>

          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Ảnh CCCD
          </div>
          <CccdManager
            targetUser={user}
            actor={pb.authStore.record as UserRecord | null}
            onUpdated={onDataChanged}
          />

          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Lịch sử đi làm ({histories.length})
          </div>

          {histories.length === 0 ? (
            <div className="rounded-xl border bg-card p-3 text-center text-xs text-muted-foreground">
              Chưa có lịch sử
            </div>
          ) : (
            histories.map((h) => {
              const isEditing = editingId === h.id;
              return (
                <Card key={h.id} className="space-y-2 rounded-2xl p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {h.expand?.factory?.name || "Nhà máy"}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {h.worker_name_snapshot} · {maskCccd(h.worker_cccd_snapshot)} · Mã:{" "}
                        {h.employee_code || "—"}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <StatusChip tone={h.status === "working" ? "success" : "neutral"}>
                        {h.status === "working" ? "Đang làm" : "Đã nghỉ"}
                      </StatusChip>
                      {!isEditing && (
                        <button
                          type="button"
                          onClick={() => startEdit(h)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-border/60 text-muted-foreground"
                          aria-label="Sửa"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {!isEditing && (
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
                  )}

                  {isEditing && (
                    <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px]">Họ tên (NM)</Label>
                          <Input
                            value={form.worker_name_snapshot}
                            onChange={(e) =>
                              setForm((f) => ({ ...f, worker_name_snapshot: e.target.value }))
                            }
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px]">CCCD (NM)</Label>
                          <Input
                            value={form.worker_cccd_snapshot}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                worker_cccd_snapshot: e.target.value.replace(/[^\d]/g, ""),
                              }))
                            }
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px]">Mã NV</Label>
                          <Input
                            value={form.employee_code}
                            onChange={(e) =>
                              setForm((f) => ({ ...f, employee_code: e.target.value }))
                            }
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px]">Trạng thái</Label>
                          <Select
                            value={form.status}
                            onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="working">Đang làm</SelectItem>
                              <SelectItem value="left">Đã nghỉ</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px]">Ngày vào</Label>
                          <Input
                            type="date"
                            value={form.join_date}
                            onChange={(e) => setForm((f) => ({ ...f, join_date: e.target.value }))}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px]">Ngày nghỉ</Label>
                          <Input
                            type="date"
                            value={form.leave_date}
                            onChange={(e) => setForm((f) => ({ ...f, leave_date: e.target.value }))}
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">Người tuyển</Label>
                        <Select
                          value={form.recruiter_staff}
                          onValueChange={(v) => setForm((f) => ({ ...f, recruiter_staff: v }))}
                        >
                          <SelectTrigger className="h-8 text-xs">
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
                        <Label className="text-[10px]">Nhà chính</Label>
                        <Select
                          value={form.main_house || "__none__"}
                          onValueChange={(v) =>
                            setForm((f) => ({ ...f, main_house: v === "__none__" ? "" : v }))
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Chọn nhà chính" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Không gán</SelectItem>
                            {mainHouses.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">Ghi chú</Label>
                        <Input
                          value={form.note}
                          onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                          className="h-8 text-xs"
                          placeholder="Tuỳ chọn"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingId(null)}
                          className="h-7 text-xs"
                        >
                          Huỷ
                        </Button>
                        <Button
                          size="sm"
                          onClick={saveEdit}
                          disabled={saving}
                          className="h-7 text-xs"
                        >
                          {saving ? "Đang lưu..." : "Lưu"}
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>

        <DrawerFooter>
          <Button variant="outline" onClick={onClose}>
            Đóng
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
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
  onClose,
  users,
  factories,
  mainHouses,
  onCreated,
}: {
  open: boolean;
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
  const [uidInput, setUidInput] = useState("");
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
    setUidInput("");
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
        recruiter_staff: recruiterId,
        join_date: joinDate,
        status: "working",
        note: note.trim() || undefined,
      });
      await syncLegacyUserWorkFields(userId, created);
      await assignUidIfMissing(userId, uidInput.trim() || undefined);
      toast.success("Đã đăng ký đi làm");
      onClose();
      onCreated();
    } catch (error: any) {
      const pbData = error?.data?.data;
      if (pbData) {
        const fieldErrors = Object.entries(pbData)
          .map(([k, v]: [string, any]) => `${k}: ${v?.message || v}`)
          .join("; ");
        toast.error(fieldErrors || error?.message || "Lỗi đăng ký đi làm");
      } else if (error?.message?.includes("UNIQUE")) {
        toast.error(
          "Người lao động này đã có lịch sử đang đi làm. Hãy cập nhật trạng thái nghỉ trước khi đăng ký mới.",
        );
      } else {
        toast.error(error?.message || "Lỗi đăng ký đi làm");
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
            <Label className="text-xs">Nhà máy</Label>
            <FactoryPicker factories={factories} value={factoryId} onChange={setFactoryId} />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Nhà chính</Label>
            <Select
              value={mainHouseId || "__none__"}
              onValueChange={(v) => setMainHouseId(v === "__none__" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn nhà chính (tuỳ chọn)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Không gán</SelectItem>
                {mainHouses.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Người tuyển (staff)</Label>
            <UserPicker
              users={staffUsers}
              value={recruiterId}
              onChange={setRecruiterId}
              placeholder="Chọn staff (tuỳ chọn)"
              allowClear
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Mã TK (uid)</Label>
              <Input
                value={uidInput}
                onChange={(e) => setUidInput(e.target.value)}
                placeholder="Tự sinh nếu trống"
              />
            </div>
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
  const [progress, setProgress] = useState("");

  useEffect(() => {
    if (open) {
      setFrom(defaultFrom);
      setTo(defaultTo);
      setFactory("all");
      setProgress("");
    }
  }, [open, defaultFrom, defaultTo]);

  const matchingUsers = useMemo(() => {
    const fromT = new Date(`${from}T00:00:00`).getTime();
    const toT = new Date(`${to}T23:59:59.999`).getTime();

    const userIdsInRange = new Set<string>();
    for (const h of histories) {
      if (factory !== "all" && h.factory !== factory) continue;
      const joinT = new Date(h.join_date).getTime();
      if (Number.isNaN(joinT)) continue;
      if (joinT >= fromT && joinT <= toT) {
        userIdsInRange.add(h.user);
      }
      if (h.leave_date) {
        const leaveT = new Date(h.leave_date).getTime();
        if (!Number.isNaN(leaveT) && leaveT >= fromT && leaveT <= toT) {
          userIdsInRange.add(h.user);
        }
      }
    }

    return users.filter((u) => userIdsInRange.has(u.id) && (u.cccd_front || u.cccd_back));
  }, [histories, users, factory, from, to]);

  const doExport = async () => {
    if (!matchingUsers.length) {
      toast.warning("Không có ảnh CCCD phù hợp để xuất");
      return;
    }
    setExporting(true);
    setProgress("Đang chuẩn bị...");
    try {
      const zip = new JSZip();
      let count = 0;

      for (const u of matchingUsers) {
        const name = (u.full_name || u.username || u.id).replace(/[/\\:*?"<>|]/g, "_");
        if (u.cccd_front) {
          const url = fileUrl(u, u.cccd_front);
          try {
            const res = await fetch(url);
            const blob = await res.blob();
            zip.file(`${name}_mat_truoc.jpg`, blob);
            count++;
          } catch {
            /* skip failed */
          }
        }
        if (u.cccd_back) {
          const url = fileUrl(u, u.cccd_back);
          try {
            const res = await fetch(url);
            const blob = await res.blob();
            zip.file(`${name}_mat_sau.jpg`, blob);
            count++;
          } catch {
            /* skip failed */
          }
        }
        setProgress(`Đã tải ${count} ảnh...`);
      }

      if (!count) {
        toast.warning("Không tải được ảnh nào");
        return;
      }

      setProgress("Đang nén file...");
      const content = await zip.generateAsync({ type: "blob" });
      const factoryName =
        factory === "all"
          ? "tat_ca"
          : (factories.find((f) => f.id === factory)?.name || factory).replace(
              /[/\\:*?"<>|]/g,
              "_",
            );
      saveAs(content, `CCCD_${factoryName}_${from}_${to}.zip`);

      toast.success(`Đã xuất ${count} ảnh CCCD`);
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "Lỗi xuất CCCD");
    } finally {
      setExporting(false);
      setProgress("");
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
            <span className="font-semibold text-primary">{matchingUsers.length}</span> người lao
            động có ảnh CCCD phù hợp
          </div>

          {progress && (
            <div className="rounded-xl bg-primary/5 p-2.5 text-center text-xs text-primary">
              {progress}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={exporting} className="rounded-xl">
            Đóng
          </Button>
          <Button
            onClick={doExport}
            disabled={exporting || !matchingUsers.length}
            className="rounded-xl"
          >
            {exporting ? "Đang xuất..." : "Tải ZIP"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
