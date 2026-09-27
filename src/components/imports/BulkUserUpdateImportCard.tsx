import { useState } from "react";
import { Upload, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { exportToExcel } from "@/lib/excel";
import { getUserErrorMessage } from "@/lib/toast";
import { pb, type UserRecord } from "@/lib/pocketbase";
import { accountIdentityKey } from "@/lib/account-identity";
import { normalizeDate } from "@/lib/date-utils";
import { createStaffActionLog } from "@/lib/staff-log";
import { resolveBankName } from "@/lib/vn-banks";

interface BulkUserUpdateImportCardProps {
  actor: UserRecord;
}

export function BulkUserUpdateImportCard({ actor }: BulkUserUpdateImportCardProps) {
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<string>("");

  const downloadTemplate = () => {
    exportToExcel(
      "mau_cap_nhat_nhanh_tai_khoan",
      {
        "Cập nhật tài khoản": [
          {
            "Tên đăng nhập": "nguyenvana",
            "Họ tên mới": "Nguyễn Văn A",
            "Số điện thoại mới": "0900000001",
            "CCCD mới": "001099012345",
            "Ngày sinh mới": "15/01/1990",
            "Địa chỉ mới": "123 Đường ABC, Quận 1, TP.HCM",
            "Ngân hàng mới": "VCB",
            "Số tài khoản mới": "1234567890",
            "Tên tài khoản mới": "NGUYEN VAN A",
            "Ghi chú STK mới": "",
          },
        ],
      },
      { "Cập nhật tài khoản": ["Ngày sinh mới"] },
    );
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImporting(true);
    setResult("");
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

      const existingUsers = await pb.collection("users").getFullList<UserRecord>();
      const userByUsername = new Map(
        existingUsers
          .filter((user) => user.username)
          .map((user) => [accountIdentityKey(user.username), user]),
      );

      let updated = 0;
      let skipped = 0;
      let failed = 0;
      const failedRows: Array<Record<string, unknown>> = [];

      for (const [index, row] of rows.entries()) {
        const rowNumber = index + 2;
        const username = pickValue(row, ["Tên đăng nhập", "username"]);
        const fullName = pickValue(row, ["Họ tên mới", "full_name"]);
        const phone = pickValue(row, ["Số điện thoại mới", "phone"]);
        const cccd = pickValue(row, ["CCCD mới", "cccd"]);
        const birthdayRaw = row["Ngày sinh mới"] ?? row["date_of_birth"] ?? "";
        const dateOfBirth = birthdayRaw ? normalizeDate(birthdayRaw) : "";
        const address = pickValue(row, ["Địa chỉ mới", "address"]);
        const bankName = resolveBankName(pickValue(row, ["Ngân hàng mới", "bank_name"]));
        const bankAccountNumber = pickValue(row, ["Số tài khoản mới", "bank_account_number"]);
        const bankAccountName = pickValue(row, ["Tên tài khoản mới", "bank_account_name"]);
        const bankAccountNote = pickValue(row, ["Ghi chú STK mới", "bank_account_note"]);

        const addFailedRow = (reason: string) => {
          failed++;
          failedRows.push({ Dòng: rowNumber, "Lý do lỗi": reason, ...row });
        };

        if (!username) {
          addFailedRow("Thiếu tên đăng nhập");
          continue;
        }

        const user = userByUsername.get(accountIdentityKey(username));
        if (!user) {
          addFailedRow("Không tìm thấy tài khoản với tên đăng nhập này");
          continue;
        }

        if (String(birthdayRaw).trim() && !dateOfBirth) {
          addFailedRow("Ngày sinh không hợp lệ");
          continue;
        }

        const updatePayload: Record<string, unknown> = {};
        if (fullName) updatePayload.full_name = fullName;
        if (phone) updatePayload.phone = phone;
        if (cccd) updatePayload.cccd = cccd;
        if (dateOfBirth) updatePayload.date_of_birth = dateOfBirth;
        if (address) updatePayload.address = address;
        if (bankName) updatePayload.bank_name = bankName;
        if (bankAccountNumber) updatePayload.bank_account_number = bankAccountNumber;
        if (bankAccountName) updatePayload.bank_account_name = bankAccountName;
        if (bankAccountNote !== undefined) updatePayload.bank_account_note = bankAccountNote;

        if (Object.keys(updatePayload).length === 0) {
          skipped++;
          continue;
        }

        try {
          await pb.collection("users").update(user.id, updatePayload);
          updated++;
        } catch (error: unknown) {
          addFailedRow(getUserErrorMessage(error, "Lỗi PocketBase khi cập nhật"));
        }
      }

      const summary = `Cập nhật tài khoản: ${updated} thành công, ${skipped} bỏ qua, ${failed} lỗi`;
      setResult(summary);
      toast.success(summary);

      if (failedRows.length) {
        exportToExcel(
          `cap_nhat_tai_khoan_loi_${Date.now()}`,
          { "Dòng lỗi": failedRows },
          { "Dòng lỗi": ["Ngày sinh mới"] },
        );
        toast.warning("Đã xuất file các dòng bị lỗi");
      }

      await createStaffActionLog({
        actor,
        targetCollection: "users",
        action: "import",
        after: { updated, skipped, failed, file: file.name, exported_errors: failedRows.length },
        note: "Admin cập nhật nhanh tài khoản NLĐ từ Excel",
      });
    } catch (error: unknown) {
      toast.error(getUserErrorMessage(error, "Không đọc được file cập nhật tài khoản"));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card className="space-y-3 rounded-2xl p-4 shadow-soft">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <FileSpreadsheet className="h-4 w-4 text-primary" /> Cập nhật nhanh tài khoản NLĐ
      </div>
      <div className="text-sm text-muted-foreground">
        Cập nhật hàng loạt thông tin tài khoản NLĐ đã tồn tại. Chỉ cập nhật các trường có giá trị
        trong Excel, ô trống giữ nguyên dữ liệu hiện tại.
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="rounded-full" onClick={downloadTemplate}>
          <FileSpreadsheet className="h-4 w-4" /> Tải file mẫu
        </Button>
        <label className="inline-flex">
          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
          <span className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground">
            <Upload className="h-4 w-4" /> {importing ? "Đang cập nhật..." : "Chọn file cập nhật"}
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

function pickValue(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}
