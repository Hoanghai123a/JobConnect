import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ClipboardList, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/status-chip";
import { pb, type UserRecord } from "@/lib/pocketbase";
import { escapePb } from "@/lib/delegations";

function userSearchFilter(search: string) {
  const q = escapePb(search.trim());
  const roleFilter = '(role="user" || role="")';
  if (!q) return roleFilter;
  const searchFilter = `(${["full_name", "username", "phone", "employee_code", "company"]
    .map((field) => `${field}~"${q}"`)
    .join(" || ")})`;
  return `${roleFilter} && ${searchFilter}`;
}

export const Route = createFileRoute("/_authenticated/admin/accounts/")({
  component: AdminAccountsPage,
});

function AdminAccountsPage() {
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<UserRecord[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const userRows = await pb
        .collection("users")
        .getList<UserRecord>(1, 500, {
          filter: userSearchFilter(search),
          sort: "full_name,username",
        })
        .then((res) => res.items);
      setUsers(userRows);
    } catch (error: any) {
      toast.error(error?.message || "Không tải được dữ liệu tài khoản");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const filteredUsers = users;

  const userCount = useMemo(() => users.length, [users]);

  return (
    <PageContainer
      title="Tài khoản người lao động"
      subtitle="Quản lý tài khoản NLĐ. Staff & Admin được quản lý ở trang riêng."
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
          to="/admin/staff"
          className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card px-3 py-3 text-left text-sm font-medium shadow-soft"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">Staff & Admin</span>
            <span className="block text-[11px] font-normal text-muted-foreground">
              Tạo, quản lý tài khoản staff
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
          <div className="text-sm font-semibold">Người lao động</div>
          <StatusChip tone="neutral">{userCount} tài khoản</StatusChip>
        </div>

        {loading ? (
          <Card className="rounded-2xl p-4 text-sm text-muted-foreground">
            Đang tải tài khoản...
          </Card>
        ) : filteredUsers.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="Chưa có tài khoản phù hợp"
            description="Thử tìm bằng username hoặc số điện thoại."
          />
        ) : (
          filteredUsers.map((item) => {
            return (
              <Card key={item.id} className="space-y-3 rounded-2xl p-4 shadow-soft">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">
                      {item.full_name || item.username || "Chưa có tên"}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      @{item.username || "chưa có username"} ·{" "}
                      {item.phone || "chưa có số điện thoại"}
                    </div>
                  </div>
                  <StatusChip tone="neutral">
                    Người dùng
                  </StatusChip>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </PageContainer>
  );
}
