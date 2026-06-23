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
  fetchEmploymentHistories,
  getLatestEmploymentHistory,
  syncLegacyUserWorkFields,
} from "@/lib/employment";
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
      Histories: [
        {
          username: "nguyenvana",
          factory_name: "Nhà máy A",
          employee_code: "NM001",
          worker_name_snapshot: "Nguyễn Văn A",
          worker_cccd_snapshot: "012345678901",
          recruiter_username: "staff01",
          join_date: "2026-05-01",
          leave_date: "",
          status: "working",
          note: "Import mẫu",
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
      const [factoryRows, allUsers] = await Promise.all([
        fetchFactories(),
        pb.collection("users").getFullList<UserRecord>({ sort: "full_name,username" }),
      ]);
      const staffUsers = allUsers.filter((item) => item.role === "staff" || item.role === "admin");
      const factoryByName = new Map(factoryRows.map((item) => [item.name.toLowerCase(), item]));
      const factoryByCode = new Map(
        factoryRows.map((item) => [(item.code || "").toLowerCase(), item]),
      );
      const userByUsername = new Map(
        allUsers.map((item) => [(item.username || "").toLowerCase(), item]),
      );
      const userByPhone = new Map(allUsers.map((item) => [(item.phone || "").toLowerCase(), item]));
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

      for (const row of rows) {
        const userId = pickValue(row, ["user_id", "User ID", "userId"]);
        const username = pickValue(row, ["username", "Tên đăng nhập"]);
        const phone = pickValue(row, ["phone", "Số điện thoại"]);
        const factoryName = pickValue(row, ["factory_name", "Nhà máy"]);
        const factoryCode = pickValue(row, ["factory_code", "Mã nhà máy"]);
        const employeeCode = pickValue(row, ["employee_code", "Mã NV"]);
        const workerName = pickValue(row, ["worker_name_snapshot", "Họ tên tại nhà máy"]);
        const workerCccd = pickValue(row, ["worker_cccd_snapshot", "CCCD tại nhà máy"]);
        const recruiterUsername = pickValue(row, ["recruiter_username", "Người tuyển"]);
        const joinDate = normalizeExcelDate(row["join_date"] ?? row["Ngày vào"]);
        const leaveDate = normalizeExcelDate(row["leave_date"] ?? row["Ngày nghỉ"]);
        const status = pickHistoryStatus(pickValue(row, ["status", "Trạng thái"]), leaveDate);
        const note = pickValue(row, ["note", "Ghi chú"]);

        const user =
          allUsers.find((item) => item.id === userId) ||
          userByUsername.get(username.toLowerCase()) ||
          userByPhone.get(phone.toLowerCase());
        const factory =
          factoryByName.get(factoryName.toLowerCase()) ||
          factoryByCode.get(factoryCode.toLowerCase());
        const recruiter = staffByUsername.get(recruiterUsername.toLowerCase());

        if (!user || !factory || !joinDate || !workerName || !workerCccd) {
          failed++;
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
          failed++;
          continue;
        }

        const payload = {
          user: user.id,
          factory: factory.id,
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
            await pb.collection("employment_histories").update(sameHistory.id, payload);
            updated++;
          } else {
            await pb.collection("employment_histories").create(payload);
            created++;
          }
          touchedUsers.add(user.id);
        } catch {
          failed++;
        }
      }

      for (const id of touchedUsers) {
        const userHistories = (await fetchEmploymentHistories([id])).filter(
          (item) => item.user === id,
        );
        await syncLegacyUserWorkFields(id, getLatestEmploymentHistory(userHistories));
      }

      const summary = `Lịch sử: tạo ${created}, cập nhật ${updated}, lỗi ${failed}`;
      setLastResult(summary);
      toast.success(summary);
      await createStaffActionLog({
        actor: currentUser,
        targetCollection: "employment_histories",
        action: "import",
        after: { created, updated, failed, file: file.name },
        note: "Admin import lịch sử đi làm từ Excel",
      });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Không đọc được file lịch sử đi làm");
    } finally {
      setImportingHistories(false);
    }
  };

  return (
    <PageContainer title="Import lịch sử đi làm" subtitle="Chỉ import lịch sử đi làm của user">
      <Card className="space-y-3 rounded-2xl p-4 shadow-soft">
        <div className="text-sm font-semibold">Import lịch sử đi làm</div>
        <div className="text-sm text-muted-foreground">
          File lịch sử phải chỉ rõ user, nhà máy, ngày vào và họ tên/CCCD dùng tại nhà máy. Nếu user
          còn lịch sử đang làm thì file sẽ bị chặn tạo bản ghi đang làm mới.
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="rounded-full" onClick={downloadHistoriesTemplate}>
            <FileSpreadsheet className="h-4 w-4" /> Tải file mẫu
          </Button>
          <label className="inline-flex">
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={importHistories} />
            <span className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground">
              <Upload className="h-4 w-4" />{" "}
              {importingHistories ? "Đang import..." : "Chọn file import lịch sử"}
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
          title="Chưa có kết quả import gần đây"
          description="Tải file mẫu nếu cần rồi import lịch sử đi làm từ Excel."
        />
      )}

      <Card className="space-y-2 rounded-2xl p-4 shadow-soft">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Workflow className="h-4 w-4 text-primary" /> Quy tắc import lịch sử
        </div>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>- Muốn báo đi làm nhà máy mới thì hồ sơ cũ phải kết thúc trước.</li>
          <li>- Họ tên và CCCD trong lịch sử là snapshot riêng, không lấy cứng từ hồ sơ gốc.</li>
          <li>- Import này ghi log đầy đủ để admin tra cứu người thay đổi.</li>
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
