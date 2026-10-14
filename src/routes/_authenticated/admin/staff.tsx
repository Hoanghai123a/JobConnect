import { createFileRoute, redirect } from "@tanstack/react-router";
import { ArrowLeft, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminStaffManagementTab } from "@/components/leaderboard/admin/AdminStaffManagementTab";
import { pb, type UserRecord } from "@/lib/pocketbase";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/staff")({
  beforeLoad: () => {
    const currentUser = pb.authStore.record as UserRecord | null;
    if (typeof window !== "undefined" && currentUser?.role !== "admin") {
      throw redirect({ to: "/" });
    }
  },
  component: AdminStaffPage,
});

function AdminStaffPage() {
  return (
    <div className="container mx-auto max-w-7xl space-y-6 p-4 pb-24 sm:p-6">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon" className="shrink-0">
          <Link to="/admin/manage" aria-label="Quay lại trang quản trị">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Quản lý nhân viên nội bộ</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Tra cứu mã NV trùng giữa các nhà máy và gán tài khoản user vào danh sách nội bộ.
          </p>
        </div>
      </div>

      <AdminStaffManagementTab />
    </div>
  );
}
