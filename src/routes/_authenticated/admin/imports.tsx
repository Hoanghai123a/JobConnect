import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import * as XLSX from "xlsx";
import { FileSpreadsheet, Upload, Workflow } from "lucide-react";
import { toast } from "sonner";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { exportToExcel, formatDateOnly } from "@/lib/excel";
import { normalizeDate } from "@/lib/date-utils";
import { fetchFactories } from "@/lib/factories";
import {
  createEmploymentHistory,
  fetchEmploymentHistories,
  getLatestEmploymentHistory,
  syncLegacyUserWorkFields,
  updateEmploymentHistory,
  buildHistoryUid,
  computeMaxHistoryUidSeq,
} from "@/lib/employment";
import { fetchAppSettings } from "@/lib/app-settings";
import { fetchMainHouses, type MainHouseRecord } from "@/lib/main-houses";
import { createStaffActionLog } from "@/lib/staff-log";
import { pb, type UserRecord } from "@/lib/pocketbase";
import { accountIdentityKey, buildUserIdentityMaps } from "@/lib/account-identity";

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
  const [importingBulkEdit, setImportingBulkEdit] = useState(false);
  const [bulkEditResult, setBulkEditResult] = useState<string>("");

  const downloadBulkEditTemplate = () => {
    exportToExcel("mau_sua_hang_loat_lich_su", {
      "Sửa hàng loạt": [
        {
          "UID lịch sử": "HL2607001",
          "Mã NV (match)": "NM001",
          "Tên nhà máy (match)": "",
          "Ngày vào (match)": "",
          "Mã NV (sửa)": "NM001-NEW",
          "Họ tên tại NM": "",
          "CCCD tại NM": "",
          "Mã số thuế": "",
          "Người tuyển (username)": "",
          "Nhà chính": "",
          "Ngày vào (sửa)": "",
          "Ngày nghỉ": "",
          "Trạng thái": "",
          "Ghi chú": "Cập nhật mã NV mới",
        },
        {
          "UID lịch sử": "",
          "Mã NV (match)": "NM002",
          "Tên nhà máy (match)": "Nhà máy B",
          "Ngày vào (match)": "",
          "Mã NV (sửa)": "",
          "Họ tên tại NM": "",
          "CCCD tại NM": "",
          "Mã số thuế": "",
          "Người tuyển (username)": "staff01",
          "Nhà chính": "Nhà chính HN",
          "Ngày vào (sửa)": "",
          "Ngày nghỉ": "",
          "Trạng thái": "",
          "Ghi chú": "",
        },
        {
          "UID lịch sử": "",
          "Mã NV (match)": "",
          "Tên nhà máy (match)": "Nhà máy C",
          "Ngày vào (match)": "01/06/2026",
          "Mã NV (sửa)": "NM-NEW",
          "Họ tên tại NM": "",
          "CCCD tại NM": "",
          "Mã số thuế": "",
          "Người tuyển (username)": "",
          "Nhà chính": "",
          "Ngày vào (sửa)": "",
          "Ngày nghỉ": "30/06/2026",
          "Trạng thái": "Đã nghỉ",
          "Ghi chú": "",
        },
      ],
    });
  };

  const bulkEditHistories = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImportingBulkEdit(true);
    setBulkEditResult("");
    try {
      const [factoryRows, allUsers, mainHouseRows, allHistories] = await Promise.all([
        fetchFactories(),
        pb.collection("users").getFullList<UserRecord>({ sort: "full_name,username" }),
        fetchMainHouses().catch(() => [] as MainHouseRecord[]),
        fetchEmploymentHistories(),
      ]);
      const staffUsers = allUsers.filter((u) => u.role === "staff" || u.role === "admin");
      const factoryByName = new Map(factoryRows.map((f) => [f.name.toLowerCase(), f]));
      const mainHouseByName = new Map(mainHouseRows.map((h) => [h.name.toLowerCase(), h]));
      const staffByUsername = new Map(
        staffUsers.map((s) => [accountIdentityKey(s.username), s]),
      );
      const historyByUid = new Map(
        allHistories.filter((h): h is typeof h & { uid: string } => !!h.uid).map((h) => [h.uid.toLowerCase(), h]),
      );

      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

      let updatedCount = 0;
      let skipped = 0;
      let failed = 0;
      const touchedUsers = new Set<string>();
      const failedRows: Array<Record<string, unknown>> = [];

      const addFailedRow = (row: Record<string, unknown>, rowNumber: number, reason: string) => {
        failed++;
        failedRows.push({
          Dòng: rowNumber,
          "Lý do lỗi": reason,
          "UID lịch sử": pickValue(row, ["UID lịch sử", "uid_lich_su", "history_uid"]),
          "Mã NV (match)": pickValue(row, ["Mã NV (match)", "ma_nv_match", "employee_code_match"]),
          "Tên nhà máy (match)": pickValue(row, ["Tên nhà máy (match)", "factory_name_match", "Nhà máy (match)"]),
          "Ngày vào (match)": formatDateOnly((row["Ngày vào (match)"] ?? row["join_date_match"] ?? "") as string),
        });
      };

      for (const [index, row] of rows.entries()) {
        const rowNumber = index + 2;
        const historyUid = pickValue(row, ["UID lịch sử", "uid_lich_su", "history_uid"]);
        const matchEmployeeCode = pickValue(row, ["Mã NV (match)", "ma_nv_match", "employee_code_match"]);
        const matchFactoryName = pickValue(row, ["Tên nhà máy (match)", "factory_name_match", "Nhà máy (match)"]);
        const matchJoinDate = normalizeExcelDate(row["Ngày vào (match)"] ?? row["join_date_match"] ?? "");

        let target: (typeof allHistories)[number] | undefined;

        // Tier 1: UID lịch sử + Mã NV
        if (historyUid && matchEmployeeCode) {
          target = allHistories.find(
            (h) =>
              h.uid?.toLowerCase() === historyUid.toLowerCase() &&
              h.employee_code?.toLowerCase() === matchEmployeeCode.toLowerCase(),
          );
          if (!target) {
            addFailedRow(row, rowNumber, `Không tìm thấy lịch sử với UID "${historyUid}" và Mã NV "${matchEmployeeCode}"`);
            continue;
          }
        }
        // Tier 2: Mã NV + Tên nhà máy
        else if (matchEmployeeCode && matchFactoryName) {
          const factory = factoryByName.get(matchFactoryName.toLowerCase());
          if (!factory) {
            addFailedRow(row, rowNumber, `Không tìm thấy nhà máy "${matchFactoryName}"`);
            continue;
          }
          const matches = allHistories.filter(
            (h) =>
              h.employee_code?.toLowerCase() === matchEmployeeCode.toLowerCase() &&
              h.factory === factory.id,
          );
          if (matches.length === 0) {
            addFailedRow(row, rowNumber, `Không tìm thấy lịch sử với Mã NV "${matchEmployeeCode}" tại "${matchFactoryName}"`);
            continue;
          }
          if (matches.length > 1) {
            addFailedRow(row, rowNumber, `Tìm thấy ${matches.length} lịch sử trùng Mã NV + Nhà máy, hãy dùng UID lịch sử để phân biệt`);
            continue;
          }
          target = matches[0];
        }
        // Tier 3: Tên nhà máy + Ngày vào
        else if (matchFactoryName && matchJoinDate) {
          const factory = factoryByName.get(matchFactoryName.toLowerCase());
          if (!factory) {
            addFailedRow(row, rowNumber, `Không tìm thấy nhà máy "${matchFactoryName}"`);
            continue;
          }
          const matches = allHistories.filter(
            (h) => h.factory === factory.id && h.join_date === matchJoinDate,
          );
          if (matches.length === 0) {
            addFailedRow(row, rowNumber, `Không tìm thấy lịch sử tại "${matchFactoryName}" ngày vào ${matchJoinDate}`);
            continue;
          }
          if (matches.length > 1) {
            addFailedRow(row, rowNumber, `Tìm thấy ${matches.length} lịch sử trùng Nhà máy + Ngày vào, hãy dùng UID lịch sử hoặc Mã NV`);
            continue;
          }
          target = matches[0];
        } else {
          addFailedRow(row, rowNumber, "Thiếu thông tin match: cần (UID + Mã NV), hoặc (Mã NV + Nhà máy), hoặc (Nhà máy + Ngày vào)");
          continue;
        }

        // Build partial payload from non-empty edit cells
        const editEmployeeCode = pickValue(row, ["Mã NV (sửa)", "ma_nv_sua", "employee_code_edit"]);
        const editWorkerName = pickValue(row, ["Họ tên tại NM", "worker_name_snapshot", "Họ tên tại nhà máy"]);
        const editWorkerCccd = pickValue(row, ["CCCD tại NM", "worker_cccd_snapshot", "CCCD tại nhà máy"]);
        const editTaxCode = pickValue(row, ["Mã số thuế", "worker_tax_code_snapshot", "MST"]);
        const editRecruiter = pickValue(row, ["Người tuyển (username)", "recruiter_username", "Người tuyển"]);
        const editMainHouse = pickValue(row, ["Nhà chính", "main_house_name"]);
        const editJoinDateRaw = row["Ngày vào (sửa)"] ?? row["join_date_edit"] ?? "";
        const editJoinDate = normalizeExcelDate(editJoinDateRaw);
        const editLeaveDateRaw = row["Ngày nghỉ"] ?? row["leave_date"] ?? "";
        const editLeaveDate = normalizeExcelDate(editLeaveDateRaw);
        const editStatus = pickValue(row, ["Trạng thái", "status"]);
        const editNote = pickValue(row, ["Ghi chú", "note"]);

        const payload: Record<string, unknown> = {};

        if (editEmployeeCode) payload.employee_code = editEmployeeCode;
        if (editWorkerName) payload.worker_name_snapshot = editWorkerName;
        if (editWorkerCccd) payload.worker_cccd_snapshot = editWorkerCccd;
        if (editTaxCode) payload.worker_tax_code_snapshot = editTaxCode;
        if (editRecruiter) {
          const recruiter = staffByUsername.get(editRecruiter.toLowerCase());
          if (!recruiter) {
            addFailedRow(row, rowNumber, `Không tìm thấy người tuyển "${editRecruiter}"`);
            continue;
          }
          payload.recruiter_staff = recruiter.id;
        }
        if (editMainHouse) {
          const house = mainHouseByName.get(editMainHouse.toLowerCase());
          if (!house) {
            addFailedRow(row, rowNumber, `Không tìm thấy nhà chính "${editMainHouse}"`);
            continue;
          }
          payload.main_house = house.id;
        }
        if (editJoinDate) payload.join_date = editJoinDate;
        if (editLeaveDate) {
          const cleared = editLeaveDate.toLowerCase();
          payload.leave_date = cleared === "xoa" || cleared === "clear" ? "" : editLeaveDate;
        } else if (String(editLeaveDateRaw).trim().toLowerCase() === "xoa" || String(editLeaveDateRaw).trim().toLowerCase() === "clear") {
          payload.leave_date = "";
        }
        if (editStatus) {
          payload.status = pickHistoryStatus(editStatus, String(payload.leave_date ?? target.leave_date ?? ""));
        }
        if (editNote) payload.note = editNote;

        if (Object.keys(payload).length === 0) {
          skipped++;
          continue;
        }

        // Status conflict check
        if (payload.status === "working") {
          const activeHistory = allHistories.find(
            (h) => h.user === target!.user && h.status === "working" && h.id !== target!.id,
          );
          if (activeHistory) {
            addFailedRow(row, rowNumber, "Người lao động đang có lịch sử active khác, cần kết thúc trước");
            continue;
          }
        }

        try {
          const before = { ...target };
          const updated = await updateEmploymentHistory(target.id, payload);
          touchedUsers.add(target.user);
          updatedCount++;

          await createStaffActionLog({
            actor: currentUser,
            targetUserId: target.user,
            targetCollection: "employment_histories",
            targetRecord: target.id,
            action: "update",
            before,
            after: updated,
            note: "Admin cập nhật hàng loạt lịch sử đi làm từ Excel",
          });
        } catch (error: unknown) {
          addFailedRow(row, rowNumber, error instanceof Error ? error.message : "Lỗi cập nhật record");
        }
      }

      for (const userId of touchedUsers) {
        const userHistories = (await fetchEmploymentHistories([userId])).filter(
          (h) => h.user === userId,
        );
        await syncLegacyUserWorkFields(userId, getLatestEmploymentHistory(userHistories));
      }

      const summary = `Sửa hàng loạt: cập nhật ${updatedCount}, bỏ qua ${skipped}, lỗi ${failed}`;
      setBulkEditResult(summary);
      toast.success(summary);
      if (failedRows.length) {
        exportToExcel(`sua_hang_loat_loi_${Date.now()}`, { "Dòng lỗi": failedRows });
        toast.warning("Đã xuất file các dòng bị lỗi");
      }
      await createStaffActionLog({
        actor: currentUser,
        targetCollection: "employment_histories",
        action: "import",
        after: { updated: updatedCount, skipped, failed, file: file.name },
        note: "Admin sửa hàng loạt lịch sử đi làm từ Excel",
      });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Không đọc được file");
    } finally {
      setImportingBulkEdit(false);
    }
  };

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
          "Mã số thuế": "0123456789",
          "Người tuyển": "staff01",
          "Ngày vào làm": "01/05/2026",
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
        pb.collection("users").getFullList<UserRecord>({ sort: "full_name,username" }),
        fetchMainHouses().catch(() => [] as MainHouseRecord[]),
      ]);
      const staffUsers = allUsers.filter((item) => item.role === "staff" || item.role === "admin");
      const factoryByName = new Map(factoryRows.map((item) => [item.name.toLowerCase(), item]));
      const factoryByCode = new Map(
        factoryRows.map((item) => [(item.code || "").toLowerCase(), item]),
      );
      const mainHouseByName = new Map(mainHouseRows.map((item) => [item.name.toLowerCase(), item]));
      const { userByUid, userByUsername } = buildUserIdentityMaps(allUsers);
      const staffByUsername = new Map(
        staffUsers.map((item) => [accountIdentityKey(item.username), item]),
      );
      const existingHistories = await fetchEmploymentHistories();
      const appSettings = await fetchAppSettings();
      const historyUidPrefix = (appSettings.account_code_prefix || "").trim();
      const importNow = new Date();
      const importYear = importNow.getFullYear();
      const importMonth = importNow.getMonth() + 1;
      let nextHistoryUidSeq = computeMaxHistoryUidSeq(
        existingHistories,
        historyUidPrefix,
        importYear,
        importMonth,
      );

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
          "Ngày vào làm": formatDateOnly((row["Ngày vào làm"] ?? row["join_date"] ?? row["Ngày vào"]) as string),
          "Ngày nghỉ": formatDateOnly((row["leave_date"] ?? row["Ngày nghỉ"]) as string),
          "Họ tên tại nhà máy": pickValue(row, ["worker_name_snapshot", "Họ tên tại nhà máy"]),
          "CCCD tại nhà máy": pickValue(row, ["worker_cccd_snapshot", "CCCD tại nhà máy"]),
          "Mã số thuế": pickValue(row, ["worker_tax_code_snapshot", "Mã số thuế", "MST"]),
          "Người tuyển": pickValue(row, ["recruiter_username", "Người tuyển"]),
          "Trạng thái": pickValue(row, ["status", "Trạng thái"]),
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
        const workerTaxCode = pickValue(row, ["worker_tax_code_snapshot", "Mã số thuế", "MST"]);
        const recruiterUsername = pickValue(row, ["recruiter_username", "Người tuyển"]);
        const joinDate = normalizeExcelDate(
          row["Ngày vào làm"] ?? row["join_date"] ?? row["Ngày vào"],
        );
        const leaveDate = normalizeExcelDate(row["leave_date"] ?? row["Ngày nghỉ"]);
        const status = pickHistoryStatus(pickValue(row, ["status", "Trạng thái"]), leaveDate);
        const note = pickValue(row, ["note", "Ghi chú"]);

        const user =
          (uid ? userByUid.get(accountIdentityKey(uid)) : undefined) ||
          (username ? userByUsername.get(accountIdentityKey(username)) : undefined);
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
            "Không tìm thấy tài khoản theo mã tài khoản (UID) hoặc tên đăng nhập. Cần tạo tài khoản trước.",
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
          worker_tax_code_snapshot: workerTaxCode,
          recruiter_staff: recruiter?.id || "",
          join_date: joinDate,
          leave_date: leaveDate || undefined,
          status,
          note,
        };

        try {
          if (sameHistory) {
            await updateEmploymentHistory(sameHistory.id, payload);
            updated++;
          } else {
            nextHistoryUidSeq++;
            const createdHistory = await createEmploymentHistory(payload, {
              uid: buildHistoryUid(historyUidPrefix, importYear, importMonth, nextHistoryUidSeq),
            });
            created++;
            existingHistories.push(createdHistory);
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
      subtitle="Dùng mã tài khoản (UID) để tìm tài khoản, nếu không khớp mới kiểm tra tên đăng nhập"
    >
      <Card className="space-y-3 rounded-2xl p-4 shadow-soft">
        <div className="text-sm font-semibold">Nhập lịch sử đi làm</div>
        <div className="text-sm text-muted-foreground">
          File lịch sử phải có mã tài khoản (UID) hoặc tên đăng nhập của tài khoản đã tồn tại, nhà máy, ngày vào và họ
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
          <li>- Import lịch sử không tạo mã tài khoản (UID) và không tạo tài khoản mới.</li>
          <li>- Họ tên và CCCD trong lịch sử là snapshot riêng, không lấy cứng từ hồ sơ gốc.</li>
          <li>- Lần nhập này ghi nhật ký đầy đủ để quản trị viên tra cứu người thay đổi.</li>
        </ul>
      </Card>

      <Card className="space-y-3 rounded-2xl p-4 shadow-soft">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <FileSpreadsheet className="h-4 w-4 text-primary" /> Sửa hàng loạt lịch sử đi làm
        </div>
        <div className="text-sm text-muted-foreground">
          Cập nhật 1 hoặc nhiều trường cho các bản ghi đã có. Ô trống = không thay đổi. Hệ thống
          tìm record theo UID lịch sử + Mã NV, hoặc Mã NV + Nhà máy, hoặc Nhà máy + Ngày vào.
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="rounded-full" onClick={downloadBulkEditTemplate}>
            <FileSpreadsheet className="h-4 w-4" /> Tải file mẫu sửa
          </Button>
          <label className="inline-flex">
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={bulkEditHistories} />
            <span className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground">
              <Upload className="h-4 w-4" />{" "}
              {importingBulkEdit ? "Đang xử lý..." : "Chọn file sửa hàng loạt"}
            </span>
          </label>
        </div>
        {bulkEditResult && (
          <div className="rounded-xl border-primary/30 bg-primary/5 p-3 text-sm text-primary">
            {bulkEditResult}
          </div>
        )}
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
  return normalizeDate(value);
}

function escapePb(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
