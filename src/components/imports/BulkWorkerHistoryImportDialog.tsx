import { useState } from "react";
import { Upload, FileSpreadsheet } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { exportToExcel } from "@/lib/excel";
import { getUserErrorMessage } from "@/lib/toast";
import { type UserRecord } from "@/lib/pocketbase";
import {
  prepareBulkWorkerImport,
  applyBulkWorkerImportReferences,
  type BulkWorkerImportSummary,
} from "@/lib/bulk-worker-history-import";

interface BulkWorkerHistoryImportCardProps {
  actor: UserRecord;
}

export function BulkWorkerHistoryImportCard({ actor }: BulkWorkerHistoryImportCardProps) {
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<string>("");

  const downloadTemplate = () => {
    exportToExcel(
      "mau_import_nld_lich_su",
      {
        "Người lao động": [
          {
            "Họ tên": "Nguyễn Văn A",
            "Số điện thoại": "0900000001",
            "Tên đăng nhập": "nguyenvana",
            "Mật khẩu": "12345678",
            CCCD: "001099012345",
            "Ngày sinh": "15/01/1990",
            "Địa chỉ thường trú": "123 Đường ABC, Quận 1, TP.HCM",
            "Ngày cấp CCCD": "01/01/2020",
            "Mã số thuế": "0123456789",
          },
        ],
        "Lịch sử": [
          {
            "Số điện thoại NLĐ": "0900000001",
            "Tên nhà máy": "Nhà máy A",
            "Mã nhà máy": "NM001",
            "Nhà chính": "Nhà chính HN",
            "Mã nhân viên": "NV001",
            "Người tuyển": "staff01",
            "Ngày vào làm": "01/05/2026",
            "Ngày nghỉ": "",
            "Ghi chú": "",
          },
        ],
      },
      {
        "Người lao động": ["Ngày sinh", "Ngày cấp CCCD"],
        "Lịch sử": ["Ngày vào làm", "Ngày nghỉ"],
      },
    );
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImporting(true);
    setResult("");
    try {
      const prepared = await prepareBulkWorkerImport(file);
      const applied = await applyBulkWorkerImportReferences(prepared, actor);

      const summary: BulkWorkerImportSummary = {
        totalWorkers: prepared.totalWorkers,
        createdWorkers: applied.createdWorkers.length,
        failedWorkers: applied.errors.length,
        createdHistories: applied.createdHistoryCount,
        durationMs: 0,
      };

      const summaryText = `Import NLĐ: tạo ${summary.createdWorkers} tài khoản, ${summary.createdHistories} lịch sử, lỗi ${summary.failedWorkers}`;
      setResult(summaryText);
      toast.success(summaryText);

      if (applied.errors.length > 0) {
        const errorRows = applied.errors.map((err) => ({
          "Lý do lỗi": err.reason,
          "Giai đoạn": err.stage,
          "SĐT/Username": err.phoneBase || err.username || "",
          CCCD: err.cccdBase || "",
        }));
        exportToExcel(`import_nld_loi_${Date.now()}`, { "Dòng lỗi": errorRows });
        toast.warning("Đã xuất file các dòng bị lỗi");
      }
    } catch (error: unknown) {
      toast.error(getUserErrorMessage(error, "Không đọc được file import NLĐ và lịch sử"));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card className="space-y-3 rounded-2xl p-4 shadow-soft">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <FileSpreadsheet className="h-4 w-4 text-primary" /> Import NLĐ và lịch sử đi làm
      </div>
      <div className="text-sm text-muted-foreground">
        Tạo hàng loạt tài khoản NLĐ và lịch sử đi làm từ Excel. File có 2 sheet: "Người lao động"
        và "Lịch sử". Hệ thống tự động tạo/kích hoạt quan hệ (nhà máy, nhà chính, người tuyển).
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="rounded-full" onClick={downloadTemplate}>
          <FileSpreadsheet className="h-4 w-4" /> Tải file mẫu
        </Button>
        <label className="inline-flex">
          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
          <span className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground">
            <Upload className="h-4 w-4" /> {importing ? "Đang nhập..." : "Chọn file import"}
          </span>
        </label>
      </div>
      {result && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm text-primary">
          {result}
        </div>
      )}
    </Card>
  );
}
