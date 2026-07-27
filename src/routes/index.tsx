import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { pb, type UserRecord } from "@/lib/pocketbase";
import { useAuth } from "@/lib/auth";
import { useAppSettings } from "@/lib/app-settings";
import { isUserApproved } from "@/lib/user-approval";
import { getSeen } from "@/lib/seen";
import { BottomNav } from "@/components/layout/BottomNav";
import { FeatureTile } from "@/components/dashboard/FeatureTile";
import { DesktopAppShell } from "@/components/layout/DesktopAppShell";
import { RecruitmentChart } from "@/components/workforce/RecruitmentChart";
import { WorkforceInsightsCharts } from "@/components/workforce/WorkforceInsightsCharts";
import { FinanceDashboard } from "@/components/dashboard/FinanceDashboard";
import { fetchFactories, type FactoryRecord } from "@/lib/factories";
import { findActiveEmploymentByUser, type EmploymentHistoryRecord } from "@/lib/employment";
import { fetchFreshStaffWorkspace } from "@/lib/staff-permissions";
import { escapePb } from "@/lib/delegations";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Newspaper,
  Clock,
  BookOpen,
  MessageSquareWarning,
  Settings,
  Building2,
  CalendarCheck,
  Wallet,
  MessagesSquare,
  BusFront,
  Bell,
  ShieldCheck,
  Sprout,
  History,
  Users,
  LayoutGrid,
  Gamepad2,
  Gem,
  Bomb,
  ChevronRight,
  RefreshCw,
  NotebookPen,
  ClipboardCheck,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    if (!pb.authStore.isValid) throw redirect({ to: "/login", search: { redirect: "/" } as never });
    const u = pb.authStore.record as UserRecord | null;
    if (u && !isUserApproved(u)) throw redirect({ to: "/pending" });
    if (u?.role === "staff") throw redirect({ to: "/staff" });
  },
  component: DashboardPage,
});

type UtilKey = "utilities" | "entertainment" | null;

const APPROVAL_STATUSES = ["pending", "approved", "completed", "rejected"] as const;

type ApprovalStatusKey = (typeof APPROVAL_STATUSES)[number];

type ApprovalStats = Record<ApprovalStatusKey, number> & {
  totalAmount: number;
  amountByStatus: Record<ApprovalStatusKey, number>;
};

type ApprovalRequestSummary = {
  status?: string;
  amount?: number | string;
};

const APPROVAL_STATUS_META: Array<{
  key: ApprovalStatusKey;
  label: string;
  color: string;
}> = [
  { key: "pending", label: "Chờ duyệt", color: "#f59e0b" },
  { key: "approved", label: "Đã duyệt", color: "#10b981" },
  { key: "completed", label: "Hoàn thành", color: "#3b82f6" },
  { key: "rejected", label: "Từ chối", color: "#ef4444" },
];

const createEmptyApprovalStats = (): ApprovalStats => ({
  pending: 0,
  approved: 0,
  completed: 0,
  rejected: 0,
  totalAmount: 0,
  amountByStatus: {
    pending: 0,
    approved: 0,
    completed: 0,
    rejected: 0,
  },
});

const isApprovalStatus = (value?: string): value is ApprovalStatusKey =>
  Boolean(value && APPROVAL_STATUSES.includes(value as ApprovalStatusKey));

function DashboardPage() {
  const { loading, user, isAdmin } = useAuth();
  const { data: settings, logoUrl } = useAppSettings();
  const [pendingComplaintCount, setPendingComplaintCount] = useState(0);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const [unread, setUnread] = useState({ news: 0, chat: 0, check: 0, advances: 0 });
  const [openUtil, setOpenUtil] = useState<UtilKey>(null);
  const [reloading, setReloading] = useState(false);
  const [workforceHistories, setWorkforceHistories] = useState<EmploymentHistoryRecord[]>([]);
  const [workforceUsers, setWorkforceUsers] = useState<UserRecord[]>([]);
  const [workforceFactories, setWorkforceFactories] = useState<FactoryRecord[]>([]);
  const [workforceLoading, setWorkforceLoading] = useState(true);
  const [workforceError, setWorkforceError] = useState("");
  const [workforceReloadToken, setWorkforceReloadToken] = useState(0);
  const [approvalStats, setApprovalStats] = useState<ApprovalStats>(createEmptyApprovalStats);
  const [currentEmployment, setCurrentEmployment] = useState<EmploymentHistoryRecord | null>(null);
  const nav = useNavigate();
  const { hash } = useLocation();
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  const desktopSection: DesktopDashboardSection =
    normalizedHash === "tai-chinh" ? "tai-chinh" : normalizedHash === "khac" ? "khac" : "nhan-luc";

  const handleReload = async () => {
    if (reloading) return;
    setReloading(true);
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    window.location.reload();
  };

  useEffect(() => {
    if (!user?.id || isAdmin) {
      setCurrentEmployment(null);
      return;
    }
    let alive = true;
    findActiveEmploymentByUser(user.id)
      .then((history) => alive && setCurrentEmployment(history))
      .catch(() => alive && setCurrentEmployment(null));
    return () => {
      alive = false;
    };
  }, [isAdmin, user?.id]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      nav({ to: "/login" });
      return;
    }
    if (user.role === "staff") {
      nav({ to: "/staff" });
      return;
    }
    if (!isUserApproved(user)) {
      nav({ to: "/pending" });
    }
  }, [loading, nav, user]);

  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;

    (async () => {
      try {
        const res = await pb.collection("complaints").getList(1, 1, {
          filter: 'status = "pending"',
        });
        if (alive) setPendingComplaintCount(res.totalItems || 0);
      } catch {
        if (alive) setPendingComplaintCount(0);
      }
    })();

    return () => {
      alive = false;
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin || !user?.id) return;
    let alive = true;

    (async () => {
      try {
        const res = await pb.collection("approval_responses").getList(1, 1, {
          filter: `admin = "${user.id}" && status = "pending"`,
        });
        if (alive) setPendingApprovalCount(res.totalItems || 0);
      } catch {
        if (alive) setPendingApprovalCount(0);
      }
    })();

    return () => {
      alive = false;
    };
  }, [isAdmin, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let alive = true;

    const since = (scope: string) => {
      const ts = getSeen(scope, user.id);
      return ts ? new Date(ts).toISOString().replace("T", " ") : "";
    };
    const countNewer = async (
      collection: string,
      field: string,
      scope: string,
      extraFilter = "",
    ) => {
      const seen = since(scope);
      const parts = [extraFilter, seen ? `${field} > "${seen}"` : ""].filter(Boolean);
      const res = await pb.collection(collection).getList(1, 1, {
        filter: parts.join(" && "),
      });
      return res.totalItems || 0;
    };

    (async () => {
      const me = `user = "${user.id}"`;
      const chatCount = async () => {
        try {
          const memberships = await pb.collection("chat_room_members").getFullList({
            filter: `user = "${user.id}"`,
          });
          const roomIds = (memberships as Array<{ room: string }>).map((m) => m.room);
          if (!roomIds.length) return 0;
          let total = 0;
          for (const roomId of roomIds) {
            const seen = getSeen(`chat:${roomId}`, user.id);
            const seenIso = seen ? new Date(seen).toISOString().replace("T", " ") : "";
            const filter = [
              `room = "${roomId}"`,
              `user != "${user.id}"`,
              seenIso ? `created > "${seenIso}"` : "",
            ]
              .filter(Boolean)
              .join(" && ");
            const res = await pb.collection("group_chat_messages").getList(1, 1, { filter });
            total += res.totalItems || 0;
          }
          return total;
        } catch {
          return 0;
        }
      };
      const [news, chat, check, salary, advances] = await Promise.all([
        countNewer("recruitments", "created", "news", "is_active = true").catch(() => 0),
        chatCount(),
        countNewer("check_attendance_items", "created", "check-attendance", me).catch(() => 0),
        countNewer("check_salary_items", "created", "check-attendance", me).catch(() => 0),
        countNewer("advances", "resolved_at", "advances", me).catch(() => 0),
      ]);
      if (alive) setUnread({ news, chat, check: check + salary, advances });
    })();

    return () => {
      alive = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!isAdmin || !user?.id || desktopSection !== "nhan-luc" || typeof window === "undefined") {
      return;
    }
    if (!window.matchMedia("(min-width: 1024px)").matches) return;

    let alive = true;
    setWorkforceLoading(true);
    setWorkforceError("");

    Promise.all([
      fetchFreshStaffWorkspace(user as UserRecord),
      pb.collection("users").getFullList<UserRecord>({
        filter: `role="staff" || role="admin"`,
        sort: "full_name,username",
      }),
      fetchFactories(),
    ])
      .then(([workspace, staffAdminUsers, factories]) => {
        if (!alive) return;
        const workerUsers = workspace.workers.map((worker) => worker.user);
        const workerIds = new Set(workerUsers.map((worker) => worker.id));
        setWorkforceHistories(workspace.workers.flatMap((worker) => worker.histories));
        setWorkforceUsers([
          ...workerUsers,
          ...staffAdminUsers.filter((staff) => !workerIds.has(staff.id)),
        ]);
        setWorkforceFactories(factories);
      })
      .catch(() => {
        if (!alive) return;
        setWorkforceHistories([]);
        setWorkforceUsers([]);
        setWorkforceFactories([]);
        setWorkforceError("Không tải được dữ liệu nhân lực. Vui lòng thử lại.");
      })
      .finally(() => {
        if (alive) setWorkforceLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [desktopSection, isAdmin, user, workforceReloadToken]);

  useEffect(() => {
    if (!isAdmin || !user?.id || desktopSection !== "khac" || typeof window === "undefined") {
      return;
    }
    if (!window.matchMedia("(min-width: 1024px)").matches) return;

    let alive = true;
    const userId = escapePb(user.id);
    const rolePart = `(admins ~ "${userId}" || creator = "${userId}")`;

    pb.collection("approval_requests")
      .getFullList<ApprovalRequestSummary>({
        filter: rolePart,
        fields: "status,amount",
      })
      .then((requests) => {
        if (!alive) return;
        const nextStats = createEmptyApprovalStats();

        for (const request of requests) {
          if (!isApprovalStatus(request.status)) continue;
          const status = request.status;
          const amount = Math.max(0, Number(request.amount) || 0);
          nextStats[status] += 1;
          nextStats.amountByStatus[status] += amount;
          nextStats.totalAmount += amount;
        }

        setApprovalStats(nextStats);
      })
      .catch(() => {
        if (alive) setApprovalStats(createEmptyApprovalStats());
      });

    return () => {
      alive = false;
    };
  }, [desktopSection, isAdmin, user?.id]);

  if (loading || !user || !isUserApproved(user)) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center px-4 text-sm text-muted-foreground">
        Đang kiểm tra đăng nhập...
      </div>
    );
  }

  const hasEmployment = Boolean(currentEmployment);
  const workDisabled = !isAdmin && !hasEmployment;
  const workDisabledReason =
    "Tính năng này chỉ dùng được khi bạn đã được admin gắn mã NV và nhà máy. Vui lòng liên hệ admin để cập nhật hồ sơ.";

  const toBadge = (count: number) => (count > 0 ? (count > 9 ? "9+" : String(count)) : undefined);

  const summaryParts: string[] = [];
  if (unread.news > 0) summaryParts.push(`${unread.news} tin tuyển dụng mới`);
  if (!workDisabled) {
    if (unread.check > 0) summaryParts.push(`${unread.check} bảng công/lương mới`);
    if (unread.advances > 0) summaryParts.push(`${unread.advances} phản hồi ứng lương`);
  }
  if (unread.chat > 0) summaryParts.push(`${unread.chat} tin nhắn chưa đọc`);
  const summaryText = summaryParts.join(" · ");

  return (
    <div className="pb-nav">
      {isAdmin && (
        <DesktopAppShell>
          <DesktopAdminDashboard
            section={desktopSection}
            histories={workforceHistories}
            users={workforceUsers}
            factories={workforceFactories}
            loading={workforceLoading}
            error={workforceError}
            approvalStats={approvalStats}
            onRetry={() => setWorkforceReloadToken((value) => value + 1)}
          />
        </DesktopAppShell>
      )}
      <div className="sticky top-0 z-10 px-4 pb-2 pt-4 desktop:hidden">
        <div className="gradient-hero relative overflow-hidden rounded-[1.75rem] px-5 py-5 text-white shadow-soft">
          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/20 blur-2xl" />
          <div className="absolute -bottom-16 -left-8 h-44 w-44 rounded-full bg-white/10 blur-2xl" />

          <div className="relative flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white/95 shadow-soft">
              {logoUrl ? (
                <img src={logoUrl} alt="logo" className="logo-fit" />
              ) : (
                <Building2 className="h-6 w-6 text-primary" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-semibold leading-tight">
                {settings.company_name}
              </div>
              {settings.slogan && (
                <div className="truncate text-xs text-white/80">{settings.slogan}</div>
              )}
            </div>
            <button
              type="button"
              onClick={handleReload}
              disabled={reloading}
              aria-label="Tải lại trang"
              title="Tải lại trang"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-white shadow-sm backdrop-blur transition hover:bg-white/30 active:scale-95 disabled:opacity-70"
            >
              <RefreshCw className={reloading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            </button>
          </div>

          <div className="relative mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <div className="text-sm text-white/80">Xin chào,</div>
            <div className="text-base font-semibold leading-tight">
              {user?.full_name || user?.username || "Bạn"}
            </div>

            <div className="inline-flex items-center rounded-full bg-white/20 px-2.5 py-0.5 text-[8px] uppercase tracking-wider backdrop-blur">
              {isAdmin ? "Quản trị viên" : "Nhân viên"}
            </div>
            {!isAdmin && hasEmployment && (
              <div className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] backdrop-blur">
                {currentEmployment?.expand?.factory?.name || "Chưa có nhà máy"}
              </div>
            )}
          </div>

          {summaryText && (
            <div className="relative mt-3 flex items-start gap-2 rounded-2xl bg-white/15 px-3 py-2 backdrop-blur">
              <Bell className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="text-xs leading-snug">{summaryText}</div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4 px-4 pt-2 desktop:hidden">
        {isAdmin && (
          <section className="rounded-3xl bg-card p-3 shadow-soft">
            <div className="flex items-center justify-between px-1 pb-2 pt-1">
              <div>
                <div className="text-sm font-semibold tracking-tight">Quản trị</div>
                <div className="text-[11px] text-muted-foreground">Chỉ dành cho admin</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <FeatureTile
                to="/admin/workforce"
                label="Nhân sự đi làm"
                description="Tuyển dụng & danh sách NLĐ"
                icon={Users}
              />
              <FeatureTile
                to="/staff/approvals"
                label="Phê duyệt"
                description="Yêu cầu từ staff"
                icon={ClipboardCheck}
                badge={toBadge(pendingApprovalCount)}
              />
              <FeatureTile
                to="/staff/salary-holds"
                label="Giữ lương"
                description="Duyệt và giải ngân yêu cầu"
                icon={Wallet}
              />
              <FeatureTile
                to="/admin/staff"
                label="Quản lý staff"
                description="Tạo, import tài khoản staff"
                icon={ShieldCheck}
              />
              <FeatureTile
                to="/admin/settings"
                label="Cài đặt"
                description="Quản trị hệ thống"
                icon={Settings}
              />
            </div>
          </section>
        )}

        <section>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setOpenUtil("utilities")}
              className="group relative overflow-hidden rounded-3xl border bg-card p-4 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)] active:scale-[0.98]"
            >
              <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/10 blur-2xl transition-transform group-hover:scale-110" />
              <div className="relative flex items-start justify-between gap-2">
                <div className="gradient-primary flex h-11 w-11 items-center justify-center rounded-2xl text-primary-foreground shadow-sm">
                  <LayoutGrid className="h-5 w-5" />
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
              <div className="relative mt-3">
                <div className="text-sm font-semibold tracking-tight">Tiện ích</div>
                <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  Bảng tin, nhà xe, trò chuyện, hướng dẫn
                </div>
              </div>
              {(unread.news > 0 || unread.chat > 0) && (
                <span className="absolute right-3 top-3 inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                  {(() => {
                    const total = unread.news + unread.chat;
                    return total > 9 ? "9+" : total;
                  })()}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setOpenUtil("entertainment")}
              className="group relative overflow-hidden rounded-3xl border bg-card p-4 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)] active:scale-[0.98]"
            >
              <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-accent/40 blur-2xl transition-transform group-hover:scale-110" />
              <div className="relative flex items-start justify-between gap-2">
                <div className="gradient-accent flex h-11 w-11 items-center justify-center rounded-2xl text-accent-foreground shadow-sm">
                  <Gamepad2 className="h-5 w-5" />
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
              <div className="relative mt-3">
                <div className="text-sm font-semibold tracking-tight">Giải trí</div>
                <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  Vườn cây và các trò chơi thư giãn
                </div>
              </div>
            </button>
          </div>
        </section>

        <section className="rounded-3xl bg-card p-3 shadow-soft">
          <div className="flex items-center justify-between px-1 pb-2 pt-1">
            <div>
              <div className="text-sm font-semibold tracking-tight">Khi bạn đã đi làm</div>
              <div className="text-[11px] text-muted-foreground">
                {workDisabled
                  ? "Cần admin gắn mã NV để mở khoá"
                  : "Dành cho nhân sự đã được admin xác nhận"}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <FeatureTile
              to="/advances"
              label="Ứng lương"
              description="Xin ứng lương"
              icon={Wallet}
              variant="accent"
              disabled={workDisabled}
              disabledReason={workDisabledReason}
              badge={workDisabled ? undefined : toBadge(unread.advances)}
            />
            <FeatureTile
              to="/complaints"
              label="Khiếu nại"
              description="Gửi phản ánh"
              icon={MessageSquareWarning}
              variant="accent"
              disabled={workDisabled}
              disabledReason={workDisabledReason}
              badge={
                !workDisabled && isAdmin && pendingComplaintCount > 0
                  ? pendingComplaintCount > 9
                    ? "9+"
                    : String(pendingComplaintCount)
                  : undefined
              }
            />
            <FeatureTile
              to="/check-attendance"
              label="Check công/lương"
              description="Kiểm tra bảng công"
              icon={CalendarCheck}
              variant="accent"
              disabled={workDisabled}
              disabledReason={workDisabledReason}
              badge={workDisabled ? undefined : toBadge(unread.check)}
            />
            <FeatureTile
              to="/attendance"
              label="Tự chấm công"
              description="Ghi nhận giờ làm"
              icon={Clock}
              variant="accent"
              disabled={workDisabled}
              disabledReason={workDisabledReason}
            />
            {!isAdmin && (
              <FeatureTile
                to="/work-history"
                label="Lịch sử đi làm"
                description="Nhà máy, ngày vào/nghỉ"
                icon={History}
                variant="accent"
                disabled={workDisabled}
                disabledReason={workDisabledReason}
              />
            )}
          </div>
        </section>
      </div>

      <BottomNav />

      <Dialog open={openUtil !== null} onOpenChange={(o) => !o && setOpenUtil(null)}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {openUtil === "utilities" ? (
                <>
                  <div className="gradient-primary flex h-8 w-8 items-center justify-center rounded-xl text-primary-foreground shadow-sm">
                    <LayoutGrid className="h-4 w-4" />
                  </div>
                  Tiện ích
                </>
              ) : (
                <>
                  <div className="gradient-accent flex h-8 w-8 items-center justify-center rounded-xl text-accent-foreground shadow-sm">
                    <Gamepad2 className="h-4 w-4" />
                  </div>
                  Giải trí
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {openUtil === "utilities"
                ? "Các tiện ích dành cho mọi người dùng"
                : "Chơi và thư giãn"}
            </DialogDescription>
          </DialogHeader>

          {openUtil === "utilities" && (
            <div className="grid grid-cols-3 gap-2" onClick={() => setOpenUtil(null)}>
              <FeatureTile
                to="/news"
                label="Bảng tin"
                icon={Newspaper}
                size="compact"
                badge={toBadge(unread.news)}
              />
              <FeatureTile to="/transport" label="Tìm nhà xe" icon={BusFront} size="compact" />
              <FeatureTile
                to="/chat"
                label="Trò chuyện"
                icon={MessagesSquare}
                size="compact"
                badge={toBadge(unread.chat)}
              />
              <FeatureTile to="/guides" label="Hướng dẫn" icon={BookOpen} size="compact" />
              <FeatureTile to="/notebook" label="Sổ tay" icon={NotebookPen} size="compact" />
              {isAdmin && (
                <FeatureTile
                  to="/admin/accounts/stats"
                  label="Thống kê TK"
                  icon={Users}
                  size="compact"
                />
              )}
            </div>
          )}

          {openUtil === "entertainment" && (
            <div className="grid grid-cols-3 gap-2" onClick={() => setOpenUtil(null)}>
              <FeatureTile to="/garden" label="Vườn cây" icon={Sprout} size="compact" />
              <FeatureTile to="/gems" label="Xếp kim cương" icon={Gem} size="compact" />
              <FeatureTile to="/minesweeper" label="Dò mìn" icon={Bomb} size="compact" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

type DesktopDashboardSection = "nhan-luc" | "tai-chinh" | "khac";

function DesktopAdminDashboard({
  section,
  histories,
  users,
  factories,
  loading,
  error,
  approvalStats,
  onRetry,
}: {
  section: DesktopDashboardSection;
  histories: EmploymentHistoryRecord[];
  users: UserRecord[];
  factories: FactoryRecord[];
  loading: boolean;
  error: string;
  approvalStats: ApprovalStats;
  onRetry: () => void;
}) {
  const workingUsers = new Set(
    histories
      .filter((history) => history.status === "working" && !history.leave_date)
      .map((history) => history.user),
  ).size;
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);
  const recruitedLastSevenDays = histories.filter((history) => {
    if (!history.join_date) return false;
    const joinDate = new Date(history.join_date);
    return !Number.isNaN(joinDate.getTime()) && joinDate >= sevenDaysAgo;
  }).length;

  const sectionMeta = {
    "nhan-luc": {
      title: "Nhân lực",
      description: "Theo dõi tình hình tuyển dụng và lao động trong 7 ngày gần nhất.",
      icon: Users,
    },
    "tai-chinh": {
      title: "Tài chính",
      description: "Không gian tổng hợp các chức năng tài chính.",
      icon: Wallet,
    },
    khac: {
      title: "Khác",
      description: "Các thông tin và tiện ích quản trị khác.",
      icon: LayoutGrid,
    },
  }[section];
  const SectionIcon = sectionMeta.icon;

  return (
    <main
      data-admin-dashboard-content={section}
      className="hidden min-h-[calc(100dvh-5rem)] min-w-0 bg-background desktop:block"
    >
      <div className="mx-auto w-full max-w-[110rem] space-y-6 px-8 py-7">
        <section id={section} className="space-y-4 scroll-mt-28">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <SectionIcon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">{sectionMeta.title}</h2>
              <p className="text-sm text-muted-foreground">{sectionMeta.description}</p>
            </div>
          </div>

          {section === "nhan-luc" ? (
            <>
              <div className="sticky top-20 z-20 -mx-2 bg-background/95 px-2 py-2 backdrop-blur">
                <div className="grid grid-cols-4 gap-4">
                  <DesktopSummaryCard label="Tổng lao động" value={users.length} icon={Users} />
                  <DesktopSummaryCard
                    label="Còn đi làm"
                    value={workingUsers}
                    icon={CalendarCheck}
                  />
                  <DesktopSummaryCard
                    label="Tuyển mới 7 ngày"
                    value={recruitedLastSevenDays}
                    icon={ClipboardCheck}
                  />
                  <DesktopSummaryCard label="Nhà máy" value={factories.length} icon={Building2} />
                </div>
              </div>

              <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-soft">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold">Biểu đồ tuyển dụng 7 ngày</h3>
                    <p className="text-xs text-muted-foreground">
                      Cột thể hiện tuyển mới, đường thể hiện số lao động còn đi làm.
                    </p>
                  </div>
                  <Link
                    to="/admin/workforce"
                    className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    Xem chi tiết
                  </Link>
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
                  <RecruitmentChart histories={histories} users={users} factories={factories} />
                )}
              </div>

              {!loading && !error && (
                <WorkforceInsightsCharts
                  histories={histories}
                  users={users}
                  factories={factories}
                />
              )}
            </>
          ) : section === "tai-chinh" ? (
            <FinanceDashboard />
          ) : (
            <ApprovalDashboard stats={approvalStats} />
          )}
        </section>
      </div>
    </main>
  );
}

function formatApprovalMoney(value: number) {
  return `${Math.round(value).toLocaleString("vi-VN")} đ`;
}

function formatCompactMoney(value: number) {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tỷ`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toLocaleString("vi-VN", { maximumFractionDigits: 0 })} nghìn`;
  }
  return value.toLocaleString("vi-VN");
}

function ApprovalDashboard({ stats }: { stats: ApprovalStats }) {
  const totalRequests = APPROVAL_STATUSES.reduce((total, status) => total + stats[status], 0);
  const chartData = APPROVAL_STATUS_META.map((item) => ({
    ...item,
    count: stats[item.key],
    amount: stats.amountByStatus[item.key],
  }));
  const tooltipStyle = {
    borderRadius: "12px",
    borderColor: "var(--border)",
    backgroundColor: "var(--card)",
    color: "var(--foreground)",
  };

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-soft">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Thống kê phê duyệt</h3>
            <p className="text-xs text-muted-foreground">
              Trực quan hóa số lượng và số tiền theo trạng thái yêu cầu.
            </p>
          </div>
          <Link
            to="/staff/approvals"
            className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            Xem chi tiết
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6">
          <DesktopSummaryCard label="Tổng yêu cầu" value={totalRequests} icon={ClipboardCheck} />
          <DesktopSummaryCard
            label="Tổng số tiền"
            value={formatApprovalMoney(stats.totalAmount)}
            icon={Wallet}
          />
          <DesktopSummaryCard label="Chờ duyệt" value={stats.pending} icon={Clock} />
          <DesktopSummaryCard label="Đã duyệt" value={stats.approved} icon={ShieldCheck} />
          <DesktopSummaryCard label="Hoàn thành" value={stats.completed} icon={CalendarCheck} />
          <DesktopSummaryCard label="Từ chối" value={stats.rejected} icon={MessageSquareWarning} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="min-w-0 rounded-3xl border border-border/70 bg-card p-5 shadow-soft">
          <div className="mb-4">
            <h3 className="text-sm font-semibold">Số lượng theo trạng thái</h3>
            <p className="text-xs text-muted-foreground">Mỗi cột là tổng số yêu cầu.</p>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} fontSize={12} />
                <YAxis axisLine={false} tickLine={false} allowDecimals={false} fontSize={12} />
                <RechartsTooltip
                  cursor={{ fill: "var(--muted)" }}
                  contentStyle={tooltipStyle}
                  formatter={(value) => [Number(value || 0).toLocaleString("vi-VN"), "Số yêu cầu"]}
                />
                <Bar dataKey="count" radius={[8, 8, 0, 0]} maxBarSize={58}>
                  {chartData.map((item) => (
                    <Cell key={item.key} fill={item.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="min-w-0 rounded-3xl border border-border/70 bg-card p-5 shadow-soft">
          <div className="mb-4">
            <h3 className="text-sm font-semibold">Số tiền theo trạng thái</h3>
            <p className="text-xs text-muted-foreground">
              Tổng tiền của các yêu cầu có khai báo số tiền.
            </p>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} fontSize={12} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  fontSize={12}
                  width={58}
                  tickFormatter={(value) => formatCompactMoney(Number(value))}
                />
                <RechartsTooltip
                  cursor={{ fill: "var(--muted)" }}
                  contentStyle={tooltipStyle}
                  formatter={(value) => [formatApprovalMoney(Number(value || 0)), "Số tiền"]}
                />
                <Bar dataKey="amount" radius={[8, 8, 0, 0]} maxBarSize={58}>
                  {chartData.map((item) => (
                    <Cell key={item.key} fill={item.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function DesktopSummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
