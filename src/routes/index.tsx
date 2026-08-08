import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { pb, type UserRecord } from "@/lib/pocketbase";
import { useAuth } from "@/lib/auth";
import { useAppSettings } from "@/lib/app-settings";
import { isUserApproved } from "@/lib/user-approval";
import { getSeen } from "@/lib/seen";
import { getClientDeviceProfile } from "@/lib/device-profile";
import { MobileSection } from "@/components/layout/MobileSection";
import { BottomNav } from "@/components/layout/BottomNav";
import { FeatureTile } from "@/components/dashboard/FeatureTile";
import { DesktopAppShell } from "@/components/layout/DesktopAppShell";
import { WorkforceDashboard } from "@/components/workforce/WorkforceDashboard";
import { FinanceDashboard } from "@/components/dashboard/FinanceDashboard";
import { OtherDashboard } from "@/components/dashboard/OtherDashboard";
import { ApprovalDashboard } from "@/components/dashboard/ApprovalDashboard";
import { WorkProgressBoard } from "@/components/dashboard/WorkProgressBoard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createEmptyApprovalDashboardStats,
  isApprovalDashboardStatus,
  type ApprovalDashboardStats,
} from "@/lib/approval-dashboard";
import { fetchFactories, type FactoryRecord } from "@/lib/factories";
import { findActiveEmploymentByUser, type EmploymentHistoryRecord } from "@/lib/employment";
import { fetchFreshStaffWorkspace } from "@/lib/staff-permissions";
import { escapePb } from "@/lib/delegations";
import { fetchCccdVersionsByIds, type CccdVersionRecord } from "@/lib/cccd-versions";
import { getRecentDateKeys } from "@/lib/workforce-other-stats";
import {
  Newspaper,
  BriefcaseBusiness,
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
  User,
  Users,
  LayoutGrid,
  ListOrdered,
  Gamepad2,
  Gem,
  Bomb,
  ChevronRight,
  RefreshCw,
  NotebookPen,
  ClipboardCheck,
  ClipboardList,
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
    if (u?.role === "user" && getClientDeviceProfile() === "desktop") {
      throw redirect({ to: "/attendance" });
    }
  },
  component: DashboardPage,
});

type UtilKey = "utilities" | "entertainment" | null;

const APPROVAL_STATUSES = ["pending", "approved", "completed", "rejected"] as const;

type ApprovalStatusKey = (typeof APPROVAL_STATUSES)[number];

type ApprovalRequestSummary = {
  status?: string;
  amount?: number | string;
};

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
  const [workforceCccdVersions, setWorkforceCccdVersions] = useState<CccdVersionRecord[]>([]);
  const [workforceLoading, setWorkforceLoading] = useState(true);
  const [workforceError, setWorkforceError] = useState("");
  const [workforceReloadToken, setWorkforceReloadToken] = useState(0);
  const [approvalStats, setApprovalStats] = useState<ApprovalDashboardStats>(
    createEmptyApprovalDashboardStats,
  );
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
    if (user.role === "user" && getClientDeviceProfile() === "desktop") {
      nav({ to: "/attendance" });
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
          const roomIds = (memberships as unknown as Array<{ room: string }>).map((m) => m.room);
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
    if (
      !isAdmin ||
      !user?.id ||
      (desktopSection !== "nhan-luc" && desktopSection !== "khac") ||
      typeof window === "undefined"
    ) {
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
      .then(async ([workspace, staffAdminUsers, factories]) => {
        const histories = workspace.workers.flatMap((worker) => worker.histories);
        const recentDates = new Set(getRecentDateKeys());
        const referencedVersionIds =
          desktopSection === "khac"
            ? histories
                .filter((history) => recentDates.has(history.join_date.slice(0, 10)))
                .map((history) => history.cccd_version || "")
                .filter(Boolean)
            : [];
        const cccdVersions = referencedVersionIds.length
          ? await fetchCccdVersionsByIds(referencedVersionIds).catch(() => [])
          : [];

        if (!alive) return;
        const workerUsers = workspace.workers.map((worker) => worker.user);
        const workerIds = new Set(workerUsers.map((worker) => worker.id));
        setWorkforceHistories(histories);
        setWorkforceUsers([
          ...workerUsers,
          ...staffAdminUsers.filter((staff) => !workerIds.has(staff.id)),
        ]);
        setWorkforceFactories(factories);
        setWorkforceCccdVersions(cccdVersions);
      })
      .catch(() => {
        if (!alive) return;
        setWorkforceHistories([]);
        setWorkforceUsers([]);
        setWorkforceFactories([]);
        setWorkforceCccdVersions([]);
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
        const nextStats = createEmptyApprovalDashboardStats();

        for (const request of requests) {
          if (!isApprovalDashboardStatus(request.status)) continue;
          const status = request.status;
          const amount = Math.max(0, Number(request.amount) || 0);
          nextStats[status] += 1;
          nextStats.amountByStatus[status] += amount;
          nextStats.totalAmount += amount;
        }

        setApprovalStats(nextStats);
      })
      .catch(() => {
        if (alive) setApprovalStats(createEmptyApprovalDashboardStats());
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
            cccdVersions={workforceCccdVersions}
            loading={workforceLoading}
            error={workforceError}
            approvalStats={approvalStats}
            onRetry={() => setWorkforceReloadToken((value) => value + 1)}
          />
        </DesktopAppShell>
      )}
      <div className="px-4 pb-2 pt-3 desktop:hidden">
        <div className="gradient-hero relative overflow-hidden rounded-3xl px-4 py-4 text-white shadow-soft">
          <div className="absolute -right-12 -top-12 h-36 w-36 rounded-full bg-white/20 blur-2xl" />
          <div className="absolute -bottom-16 -left-8 h-40 w-40 rounded-full bg-white/10 blur-2xl" />

          <div className="relative flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/95 shadow-soft">
              {logoUrl ? (
                <img src={logoUrl} alt="logo" className="logo-fit" />
              ) : (
                <Building2 className="h-6 w-6 text-primary" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-semibold leading-6">
                {settings.company_name}
              </div>
              {settings.slogan && (
                <div className="truncate text-xs leading-5 text-white/80">{settings.slogan}</div>
              )}
            </div>
            <button
              type="button"
              onClick={handleReload}
              disabled={reloading}
              aria-label="Tải lại trang"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur transition active:scale-95 disabled:opacity-70"
            >
              <RefreshCw className={reloading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            </button>
          </div>

          <div className="relative mt-3 flex flex-wrap items-center gap-2">
            <span className="text-sm text-white/80">Xin chào,</span>
            <span className="text-base font-semibold leading-6">
              {user?.full_name || user?.username || "Bạn"}
            </span>
            <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold backdrop-blur">
              {isAdmin ? "Quản trị viên" : "Nhân viên"}
            </span>
            {!isAdmin && hasEmployment && (
              <span className="max-w-full truncate rounded-full bg-white/15 px-2.5 py-1 text-xs backdrop-blur">
                {currentEmployment?.expand?.factory?.name || "Chưa có nhà máy"}
              </span>
            )}
          </div>

          {summaryText && (
            <div className="relative mt-3 flex items-start gap-2 rounded-2xl bg-white/15 px-3 py-2.5 text-sm leading-5 backdrop-blur">
              <Bell className="mt-0.5 h-4 w-4 shrink-0" />
              <div>{summaryText}</div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-5 px-4 pt-2 desktop:hidden">
        {isAdmin ? (
          <>
            <MobileSection
              title="Nhóm chính"
              description="Các nghiệp vụ nhân sự và tài chính cần xử lý thường xuyên"
            >
              <div className="grid grid-cols-2 gap-3">
                <FeatureTile
                  to="/admin/workforce"
                  label="Nhân sự đi làm"
                  description="Danh sách và tình trạng lao động"
                  icon={Users}
                  variant="accent"
                />
                <FeatureTile
                  to="/advances"
                  label="Ứng lương"
                  description="Tiếp nhận và giải ngân"
                  icon={Wallet}
                  variant="accent"
                />
                <FeatureTile
                  to="/staff/approvals"
                  label="Phê duyệt"
                  description="Yêu cầu nghiệp vụ"
                  icon={ClipboardCheck}
                  badge={toBadge(pendingApprovalCount)}
                />
                <FeatureTile
                  to="/staff/salary-holds"
                  label="Giữ lương"
                  description="Duyệt và giải ngân yêu cầu"
                  icon={ShieldCheck}
                />
              </div>
            </MobileSection>

            <MobileSection title="Quản trị" description="Kiểm tra dữ liệu và cấu hình hệ thống">
              <div className="grid grid-cols-2 gap-3">
                <FeatureTile
                  to="/check-attendance"
                  label="Check công/lương"
                  description="Kiểm tra bảng công và lương"
                  icon={CalendarCheck}
                  variant="accent"
                />
                <FeatureTile
                  to="/complaints"
                  label="Khiếu nại"
                  description="Tiếp nhận phản ánh"
                  icon={MessageSquareWarning}
                  variant="accent"
                  badge={toBadge(pendingComplaintCount)}
                />
                <FeatureTile
                  to="/attendance"
                  label="Tự chấm công"
                  description="Ghi nhận giờ làm"
                  icon={Clock}
                />
                <FeatureTile
                  to="/admin/settings"
                  label="Cài đặt"
                  description="Thiết lập hệ thống"
                  icon={Settings}
                />
                <FeatureTile
                  to="/admin/work-progress"
                  label="Tiến độ công việc"
                  description="Theo dõi công việc chung"
                  icon={ClipboardList}
                  variant="accent"
                />
              </div>
            </MobileSection>

            <MobileSection title="Khác" description="Tiện ích, giải trí và thông tin tài khoản">
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setOpenUtil("utilities")}
                  className="group relative flex min-h-[94px] flex-col items-center gap-2 rounded-2xl border border-border/70 bg-card p-3 text-center shadow-soft transition-colors active:scale-[0.98]"
                >
                  <div className="gradient-primary flex h-10 w-10 items-center justify-center rounded-xl text-primary-foreground">
                    <LayoutGrid className="h-[18px] w-[18px]" />
                  </div>
                  <span className="w-full text-xs font-semibold">Tiện ích</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOpenUtil("entertainment")}
                  className="group relative flex min-h-[94px] flex-col items-center gap-2 rounded-2xl border border-border/70 bg-card p-3 text-center shadow-soft transition-colors active:scale-[0.98]"
                >
                  <div className="gradient-accent flex h-10 w-10 items-center justify-center rounded-xl text-accent-foreground">
                    <Gamepad2 className="h-[18px] w-[18px]" />
                  </div>
                  <span className="w-full text-xs font-semibold">Giải trí</span>
                </button>
                <FeatureTile to="/account" label="Tài khoản" icon={User} size="compact" />
              </div>
            </MobileSection>
          </>
        ) : (
          <>
            <section aria-label="Tiện ích và giải trí">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setOpenUtil("utilities")}
                  className="group relative overflow-hidden rounded-3xl border border-border/70 bg-card p-4 text-left shadow-soft transition active:scale-[0.98]"
                >
                  <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />
                  <div className="relative flex items-start justify-between gap-2">
                    <div className="gradient-primary flex h-11 w-11 items-center justify-center rounded-2xl text-primary-foreground shadow-sm">
                      <LayoutGrid className="h-5 w-5" />
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="relative mt-3 text-sm font-semibold">Tiện ích</div>
                  <div className="relative mt-1 text-xs leading-5 text-muted-foreground">
                    Bảng tin, sổ tay và công cụ
                  </div>
                  {(unread.news > 0 || unread.chat > 0) && (
                    <span className="absolute right-3 top-3 inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold text-white shadow-sm">
                      {toBadge(unread.news + unread.chat)}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setOpenUtil("entertainment")}
                  className="group relative overflow-hidden rounded-3xl border border-border/70 bg-card p-4 text-left shadow-soft transition active:scale-[0.98]"
                >
                  <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-accent/40 blur-2xl" />
                  <div className="relative flex items-start justify-between gap-2">
                    <div className="gradient-accent flex h-11 w-11 items-center justify-center rounded-2xl text-accent-foreground shadow-sm">
                      <Gamepad2 className="h-5 w-5" />
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="relative mt-3 text-sm font-semibold">Giải trí</div>
                  <div className="relative mt-1 text-xs leading-5 text-muted-foreground">
                    Ba trò chơi thư giãn
                  </div>
                </button>
              </div>
            </section>

            <MobileSection
              title="Khi đã đi làm"
              description={
                workDisabled
                  ? "Cần admin gắn mã nhân viên và nhà máy để mở khóa"
                  : "Các chức năng dành cho người lao động đang đi làm"
              }
            >
              <div className="grid grid-cols-2 gap-3">
                <FeatureTile
                  to="/advances"
                  label="Ứng lương"
                  description="Gửi và theo dõi yêu cầu"
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
                <FeatureTile
                  to="/work-history"
                  label="Lịch sử đi làm"
                  description="Nhà máy, ngày vào/nghỉ"
                  icon={History}
                  variant="accent"
                  disabled={workDisabled}
                  disabledReason={workDisabledReason}
                />
              </div>
            </MobileSection>

            {workDisabled && (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-5 text-amber-900">
                <BriefcaseBusiness className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <div className="font-semibold">Hoàn thiện hồ sơ để mở chức năng</div>
                  <div className="mt-1">
                    Admin cần gắn mã nhân viên và nhà máy trước khi bạn chấm công hoặc ứng lương.
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <BottomNav />

      <Dialog open={openUtil !== null} onOpenChange={(open) => !open && setOpenUtil(null)}>
        <DialogContent className="rounded-3xl desktop:hidden">
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
              {openUtil === "utilities" ? "Chọn tiện ích cần sử dụng" : "Chơi và thư giãn"}
            </DialogDescription>
          </DialogHeader>

          {openUtil === "utilities" && (
            <div className="grid grid-cols-3 gap-2" onClick={() => setOpenUtil(null)}>
              {isAdmin ? (
                <>
                  <FeatureTile
                    to="/news"
                    label="Bảng tin"
                    icon={Newspaper}
                    size="compact"
                    badge={toBadge(unread.news)}
                  />
                  <FeatureTile to="/notebook" label="Sổ tay" icon={NotebookPen} size="compact" />
                  <FeatureTile
                    to="/admin/accounts/stats"
                    label="Thống kê"
                    icon={Users}
                    size="compact"
                  />
                  <FeatureTile
                    to="/chat"
                    label="Trò chuyện"
                    icon={MessagesSquare}
                    size="compact"
                    badge={toBadge(unread.chat)}
                  />
                  <FeatureTile to="/transport" label="Tìm nhà xe" icon={BusFront} size="compact" />
                  <FeatureTile to="/guides" label="Hướng dẫn" icon={BookOpen} size="compact" />
                </>
              ) : (
                <>
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
                  <FeatureTile to="/counter" label="Bộ đếm" icon={ListOrdered} size="compact" />
                </>
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
  cccdVersions,
  loading,
  error,
  approvalStats,
  onRetry,
}: {
  section: DesktopDashboardSection;
  histories: EmploymentHistoryRecord[];
  users: UserRecord[];
  factories: FactoryRecord[];
  cccdVersions: CccdVersionRecord[];
  loading: boolean;
  error: string;
  approvalStats: ApprovalDashboardStats;
  onRetry: () => void;
}) {
  const sectionMeta = {
    "nhan-luc": {
      title: "Nhân lực",
      description: "Theo dõi tình hình tuyển dụng, nghỉ việc và khả năng duy trì lao động.",
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
            <WorkforceDashboard
              histories={histories}
              users={users}
              factories={factories}
              loading={loading}
              error={error}
              onRetry={onRetry}
              detailHref="/admin/workforce"
            />
          ) : section === "tai-chinh" ? (
            <FinanceDashboard />
          ) : (
            <Tabs defaultValue="overview" className="space-y-4">
              <TabsList aria-label="Nội dung khác">
                <TabsTrigger value="overview">Tổng quan khác</TabsTrigger>
                <TabsTrigger value="progress">Tiến độ công việc</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-0 space-y-4">
                <OtherDashboard
                  histories={histories}
                  users={users}
                  factories={factories}
                  cccdVersions={cccdVersions}
                  loading={loading}
                  error={error}
                  onRetry={onRetry}
                />
                <ApprovalDashboard stats={approvalStats} />
              </TabsContent>

              <TabsContent value="progress" className="mt-0">
                <WorkProgressBoard />
              </TabsContent>
            </Tabs>
          )}
        </section>
      </div>
    </main>
  );
}
