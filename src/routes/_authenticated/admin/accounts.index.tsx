import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Building2, ClipboardList, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/status-chip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { pb, type Role, type UserRecord } from "@/lib/pocketbase";
import { createStaffActionLog } from "@/lib/staff-log";
import { fetchFactoryManagers } from "@/lib/factories";

const ROLE_LABELS: Record<Role, string> = {
  admin: "Quản trị viên",
  staff: "Staff",
  user: "Người dùng",
};

const ROLE_TONES: Record<Role, "info" | "success" | "neutral"> = {
  admin: "info",
  staff: "success",
  user: "neutral",
};

export const Route = createFileRoute("/_authenticated/admin/accounts/")({
  component: AdminAccountsPage,
});

function AdminAccountsPage() {
  const currentUser = pb.authStore.record as UserRecord;
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [assignmentCounts, setAssignmentCounts] = useState<Record<string, number>>({});

  const load = async () => {
    setLoading(true);
    try {
      const [userRows, assignmentRows] = await Promise.all([
        pb.collection("users").getFullList<UserRecord>({ sort: "full_name,username" }),
        fetchFactoryManagers(),
      ]);
      setUsers(userRows);
      const counts: Record<string, number> = {};
      for (const row of assignmentRows) {
        counts[row.staff] = (counts[row.staff] || 0) + 1;
      }
      setAssignmentCounts(counts);
    } catch (error: any) {
      toast.error(error?.message || "Không tải được dữ liệu tài khoản");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return users;
    return users.filter((item) => {
      const haystack = [item.full_name, item.username, item.phone, item.role]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [search, users]);

  const roleSummary = useMemo(
    () => ({
      admin: users.filter((item) => item.role === "admin").length,
      staff: users.filter((item) => item.role === "staff").length,
      user: users.filter((item) => (item.role || "user") === "user").length,
    }),
    [users],
  );

  const updateRole = async (targetUser: UserRecord, nextRole: Role) => {
    if (targetUser.id === currentUser.id && nextRole !== "admin") {
      toast.warning("Không thể tự hạ quyền tài khoản admin đang đăng nhập");
      return;
    }

    try {
      await pb.collection("users").update(targetUser.id, { role: nextRole });
      await createStaffActionLog({
        actor: currentUser,
        targetUserId: targetUser.id,
        targetCollection: "users",
        targetRecord: targetUser.id,
        action: "update",
        before: { role: targetUser.role || "user" },
        after: { role: nextRole },
        note: "Admin cập nhật vai trò tài khoản",
      });
      toast.success("Đã cập nhật vai trò");
      await load();
    } catch (error: any) {
      toast.error(error?.message || "Không cập nhật được vai trò");
    }
  };

  return (
    <PageContainer
      title="Tài khoản"
      subtitle="Danh sách 3 role admin, staff, user. Nhật ký và cấp quyền quản lý nhà máy nằm ở hai trang riêng."
    >
      <div className="grid grid-cols-2 gap-2">
        <Link
          to="/admin/accounts/logs"
          className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card px-3 py-3 text-left text-sm font-medium shadow-soft"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ClipboardList className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">Nhật ký</span>
            <span className="block text-[11px] font-normal text-muted-foreground">
              Lịch sử thao tác admin
            </span>
          </span>
        </Link>
        <Link
          to="/admin/accounts/factories"
          className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card px-3 py-3 text-left text-sm font-medium shadow-soft"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Building2 className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">Cấp quyền QLNM</span>
            <span className="block text-[11px] font-normal text-muted-foreground">
              Gán nhà máy cho staff
            </span>
          </span>
        </Link>
      </div>

      <div className="relative">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Tìm tài khoản theo tên, username, số điện thoại..."
          className="rounded-full"
        />
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold">Tài khoản hệ thống</div>
          <div className="flex flex-wrap gap-2">
            <StatusChip tone="info">{roleSummary.admin} admin</StatusChip>
            <StatusChip tone="success">{roleSummary.staff} staff</StatusChip>
            <StatusChip tone="neutral">{roleSummary.user} user</StatusChip>
          </div>
        </div>

        {loading ? (
          <Card className="rounded-2xl p-4 text-sm text-muted-foreground">Đang tải tài khoản...</Card>
        ) : filteredUsers.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="Chưa có tài khoản phù hợp"
            description="Thử tìm bằng username hoặc số điện thoại."
          />
        ) : (
          filteredUsers.map((item) => {
            const factoryCount = assignmentCounts[item.id] || 0;
            return (
              <Card key={item.id} className="space-y-3 rounded-2xl p-4 shadow-soft">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">
                      {item.full_name || item.username || "Chưa có tên"}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      @{item.username || "chưa có username"} · {item.phone || "chưa có số điện thoại"}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <StatusChip tone={ROLE_TONES[item.role || "user"]}>
                      {ROLE_LABELS[item.role || "user"]}
                    </StatusChip>
                    {item.role === "staff" && (
                      <StatusChip tone={factoryCount ? "info" : "neutral"}>
                        {factoryCount
                          ? `${factoryCount} nhà máy`
                          : "Chưa gán nhà máy"}
                      </StatusChip>
                    )}
                  </div>
                </div>

                <Select
                  value={item.role || "user"}
                  onValueChange={(value: Role) => updateRole(item, value)}
                  disabled={item.id === currentUser.id}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Chọn vai trò" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Quản trị viên</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="user">Người dùng</SelectItem>
                  </SelectContent>
                </Select>

                {item.role === "staff" && (
                  <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span>
                      Xem và thay đổi nhà máy phụ trách ở trang cấp quyền QLNM.
                    </span>
                    <Link
                      to="/admin/accounts/factories"
                      className="font-medium text-primary"
                    >
                      Mở trang cấp quyền →
                    </Link>
                  </div>
                )}

                {item.id === currentUser.id && (
                  <div className="text-[11px] text-muted-foreground">
                    Tài khoản đang đăng nhập được khóa chỉnh role để tránh mất quyền quản trị.
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </PageContainer>
  );
}
