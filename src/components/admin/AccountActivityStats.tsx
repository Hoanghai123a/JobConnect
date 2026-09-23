import { useEffect, useMemo, useState } from "react";
import { Users, ShieldCheck, UserRoundCheck, UserRound } from "lucide-react";
import { toast } from "@/lib/toast";
import { pb, type UserRecord } from "@/lib/pocketbase";
import { StatCard } from "@/components/ui/stat-card";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";

function daysAgoIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function isInRange(dateStr: string | undefined, from: string, to: string) {
  if (!dateStr) return false;
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return false;
  const fromT = new Date(`${from}T00:00:00`).getTime();
  const toT = new Date(`${to}T23:59:59.999`).getTime();
  return t >= fromT && t <= toT;
}

type MinimalUser = Pick<UserRecord, "id" | "role" | "last_login">;

export function AccountActivityStats() {
  const [from, setFrom] = useState(daysAgoIso(7));
  const [to, setTo] = useState(todayIso());
  const [users, setUsers] = useState<MinimalUser[]>([]);
  const [guestSessions, setGuestSessions] = useState<Array<{ session_id: string; visited_at: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [userList, guestList] = await Promise.all([
          pb.collection("users").getFullList<MinimalUser>({ fields: "id,role,last_login" }),
          pb.collection("guest_sessions").getFullList<{ session_id: string; visited_at: string }>({
            fields: "session_id,visited_at",
            sort: "-visited_at"
          }),
        ]);
        if (!alive) return;
        setUsers(userList);
        setGuestSessions(guestList);
      } catch (e: any) {
        if (alive) toast.error(e?.message || "Không tải được thống kê tài khoản");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const stats = useMemo(() => {
    // User = tài khoản đã đăng ký trong bảng users
    const registeredUsers = users;

    const activeInRange = (list: MinimalUser[]) =>
      list.filter((u) => isInRange(u.last_login, from, to)).length;

    // Guest = các session_id unique trong guest_sessions trong khoảng thời gian
    const uniqueGuestSessions = new Set(
      guestSessions
        .filter((g) => isInRange(g.visited_at, from, to))
        .map((g) => g.session_id)
    );

    // Tạo danh sách các ngày trong khoảng thời gian
    const days: string[] = [];
    const startDate = new Date(`${from}T00:00:00`);
    const endDate = new Date(`${to}T23:59:59`);
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    }

    // Đếm số lượng đăng nhập theo từng ngày
    const dailyData = days.map((day) => {
      const dayStart = new Date(`${day}T00:00:00`).getTime();
      const dayEnd = new Date(`${day}T23:59:59.999`).getTime();

      // Đếm users đăng nhập trong ngày
      const usersCount = registeredUsers.filter((u) => {
        if (!u.last_login) return false;
        const loginTime = new Date(u.last_login).getTime();
        return !Number.isNaN(loginTime) && loginTime >= dayStart && loginTime <= dayEnd;
      }).length;

      // Đếm guest sessions unique trong ngày
      const guestsCount = new Set(
        guestSessions
          .filter((g) => {
            const visitTime = new Date(g.visited_at).getTime();
            return !Number.isNaN(visitTime) && visitTime >= dayStart && visitTime <= dayEnd;
          })
          .map((g) => g.session_id)
      ).size;

      return { day, users: usersCount, guests: guestsCount };
    });

    return {
      total: users.length,
      totalActive: activeInRange(users),
      users: { total: registeredUsers.length, active: activeInRange(registeredUsers) },
      guests: { total: uniqueGuestSessions.size, active: uniqueGuestSessions.size },
      dailyData,
    };
  }, [users, from, to, guestSessions]);

  if (loading) {
    return (
      <section className="rounded-3xl bg-card p-3 shadow-soft">
        <div className="px-1 pb-2 pt-1">
          <div className="text-sm font-semibold tracking-tight">Thống kê tài khoản</div>
        </div>
        <div className="h-24 animate-pulse rounded-2xl bg-muted/60" />
      </section>
    );
  }

  return (
    <section className="rounded-3xl bg-card p-3 shadow-soft">
      <div className="px-1 pb-2 pt-1">
        <div className="text-sm font-semibold tracking-tight">Thống kê tài khoản</div>
        <div className="text-[11px] text-muted-foreground">Đăng nhập theo khoảng thời gian</div>
      </div>

      <Card className="space-y-2 p-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Từ ngày</Label>
            <DateInput value={from} max={to} onChange={(value) => setFrom(value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Đến ngày</Label>
            <DateInput value={to} min={from} max={todayIso()} onChange={(value) => setTo(value)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <QuickBtn
            label="7 ngày"
            onClick={() => {
              setFrom(daysAgoIso(7));
              setTo(todayIso());
            }}
          />
          <QuickBtn
            label="30 ngày"
            onClick={() => {
              setFrom(daysAgoIso(30));
              setTo(todayIso());
            }}
          />
          <QuickBtn
            label="90 ngày"
            onClick={() => {
              setFrom(daysAgoIso(90));
              setTo(todayIso());
            }}
          />
        </div>
      </Card>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <StatCard label="Tổng tài khoản" value={stats.total} icon={Users} tone="primary" />
        <StatCard
          label="Đăng nhập trong kỳ"
          value={stats.totalActive}
          icon={UserRoundCheck}
          tone="success"
        />
      </div>

      <div className="mt-3 space-y-3">
        <div className="px-1 text-xs font-semibold text-muted-foreground">Phân loại</div>

        {/* Card thống kê 2 nhóm */}
        <div className="grid grid-cols-2 gap-2">
          <GroupCard
            label="User"
            icon={UserRoundCheck}
            total={stats.users.total}
            active={stats.users.active}
            tone="emerald"
            description="Tài khoản đã đăng ký"
          />
          <GroupCard
            label="Guest"
            icon={UserRound}
            total={stats.guests.total}
            active={stats.guests.active}
            tone="amber"
            description="Khách vãng lai"
          />
        </div>

        {/* Biểu đồ đường theo ngày */}
        <Card className="p-3">
          <div className="mb-3 text-xs font-semibold">Hoạt động theo ngày</div>
          <LineChart data={stats.dailyData} />
        </Card>
      </div>
    </section>
  );
}

function QuickBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground active:bg-muted"
    >
      {label}
    </button>
  );
}

function LineChart({ data }: { data: Array<{ day: string; users: number; guests: number }> }) {
  if (data.length === 0) {
    return <div className="text-center text-xs text-muted-foreground">Không có dữ liệu</div>;
  }

  const maxValue = Math.max(...data.map((d) => Math.max(d.users, d.guests)), 1);
  const width = 100;
  const height = 100;
  const padding = { top: 5, right: 5, bottom: 5, left: 5 };

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Tính toán điểm cho đường line
  const userPoints = data.map((d, i) => {
    const x = padding.left + (i / (data.length - 1 || 1)) * chartWidth;
    const y = padding.top + chartHeight * (1 - d.users / maxValue);
    return { x, y, value: d.users };
  });

  const guestPoints = data.map((d, i) => {
    const x = padding.left + (i / (data.length - 1 || 1)) * chartWidth;
    const y = padding.top + chartHeight * (1 - d.guests / maxValue);
    return { x, y, value: d.guests };
  });

  const userPath = userPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const guestPath = guestPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  // Format ngày hiển thị
  const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}`;
  };

  // Chọn số label hiển thị dựa trên độ dài dữ liệu
  const labelStep = data.length <= 7 ? 1 : data.length <= 14 ? 2 : Math.ceil(data.length / 7);

  return (
    <div className="space-y-2">
      {/* Chart container with Y-axis labels */}
      <div className="flex gap-2">
        {/* Y-axis labels */}
        <div className="flex flex-col justify-between py-1 text-[9px] text-muted-foreground" style={{ minWidth: '20px', textAlign: 'right' }}>
          <span>{maxValue}</span>
          <span>{Math.round(maxValue * 0.5)}</span>
          <span>0</span>
        </div>

        {/* SVG Chart */}
        <div className="flex-1" style={{ height: 120 }}>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-full"
            preserveAspectRatio="none"
          >
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
              <line
                key={ratio}
                x1={padding.left}
                y1={padding.top + chartHeight * ratio}
                x2={width - padding.right}
                y2={padding.top + chartHeight * ratio}
                stroke="currentColor"
                strokeWidth="0.2"
                className="text-border"
              />
            ))}

            {/* Guest line (dưới) */}
            <path
              d={guestPath}
              fill="none"
              stroke="rgb(245, 158, 11)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />

            {/* User line (trên) */}
            <path
              d={userPath}
              fill="none"
              stroke="rgb(16, 185, 129)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />

            {/* Guest dots */}
            {guestPoints.map((p, i) => (
              <circle
                key={`guest-${i}`}
                cx={p.x}
                cy={p.y}
                r="1.5"
                fill="rgb(245, 158, 11)"
              />
            ))}

            {/* User dots */}
            {userPoints.map((p, i) => (
              <circle
                key={`user-${i}`}
                cx={p.x}
                cy={p.y}
                r="1.5"
                fill="rgb(16, 185, 129)"
              />
            ))}
          </svg>
        </div>
      </div>

      {/* X-axis labels - inside container */}
      <div className="flex justify-between text-[9px] text-muted-foreground" style={{ paddingLeft: '22px' }}>
        {data.map((d, i) => {
          if (i % labelStep !== 0 && i !== data.length - 1) return null;
          return <span key={i}>{formatDate(d.day)}</span>;
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-[10px] pt-1">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-muted-foreground">User</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-amber-500" />
          <span className="text-muted-foreground">Guest</span>
        </div>
      </div>
    </div>
  );
}

function GroupCard({
  label,
  icon: Icon,
  total,
  active,
  tone,
  description,
}: {
  label: string;
  icon: typeof Users;
  total: number;
  active: number;
  tone: "emerald" | "amber";
  description: string;
}) {
  const toneClasses = {
    emerald: "text-emerald-600 bg-emerald-50 border-emerald-200",
    amber: "text-amber-600 bg-amber-50 border-amber-200",
  };

  return (
    <div className={`rounded-xl border ${toneClasses[tone]} p-3`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-5 w-5 shrink-0 ${tone === "emerald" ? "text-emerald-600" : "text-amber-600"}`} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">{label}</div>
          <div className="text-[10px] text-muted-foreground">{description}</div>
        </div>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className="text-2xl font-bold">{total}</div>
        <div className="text-xs text-muted-foreground">tài khoản</div>
      </div>
      <div className="mt-1 text-xs">
        <span className="font-semibold">{active}</span>
        <span className="text-muted-foreground"> đăng nhập trong kỳ</span>
      </div>
    </div>
  );
}

function ChartBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const percentage = max > 0 ? (value / max) * 100 : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="font-semibold">{value}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full transition-all duration-500 ${color}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
