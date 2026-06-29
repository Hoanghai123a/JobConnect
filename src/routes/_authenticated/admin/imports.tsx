import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import * as XLSX from "xlsx";
import { FileSpreadsheet, Upload, Workflow } from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { exportToExcel } from "@/lib/excel";
import { fetchFactories } from "@/lib/factories";
import {
  createEmploymentHistory,
  fetchEmploymentHistories,
  getLatestEmploymentHistory,
  syncLegacyUserWorkFields,
  updateEmploymentHistory,
} from "@/lib/employment";
import { fetchMainHouses, type MainHouseRecord } from "@/lib/main-houses";
import { createStaffActionLog } from "@/lib/staff-log";
import { pb, type UserRecord } from "@/lib/pocketbase";

export const Route = createFileRoute("/_authenticated/admin/imports")({
  beforeLoad: () => {
    const currentUser = pb.authStore.record as UserRecord | null;
    if (!currentUser || currentUser.role !== "admin") throw redirect({ to: "/" });
  },
  component: AdminImportsPage,
});

function AdminImportsPage() {
  const currentUser = pb.authStore.record as UserRecord;
  const [importingHistories, setImportingHistories] = useState(false);
  const [lastResult, setLastResult] = useState<string>("");

  const downloadHistoriesTemplate = () => {
    exportToExcel("mau_import_lich_su_di_lam", {
      "Lịch sử đi làm": [
        {
          "Mã tài khoản (UID)": "",
          "Tên đăng nhập": "nguyenvana",
          "Tên nhà máy": "Nhà máy A",
          "Mã nhà máy": "",
          "Nhà chính": "Nhà chính HN",
          "Mã nhân viên": "NM001",
          "Họ tên tại nhà máy": "Nguyễn Văn A",
          "CCCD tại nhà máy": "012345678901",
          "Người tuyển": "staff01",
          "Ngày vào làm": "2026-05-01",
          "Ngày nghỉ": "",
          "Trạng thái": "Đang làm",
          "Ghi chú": "Nhập mẫu",
        },
      ],
    });
  };

  const importHistories = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImportingHistories(true);
    try {
      const [factoryRows, allUsers, mainHouseRows] = await Promise.all([
        fetchFactories(),
        pb
          .collection("users")
          .getList<UserRecord>(1, 1000, { sort: "full_name,username" })
          .then((res) => res.items),
        fetchMainHouses().catch(() => [] as MainHouseRecord[]),
      ]);
      const staffUsers = allUsers.filter((item) => item.role === "staff" || item.role === "admin");
      const factoryByName = new Map(factoryRows.map((item) => [item.name.toLowerCase(), item]));
      const factoryByCode = new Map(
        factoryRows.map((item) => [(item.code || "").toLowerCase(), item]),
      );
      const mainHouseByName = new Map(mainHouseRows.map((item) => [item.name.toLowerCase(), item]));
      const userByUsername = new Map(
        allUsers.map((item) => [(item.username || "").toLowerCase(), item]),
      );
      const userByUid = new Map(allUsers.map((item) => [(item.uid || "").toLowerCase(), item]));
      const staffByUsername = new Map(
        staffUsers.map((item) => [(item.username || "").toLowerCase(), item]),
      );
      const existingHistories = await fetchEmploymentHistories();

      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

      let created = 0;
      let updated = 0;
      let failed = 0;
      const touchedUsers = new Set<string>();
      const failedRows: Array<Record<string, unknown>> = [];

      const addFailedRow = (row: Record<string, unknown>, rowNumber: number, reason: string) => {
        failed++;
        failedRows.push({
          Dòng: rowNumber,
          "Lý do lỗi": reason,
          "Mã tài khoản (UID)": pickValue(row, ["Mã tài khoản (UID)", "uid", "Mã TK", "Ma TK"]),
          "Tên đăng nhập": pickValue(row, ["username", "Tên đăng nhập"]),
          "Tên nhà máy": pickValue(row, ["Tên nhà máy", "factory_name", "Nhà máy"]),
          "Mã nhà máy": pickValue(row, ["factory_code", "Mã nhà máy"]),
          "Ngày vào làm": row["Ngày vào làm"] ?? row["join_date"] ?? row["Ngày vào"] ?? "",
          "Họ tên tại nhà máy": pickValue(row, ["worker_name_snapshot", "Họ tên tại nhà máy"]),
          "CCCD tại nhà máy": pickValue(row, ["worker_cccd_snapshot", "CCCD tại nhà máy"]),
          "Ghi chú": pickValue(row, ["note", "Ghi chú"]),
        });
      };

      for (const [index, row] of rows.entries()) {
        const rowNumber = index + 2;
        const uid = pickValue(row, ["Mã tài khoản (UID)", "uid", "Mã TK", "Ma TK"]);
        const username = pickValue(row, ["username", "Tên đăng nhập"]);
        const factoryName = pickValue(row, ["Tên nhà máy", "factory_name", "Nhà máy"]);
        const factoryCode = pickValue(row, ["factory_code", "Mã nhà máy"]);
        const mainHouseName = pickValue(row, ["main_house_name", "Nhà chính"]);
        const employeeCode = pickValue(row, ["employee_code", "Mã nhân viên", "Mã NV"]);
        const workerName = pickValue(row, ["worker_name_snapshot", "Họ tên tại nhà máy"]);
        const workerCccd = pickValue(row, ["worker_cccd_snapshot", "CCCD tại nhà máy"]);
        const recruiterUsername = pickValue(row, ["recruiter_username", "Người tuyển"]);
        const joinDate = normalizeExcelDate(
          row["Ngày vào làm"] ?? row["join_date"] ?? row["Ngày vào"],
        );
        const leaveDate = normalizeExcelDate(row["leave_date"] ?? row["Ngày nghỉ"]);
        const status = pickHistoryStatus(pickValue(row, ["status", "Trạng thái"]), leaveDate);
        const note = pickValue(row, ["note", "Ghi chú"]);

        const user =
          (uid ? userByUid.get(uid.toLowerCase()) : undefined) ||
          (username ? userByUsername.get(username.toLowerCase()) : undefined);
        const factory =
          factoryByName.get(factoryName.toLowerCase()) ||
          factoryByCode.get(factoryCode.toLowerCase());
        const mainHouse = mainHouseName
          ? mainHouseByName.get(mainHouseName.toLowerCase())
          : undefined;
        const recruiter = staffByUsername.get(recruiterUsername.toLowerCase());

        if (!user) {
          addFailedRow(
            row,
            rowNumber,
            "Không tìm thấy tài khoản theo UID hoặc username. Cần tạo tài khoản trước.",
          );
          continue;
        }
        if (!factory) {
          addFailedRow(row, rowNumber, "Không tìm thấy nhà máy theo tên hoặc mã nhà máy.");
          continue;
        }
        if (!joinDate) {
          addFailedRow(row, rowNumber, "Thiếu hoặc sai ngày vào làm.");
          continue;
        }
        if (!workerName || !workerCccd) {
          addFailedRow(row, rowNumber, "Thiếu họ tên hoặc CCCD snapshot tại nhà máy.");
          continue;
        }

        const sameHistory = existingHistories.find(
          (item) =>
            item.user === user.id && item.factory === factory.id && item.join_date === joinDate,
        );
        const activeHistory = existingHistories.find(
          (item) =>
            item.user === user.id && item.status === "working" && item.id !== sameHistory?.id,
        );

        if (status === "working" && activeHistory) {
          addFailedRow(
            row,
            rowNumber,
            "Người lao động đang có lịch sử đi làm active, cần kết thúc lịch sử cũ trước.",
          );
          continue;
        }

        const payload = {
          user: user.id,
          factory: factory.id,
          main_house: mainHouse?.id || "",
          employee_code: employeeCode,
          worker_name_snapshot: workerName,
          worker_cccd_snapshot: workerCccd,
          recruiter_staff: recruiter?.id || "",
          join_date: joinDate,
          leave_date: leaveDate || undefined,
          status,
          note,
        };

        try {
          if (sameHistory) {
            const updatedHistory = await updateEmploymentHistory(sameHistory.id, payload);
            updated++;
            await createStaffActionLog({
              actor: currentUser,
              targetUserId: user.id,
              targetCollection: "employment_histories",
              targetRecord: sameHistory.id,
              action: "update",
              before: sameHistory,
              after: updatedHistory,
              note: "Quản trị viên nhập Excel cập nhật lịch sử đi làm",
            });
          } else {
            const createdHistory = await createEmploymentHistory(payload);
            created++;
            existingHistories.push(createdHistory);
            await createStaffActionLog({
              actor: currentUser,
              targetUserId: user.id,
              targetCollection: "employment_histories",
              targetRecord: createdHistory.id,
              action: "create",
              after: createdHistory,
              note: "Quản trị viên nhập Excel tạo lịch sử đi làm",
            });
          }
          touchedUsers.add(user.id);
        } catch (error: unknown) {
          addFailedRow(
            row,
            rowNumber,
            error instanceof Error ? error.message : "Không lưu được lịch sử đi làm.",
          );
        }
      }

      for (const id of touchedUsers) {
        const userHistories = (await fetchEmploymentHistories([id])).filter(
          (item) => item.user === id,
        );
        await syncLegacyUserWorkFields(id, getLatestEmploymentHistory(userHistories));
      }

      const summary = `Lịch sử đi làm: tạo ${created}, cập nhật ${updated}, lỗi ${failed}`;
      setLastResult(summary);
      toast.success(summary);
      if (failedRows.length) {
        exportToExcel(`lich_su_di_lam_loi_${Date.now()}`, { "Dòng lỗi": failedRows });
        toast.warning("Đã xuất file các dòng lịch sử đi làm bị lỗi");
      }
      await createStaffActionLog({
        actor: currentUser,
        targetCollection: "employment_histories",
        action: "import",
        after: { created, updated, failed, file: file.name, exported_errors: failedRows.length },
        note: "Quản trị viên nhập lịch sử đi làm từ Excel",
      });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Không đọc được file lịch sử đi làm");
    } finally {
      setImportingHistories(false);
    }
  };

  return (
    <PageContainer
      title="Nhập lịch sử đi làm"
      subtitle="Dùng UID để tìm tài khoản, nếu không khớp mới kiểm tra username"
    >
      <Card className="space-y-3 rounded-2xl p-4 shadow-soft">
        <div className="text-sm font-semibold">Nhập lịch sử đi làm</div>
        <div className="text-sm text-muted-foreground">
          File lịch sử phải có UID hoặc username của tài khoản đã tồn tại, nhà máy, ngày vào và họ
          tên/CCCD dùng tại nhà máy. Nếu không tìm thấy tài khoản, hệ thống sẽ xuất lại danh sách
          dòng lỗi để tạo tài khoản trước.
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="rounded-full" onClick={downloadHistoriesTemplate}>
            <FileSpreadsheet className="h-4 w-4" /> Tải file mẫu
          </Button>
          <label className="inline-flex">
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={importHistories} />
            <span className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground">
              <Upload className="h-4 w-4" />{" "}
              {importingHistories ? "Đang nhập..." : "Chọn file nhập lịch sử"}
            </span>
          </label>
        </div>
      </Card>

      {lastResult ? (
        <Card className="rounded-2xl border-primary/30 bg-primary/5 p-4 text-sm text-primary shadow-soft">
          {lastResult}
        </Card>
      ) : (
        <EmptyState
          icon={Workflow}
          title="Chưa có kết quả nhập gần đây"
          description="Tải file mẫu nếu cần rồi nhập lịch sử đi làm từ Excel."
        />
      )}

      <Card className="space-y-2 rounded-2xl p-4 shadow-soft">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Workflow className="h-4 w-4 text-primary" /> Quy tắc nhập lịch sử
        </div>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>- Muốn báo đi làm nhà máy mới thì hồ sơ cũ phải kết thúc trước.</li>
          <li>- Import lịch sử không tạo UID và không tạo tài khoản mới.</li>
          <li>- Họ tên và CCCD trong lịch sử là snapshot riêng, không lấy cứng từ hồ sơ gốc.</li>
          <li>- Lần nhập này ghi nhật ký đầy đủ để quản trị viên tra cứu người thay đổi.</li>
        </ul>
      </Card>
    </PageContainer>
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

function pickHistoryStatus(value: string, leaveDate: string): "working" | "left" {
  if (value.toLowerCase() === "left" || value.toLowerCase() === "đã nghỉ") return "left";
  if (leaveDate) return "left";
  return "working";
}

function normalizeExcelDate(value: unknown) {
  if (!value) return "";
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return "";
    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const asDate = new Date(text);
  if (Number.isNaN(asDate.getTime())) return "";
  return asDate.toISOString().slice(0, 10);
}

function escapePb(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
