import { useCallback, useEffect, useState } from "react";
import { FileSpreadsheet, History, RotateCcw, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { MonthSelector } from "../MonthSelector";
import { StaffHoursImport } from "../StaffHoursImport";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { StaffHoursDataSource } from "@/lib/pocketbase";
import {
  getAdminStaffHoursBatches,
  rollbackAdminStaffHours,
  type AdminStaffHoursBatch,
} from "@/lib/admin-staff-hours";
import { invalidateLeaderboardCache } from "@/lib/leaderboard";
import { toast } from "sonner";
import { getUserErrorMessage } from "@/lib/toast";

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("vi-VN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

interface AdminImportTabProps {
  adminUserId: string;
}

export function AdminImportTab({ adminUserId }: AdminImportTabProps) {
  const [month, setMonth] = useState<string>(getCurrentMonth());
  const [source, setSource] = useState<StaffHoursDataSource>("admin_upload");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<AdminStaffHoursBatch[]>([]);
  const [rollbackBatchId, setRollbackBatchId] = useState<string | null>(null);
  const [rollbackLoading, setRollbackLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      setHistory(await getAdminStaffHoursBatches(adminUserId));
    } catch (error: any) {
      toast.error(getUserErrorMessage(error, "Không tải được lịch sử import"));
    } finally {
      setLoading(false);
    }
  }, [adminUserId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleImportComplete = () => {
    loadHistory();
    invalidateLeaderboardCache();
  };

  const handleRollback = async () => {
    if (!rollbackBatchId) return;

    setRollbackLoading(true);
    try {
      await rollbackAdminStaffHours(adminUserId, rollbackBatchId);
      toast.success("Đã rollback import thành công");
      loadHistory();
      invalidateLeaderboardCache();
    } catch (error: any) {
      toast.error(getUserErrorMessage(error, "Rollback thất bại"));
    } finally {
      setRollbackLoading(false);
      setRollbackBatchId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<
      string,
      { variant: "default" | "secondary" | "destructive" | "outline"; label: string }
    > = {
      preview: { variant: "secondary", label: "Preview" },
      completed: { variant: "default", label: "Thành công" },
      failed: { variant: "destructive", label: "Thất bại" },
      rolled_back: { variant: "outline", label: "Đã rollback" },
    };
    const config = variants[status] || variants.preview;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const canRollback = (record: AdminStaffHoursBatch) => {
    return record.status === "completed" && record.successCount > 0;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-4">
        <div className="flex items-start gap-2">
          <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <h3 className="font-semibold">Import dữ liệu giờ làm riêng</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Dữ liệu được lưu trong collection riêng của PocketBase, không liên kết với user thật.
            </p>
          </div>
        </div>
      </Card>

      {/* Import Form */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Label>Tháng:</Label>
            <MonthSelector value={month} onChange={setMonth} />
            <span className="text-xs text-muted-foreground">Mặc định nếu file thiếu cột Tháng</span>
          </div>
          <div className="flex items-center gap-2">
            <Label>Nguồn:</Label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as StaffHoursDataSource)}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="admin_upload">Admin upload</option>
              <option value="self_checkin">Tự chấm công</option>
            </select>
          </div>
        </div>

        <StaffHoursImport
          month={month}
          source={source}
          adminUserId={adminUserId}
          onImportComplete={handleImportComplete}
        />
      </div>

      {/* Import History */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Lịch sử import</h3>
          </div>
          <Button variant="outline" size="sm" onClick={loadHistory} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Thời gian</TableHead>
                <TableHead>Tháng</TableHead>
                <TableHead>Nguồn</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead className="text-right">Thành công</TableHead>
                <TableHead className="text-right">Lỗi</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="w-32">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                    Đang tải...
                  </TableCell>
                </TableRow>
              ) : history.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Chưa có lịch sử import
                  </TableCell>
                </TableRow>
              ) : (
                history.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-mono text-sm">
                      {formatDateTime(record.importedAt)}
                    </TableCell>
                    <TableCell>{record.months.join(", ")}</TableCell>
                    <TableCell>
                      {record.source === "admin_upload" ? "Admin upload" : "Tự chấm công"}
                    </TableCell>
                    <TableCell>Admin hiện tại</TableCell>
                    <TableCell className="text-right font-medium text-green-600">
                      {record.successCount}
                    </TableCell>
                    <TableCell className="text-right font-medium text-destructive">
                      {record.errorCount}
                    </TableCell>
                    <TableCell>{getStatusBadge(record.status)}</TableCell>
                    <TableCell>
                      {canRollback(record) ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRollbackBatchId(record.batchId)}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Rollback
                        </Button>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Rollback Confirmation Dialog */}
      <AlertDialog open={!!rollbackBatchId} onOpenChange={() => setRollbackBatchId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận rollback</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn rollback import này? Dữ liệu bị ghi đè sẽ được phục hồi, còn
              dòng mới sẽ được xóa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rollbackLoading}>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleRollback} disabled={rollbackLoading}>
              {rollbackLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Đang rollback...
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Rollback
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
