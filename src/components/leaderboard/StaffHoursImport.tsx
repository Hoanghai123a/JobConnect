import { useRef, useState } from "react";
import { FileSpreadsheet, Upload, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { exportToExcel } from "@/lib/excel";
import {
  executeAdminStaffHours,
  previewAdminStaffHours,
  type AdminStaffHoursPreview,
} from "@/lib/admin-staff-hours";
import type { StaffHoursImportResult } from "@/lib/staff-hours-import";
import type { StaffHoursDataSource } from "@/lib/pocketbase";
import { getUserErrorMessage } from "@/lib/toast";
import { toast } from "sonner";

interface StaffHoursImportProps {
  month: string;
  source: StaffHoursDataSource;
  adminUserId: string;
  onImportComplete?: () => void;
}

type ImportStage = "idle" | "uploading" | "preview" | "executing" | "completed" | "error";

export function StaffHoursImport({
  month,
  source,
  adminUserId,
  onImportComplete,
}: StaffHoursImportProps) {
  const [stage, setStage] = useState<ImportStage>("idle");
  const [preview, setPreview] = useState<AdminStaffHoursPreview | null>(null);
  const [result, setResult] = useState<StaffHoursImportResult | null>(null);
  const [error, setError] = useState<string>("");
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    exportToExcel(
      `mau_import_gio_lam_${month}`,
      {
        "Giờ làm": [
          {
            "Mã NV": "NV001",
            "Họ tên": "Nguyễn Văn A",
            "Tên nhà máy": "Nhà máy A",
            Tháng: month,
            "Giờ HC": 160,
            "Giờ TC": 40,
            "Ghi chú": "",
          },
          {
            "Mã NV": "NV002",
            "Họ tên": "Trần Thị B",
            "Tên nhà máy": "Nhà máy B",
            Tháng: month,
            "Giờ HC": 176,
            "Giờ TC": 30,
            "Ghi chú": "Làm thêm cuối tuần",
          },
        ],
      },
      {},
    );
    toast.success("Đã tải file mẫu");
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setStage("uploading");
    setError("");
    setPreview(null);
    setResult(null);
    setProgress(10);

    try {
      // Preview import
      const previewResult = await previewAdminStaffHours(file, month, source);
      setPreview(previewResult);
      setStage("preview");
      setProgress(100);

      if (previewResult.errorCount > 0) {
        toast.warning(`Có ${previewResult.errorCount} dòng lỗi, vui lòng xem chi tiết`);
      } else {
        toast.success(`Preview thành công: ${previewResult.successCount} dòng hợp lệ`);
      }
    } catch (err: any) {
      const errorMsg = getUserErrorMessage(err, "Không đọc được file import");
      setError(errorMsg);
      setStage("error");
      toast.error(errorMsg);
    }
  };

  const handleConfirmImport = async () => {
    if (!preview) return;

    setStage("executing");
    setProgress(0);

    try {
      const importResult = await executeAdminStaffHours(preview, adminUserId);
      setResult(importResult);
      setStage("completed");
      setProgress(100);

      toast.success(`Import thành công: ${importResult.successCount} records`);

      if (importResult.errorCount > 0) {
        // Export error file
        const errorRows = importResult.errors.map((err) => ({
          Lỗi: err,
        }));
        exportToExcel(`import_loi_${Date.now()}`, { "Dòng lỗi": errorRows });
        toast.warning("Đã xuất file các dòng bị lỗi");
      }

      onImportComplete?.();
    } catch (err: any) {
      const errorMsg = getUserErrorMessage(err, "Import thất bại");
      setError(errorMsg);
      setStage("error");
      toast.error(errorMsg);
    }
  };

  const handleCancel = () => {
    setStage("idle");
    setPreview(null);
    setResult(null);
    setError("");
    setProgress(0);
  };

  const exportUnmatchedRows = () => {
    if (!preview || preview.unmatchedRows.length === 0) return;

    const rows = preview.unmatchedRows.map((row) => ({
      "Số dòng": row.rowNumber,
      "Mã NV": row.employeeCodeRaw,
      "Họ tên": row.fullName,
      "Tên nhà máy": row.factoryName,
      Tháng: row.month,
      "Giờ HC": row.hcHours,
      "Giờ TC": row.tcHours,
      "Ghi chú": row.note || "",
    }));

    exportToExcel(`import_khong_tim_thay_${Date.now()}`, { "Không tìm thấy": rows });
    toast.success("Đã xuất file các dòng không tìm thấy");
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <FileSpreadsheet className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Import giờ làm từ Excel</h3>
      </div>

      <div className="text-sm text-muted-foreground">
        Upload file Excel với các cột: Mã NV, Họ tên, Tên nhà máy, Tháng, Giờ HC, Giờ TC, Ghi chú.
        Có thể nhập nhiều tháng trong cùng một file; hệ thống dùng cột Tháng của từng dòng để lưu
        đúng kỳ giờ làm. Tháng bên ngoài chỉ là giá trị mặc định khi dòng không có cột Tháng. Dữ
        liệu được lưu trong collection riêng của PocketBase, không ghép vào tài khoản user và không
        ảnh hưởng bảng chấm công thật.
      </div>

      {/* Template download */}
      <div>
        <Button variant="outline" size="sm" onClick={downloadTemplate}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Tải file mẫu
        </Button>
      </div>

      {/* File upload */}
      {stage === "idle" && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFileSelect}
          />
          <Button type="button" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" />
            Chọn file Excel
          </Button>
        </div>
      )}

      {/* Uploading progress */}
      {stage === "uploading" && (
        <div className="space-y-2">
          <Progress value={progress} />
          <div className="text-sm text-muted-foreground">Đang đọc file...</div>
        </div>
      )}

      {/* Preview */}
      {stage === "preview" && preview && (
        <div className="space-y-4">
          <Alert>
            <AlertDescription>
              <div className="space-y-2">
                <div className="font-semibold">Kết quả preview:</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <CheckCircle2 className="h-4 w-4 inline text-green-600 mr-1" />
                    Hợp lệ: {preview.successCount} dòng
                  </div>
                  <div>
                    <AlertCircle className="h-4 w-4 inline text-destructive mr-1" />
                    Lỗi: {preview.errorCount} dòng
                  </div>
                </div>
              </div>
            </AlertDescription>
          </Alert>

          {preview.unmatchedRows.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <div>Có {preview.unmatchedRows.length} mã NV không tìm thấy trong hệ thống:</div>
                  <ul className="list-disc list-inside text-sm">
                    {preview.unmatchedRows.slice(0, 5).map((row) => (
                      <li key={row.rowNumber}>
                        Dòng {row.rowNumber}: {row.employeeCodeRaw}
                      </li>
                    ))}
                    {preview.unmatchedRows.length > 5 && (
                      <li>...và {preview.unmatchedRows.length - 5} dòng khác</li>
                    )}
                  </ul>
                  <Button variant="outline" size="sm" onClick={exportUnmatchedRows}>
                    Xuất danh sách không tìm thấy
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button onClick={handleConfirmImport} disabled={preview.successCount === 0}>
              Xác nhận import {preview.successCount} records
            </Button>
            <Button variant="outline" onClick={handleCancel}>
              Hủy
            </Button>
          </div>
        </div>
      )}

      {/* Executing progress */}
      {stage === "executing" && (
        <div className="space-y-2">
          <Progress value={progress} />
          <div className="text-sm text-muted-foreground">Đang import dữ liệu...</div>
        </div>
      )}

      {/* Completed */}
      {stage === "completed" && result && (
        <div className="space-y-4">
          <Alert>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription>
              <div className="space-y-2">
                <div className="font-semibold">Import hoàn tất!</div>
                <div className="text-sm">
                  Thành công: {result.successCount} records
                  {result.errorCount > 0 && `, Lỗi: ${result.errorCount}`}
                </div>
              </div>
            </AlertDescription>
          </Alert>

          <Button variant="outline" onClick={handleCancel}>
            Đóng
          </Button>
        </div>
      )}

      {/* Error */}
      {stage === "error" && error && (
        <div className="space-y-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="font-semibold">Lỗi:</div>
              <div className="text-sm whitespace-pre-wrap">{error}</div>
            </AlertDescription>
          </Alert>

          <Button variant="outline" onClick={handleCancel}>
            Đóng
          </Button>
        </div>
      )}
    </Card>
  );
}
