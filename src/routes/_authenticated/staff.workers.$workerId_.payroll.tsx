import { createFileRoute, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  WorkerPayrollView,
  type WorkerAttendanceCheckItem,
  type WorkerSalaryCheckItem,
} from "@/components/payroll/WorkerPayrollView";
import { AppHeader } from "@/components/layout/BottomNav";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/lib/auth";
import { escapePb } from "@/lib/delegations";
import { pb, type UserRecord } from "@/lib/pocketbase";
import { fetchStaffWorkerWorkspace } from "@/lib/staff-permissions";
import { CalendarCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/staff/workers/$workerId_/payroll")({
  component: StaffWorkerPayrollPage,
});

function StaffWorkerPayrollPage() {
  const { workerId } = useParams({ from: "/_authenticated/staff/workers/$workerId_/payroll" });
  const { user } = useAuth();
  const [workerName, setWorkerName] = useState("");
  const [workerCompany, setWorkerCompany] = useState("");
  const [attendanceItems, setAttendanceItems] = useState<WorkerAttendanceCheckItem[]>([]);
  const [salaryItems, setSalaryItems] = useState<WorkerSalaryCheckItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id || !workerId) {
      setAuthorized(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const workspace = await fetchStaffWorkerWorkspace(user as UserRecord, workerId);
      const worker = workspace.worker;
      if (!worker || !worker.canViewPayroll) {
        setAuthorized(false);
        setAttendanceItems([]);
        setSalaryItems([]);
        return;
      }

      setAuthorized(true);
      setWorkerName(worker.user.full_name || worker.user.username || "");
      setWorkerCompany(worker.latestHistory?.expand?.factory?.name || "");

      const [attendanceRes, salaryRes] = await Promise.all([
        pb.collection("check_attendance_items").getList(1, 100, {
          filter: `user="${escapePb(workerId)}"`,
          sort: "-created",
          expand: "batch",
        }),
        pb
          .collection("check_salary_items")
          .getList(1, 100, {
            filter: `user="${escapePb(workerId)}"`,
            sort: "-created",
            expand: "batch",
          })
          .catch(() => ({ items: [] })),
      ]);

      setAttendanceItems(
        (attendanceRes.items as unknown as WorkerAttendanceCheckItem[]).map((item) => ({
          ...item,
          rows: Array.isArray(item.rows) ? item.rows : [],
        })),
      );
      setSalaryItems(
        (salaryRes.items as unknown as WorkerSalaryCheckItem[]).map((item) => ({
          ...item,
          wage_lines: Array.isArray(item.wage_lines) ? item.wage_lines : [],
          allowance_lines: Array.isArray(item.allowance_lines) ? item.allowance_lines : [],
          deduction_lines: Array.isArray(item.deduction_lines) ? item.deduction_lines : [],
          totals: item.totals || { wage: 0, allowance: 0, deduction: 0, net: 0 },
        })),
      );
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Không tải Được check công/lương");
    } finally {
      setLoading(false);
    }
  }, [user, workerId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!authorized) {
    return (
      <div>
        <AppHeader title="Check công/lương" back />
        <div className="p-4">
          <EmptyState
            icon={CalendarCheck}
            title="Không có quyền"
            description="Bạn không có quyền xem check công/lương của người lao động này."
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <AppHeader title="Check công/lương" subtitle={workerName} back />
      <div className="space-y-4 p-4">
        {loading && <div className="p-4 text-sm text-muted-foreground">Đang tải...</div>}
        <WorkerPayrollView
          attendanceItems={attendanceItems}
          salaryItems={salaryItems}
          loading={loading}
          fallbackFactoryName={workerCompany}
        />
      </div>
    </div>
  );
}
