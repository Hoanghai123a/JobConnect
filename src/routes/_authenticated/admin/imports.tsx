import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import * as XLSX from "xlsx";
import {
  Building2,
  ExternalLink,
  FileInput,
  FileSpreadsheet,
  Upload,
  UsersRound,
  Workflow,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { PageContainer } from "@/components/layout/PageContainer";
import { BulkWorkerHistoryImportCard } from "@/components/imports/BulkWorkerHistoryImportDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { exportToExcel, formatDateOnly } from "@/lib/excel";
import { normalizeDate } from "@/lib/date-utils";
import { fetchFactories } from "@/lib/factories";
import {
  createEmploymentHistory,
  fetchEmploymentHistories,
  getLatestEmploymentHistory,
  getEmploymentPersonalSnapshot,
  getMissingEmploymentSnapshotFields,
  getStaleWorkingEmploymentHistories,
  isCurrentlyWorking,
  updateEmploymentHistory,
  updateUserAndCache,
  buildHistoryUid,
  computeMaxHistoryUidSeq,
} from "@/lib/employment";
import { fetchAppSettings } from "@/lib/app-settings";
import { fetchMainHouses, type MainHouseRecord } from "@/lib/main-houses";
import { createStaffActionLog } from "@/lib/staff-log";
import { pb, type UserRecord } from "@/lib/pocketbase";
import {
  accountIdentityKey,
  buildUserIdentityMaps,
  normalizeAccountUsername,
} from "@/lib/account-identity";
import { generateUid } from "@/lib/uid";
import { resolveBankName } from "@/lib/vn-banks";
import { getUserErrorMessage } from "@/lib/toast";

const HISTORY_LOOKUP_KEYS = [
  "history_id",
  "history_uid",
  "uid",
  "ID lịch sử",
  "UID lịch sử",
  "Mã lịch sử",
  "Mã lịch sử (UID)",
];

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
  const [importingAccounts, setImportingAccounts] = useState(false);
  const [accountImportResult, setAccountImportResult] = useState<string>("");

  const downloadBulkEditTemplate = () => {
    exportToExcel(
      "mau_cap_nhat_nhanh_lich_su",
      {
        "Cập nhật nhanh": [
          {
            "Mã lịch sử (UID)": "",
            "ID NLĐ": "",
            "Tên đăng nhập": "nguyenvana",
            "SĐT tìm kiếm": "0900000001",
            "Tên nhà máy hiện tại": "Nhà máy A",
            "Mã nhà máy hiện tại": "",
            "Ngày vào hiện tại": "01/05/2026",
            "Mã NV mới": "NM001-MỚI",
            "Tên nhà máy mới": "",
            "Mã nhà máy mới": "",
            "Ngày vào mới": "",
            "Ngày nghỉ": "",
            "Họ tên tại thời điểm đi làm": "",
            "CCCD tại thời điểm đi làm": "",
            "Ngày sinh": "",
            "Địa chỉ thường trú": "",
            "Ngày cấp CCCD": "",
            "Người tuyển": "staff01",
            "Ghi chú": "Cập nhật mã NV",
          },
        ],
      },
      {
        "Cập nhật nhanh": [
          "Ngày vào hiện tại",
          "Ngày vào mới",
          "Ngày nghỉ",
          "Ngày sinh",
          "Ngày cấp CCCD",
        ],
      },
    );
  };

  const bulkEditHistories = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImportingBulkEdit(true);
    setBulkEditResult("");
    try {
      const [factoryRows, allUsers, allHistories] = await Promise.all([
        fetchFactories(),
        pb.collection("users").getFullList<UserRecord>({ sort: "full_name,username" }),
        fetchEmploymentHistories(),
      ]);
      const factoryByName = new Map(
        factoryRows.map((factory) => [accountIdentityKey(factory.name), factory]),
      );
      const factoryByCode = new Map(
        factoryRows
          .filter((factory) => factory.code)
          .map((factory) => [accountIdentityKey(factory.code), factory]),
      );
      const userById = new Map(allUsers.map((user) => [user.id, user]));
      const userByUsername = new Map(
        allUsers
          .filter((user) => user.username)
          .map((user) => [accountIdentityKey(user.username), user]),
      );
      const usersByPhone = new Map<string, UserRecord[]>();
      for (const user of allUsers) {
        const phoneKey = accountIdentityKey(user.phone);
        if (!phoneKey) continue;
        usersByPhone.set(phoneKey, [...(usersByPhone.get(phoneKey) || []), user]);
      }
      const staffByUsername = new Map(
        allUsers
          .filter((user) => user.role === "staff" || user.role === "admin")
          .filter((user) => user.username)
          .map((user) => [accountIdentityKey(user.username), user]),
      );
      const historyById = new Map(allHistories.map((history) => [history.id, history]));
      const historiesByUid = new Map<string, typeof allHistories>();
      for (const history of allHistories) {
        const uid = String(history.uid || "").trim();
        if (!uid) continue;
        historiesByUid.set(uid, [...(historiesByUid.get(uid) || []), history]);
      }

      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

      let updated = 0;
      let skipped = 0;
      let failed = 0;
      const failedRows: Array<Record<string, unknown>> = [];

      const addFailedRow = (row: Record<string, unknown>, rowNumber: number, reason: string) => {
        failed++;
        failedRows.push({
          Dòng: rowNumber,
          "Lý do lỗi": reason,
          history_id: pickValue(row, HISTORY_LOOKUP_KEYS),
          user_id: pickValue(row, ["user_id", "ID NLĐ"]),
          username: pickValue(row, ["username", "Tên đăng nhập"]),
          lookup_phone: pickValue(row, ["lookup_phone", "SĐT tìm kiếm"]),
          current_factory_name: pickValue(row, ["current_factory_name", "Tên nhà máy hiện tại"]),
          current_factory_code: pickValue(row, ["current_factory_code", "Mã nhà máy hiện tại"]),
          current_join_date: formatDateOnly(
            normalizeExcelDate(row["current_join_date"] ?? row["Ngày vào hiện tại"]),
          ),
        });
      };

      const resolveFactory = (name: string, code: string) => {
        const byName = name ? factoryByName.get(accountIdentityKey(name)) : undefined;
        const byCode = code ? factoryByCode.get(accountIdentityKey(code)) : undefined;
        if (byName && byCode && byName.id !== byCode.id) {
          return { factory: undefined, error: "Tên và mã nhà máy không khớp cùng một nhà máy" };
        }
        return { factory: byName || byCode };
      };

      for (const [index, row] of rows.entries()) {
        const rowNumber = index + 2;
        const historyKey = pickValue(row, HISTORY_LOOKUP_KEYS);
        const userId = pickValue(row, ["user_id", "ID NLĐ"]);
        const username = pickValue(row, ["username", "Tên đăng nhập"]);
        const lookupPhone = pickValue(row, ["lookup_phone", "SĐT tìm kiếm"]);
        const currentFactoryName = pickValue(row, ["current_factory_name", "Tên nhà máy hiện tại"]);
        const currentFactoryCode = pickValue(row, ["current_factory_code", "Mã nhà máy hiện tại"]);
        const currentJoinRaw = row["current_join_date"] ?? row["Ngày vào hiện tại"] ?? "";
        const currentJoinDate = normalizeExcelDate(currentJoinRaw);
        const unsupportedPhone = pickValue(row, ["phone", "SĐT mới"]);

        if (unsupportedPhone) {
          addFailedRow(
            row,
            rowNumber,
            "Cập nhật nhanh chỉ hỗ trợ collection lịch sử, không hỗ trợ sửa SĐT NLĐ",
          );
          continue;
        }

        let target = historyKey ? historyById.get(historyKey) : undefined;
        let targetUser: UserRecord | undefined;

        if (historyKey && !target) {
          const uidMatches = historiesByUid.get(historyKey) || [];
          if (uidMatches.length > 1) {
            addFailedRow(
              row,
              rowNumber,
              `Tìm thấy ${uidMatches.length} lịch sử trùng UID "${historyKey}"; không thể xác định bản ghi cần cập nhật`,
            );
            continue;
          }
          target = uidMatches[0];
        }

        if (historyKey && !target) {
          addFailedRow(row, rowNumber, `Không tìm thấy lịch sử có ID/UID "${historyKey}"`);
          continue;
        }

        if (!target) {
          const identityCount = [userId, username, lookupPhone].filter(Boolean).length;
          if (!identityCount) {
            addFailedRow(
              row,
              rowNumber,
              "Thiếu dữ liệu định danh: cần ID/UID lịch sử hoặc user_id/username/lookup_phone",
            );
            continue;
          }
          if (!currentFactoryName && !currentFactoryCode) {
            addFailedRow(
              row,
              rowNumber,
              "Thiếu current_factory_name hoặc current_factory_code để xác định lịch sử",
            );
            continue;
          }
          if (String(currentJoinRaw).trim() && !currentJoinDate) {
            addFailedRow(row, rowNumber, "current_join_date không hợp lệ");
            continue;
          }
          if (!currentJoinDate) {
            addFailedRow(row, rowNumber, "Thiếu current_join_date để xác định lịch sử");
            continue;
          }

          if (userId) targetUser = userById.get(userId);
          else if (username) targetUser = userByUsername.get(accountIdentityKey(username));
          else {
            const phoneMatches = usersByPhone.get(accountIdentityKey(lookupPhone)) || [];
            if (phoneMatches.length > 1) {
              addFailedRow(
                row,
                rowNumber,
                `Tìm thấy ${phoneMatches.length} NLĐ trùng lookup_phone; hãy dùng user_id hoặc username`,
              );
              continue;
            }
            targetUser = phoneMatches[0];
          }
          if (!targetUser) {
            addFailedRow(row, rowNumber, "Không tìm thấy NLĐ theo dữ liệu định danh");
            continue;
          }

          const currentFactoryResult = resolveFactory(currentFactoryName, currentFactoryCode);
          if (currentFactoryResult.error) {
            addFailedRow(row, rowNumber, currentFactoryResult.error);
            continue;
          }
          if (!currentFactoryResult.factory) {
            addFailedRow(row, rowNumber, "Không tìm thấy nhà máy hiện tại");
            continue;
          }
          const matches = allHistories.filter(
            (history) =>
              history.user === targetUser!.id &&
              history.factory === currentFactoryResult.factory!.id &&
              history.join_date === currentJoinDate,
          );
          if (matches.length === 0) {
            addFailedRow(
              row,
              rowNumber,
              "Không tìm thấy lịch sử theo NLĐ, nhà máy hiện tại và ngày vào hiện tại",
            );
            continue;
          }
          if (matches.length > 1) {
            addFailedRow(
              row,
              rowNumber,
              `Tìm thấy ${matches.length} lịch sử trùng dữ liệu nhận diện; hãy dùng ID/UID lịch sử`,
            );
            continue;
          }
          target = matches[0];
        }

        targetUser = targetUser || userById.get(target.user);
        if (!targetUser) {
          addFailedRow(row, rowNumber, "Không tìm thấy NLĐ của lịch sử được chọn");
          continue;
        }

        const employeeCode = pickValue(row, ["employee_code", "Mã NV mới"]);
        const factoryName = pickValue(row, ["factory_name", "Tên nhà máy mới"]);
        const factoryCode = pickValue(row, ["factory_code", "Mã nhà máy mới"]);
        const joinRaw = row["join_date"] ?? row["Ngày vào mới"] ?? "";
        const leaveRaw = row["leave_date"] ?? row["Ngày nghỉ"] ?? "";
        const joinDate = normalizeExcelDate(joinRaw);
        const leaveDate = normalizeExcelDate(leaveRaw);
        const recruiterUsername = pickValue(row, ["recruiter_username", "Người tuyển"]);
        const note = pickValue(row, ["note", "Ghi chú"]);
        const workerName = pickValue(row, [
          "worker_name_snapshot",
          "Họ tên tại thời điểm đi làm",
          "Họ tên tại nhà máy",
        ]);
        const workerCccd = pickValue(row, [
          "worker_cccd_snapshot",
          "CCCD tại thời điểm đi làm",
          "CCCD tại nhà máy",
        ]);
        const birthRaw = row["worker_date_of_birth_snapshot"] ?? row["Ngày sinh"] ?? "";
        const workerDateOfBirth = normalizeExcelDate(birthRaw);
        const workerAddress = pickValue(row, [
          "worker_address_snapshot",
          "Địa chỉ thường trú",
          "hometown_snapshot",
        ]);
        const issueRaw = row["cccd_issue_date"] ?? row["Ngày cấp CCCD"] ?? "";
        const cccdIssueDate = normalizeExcelDate(issueRaw);

        if (String(birthRaw).trim() && !workerDateOfBirth) {
          addFailedRow(row, rowNumber, "Ngày sinh không hợp lệ");
          continue;
        }
        if (String(issueRaw).trim() && !cccdIssueDate) {
          addFailedRow(row, rowNumber, "Ngày cấp CCCD không hợp lệ");
          continue;
        }
        if (String(joinRaw).trim() && !joinDate) {
          addFailedRow(row, rowNumber, "join_date không hợp lệ");
          continue;
        }
        if (String(leaveRaw).trim() && !leaveDate) {
          addFailedRow(row, rowNumber, "leave_date không hợp lệ");
          continue;
        }

        const historyPayload: Parameters<typeof updateEmploymentHistory>[1] = {};
        if (workerName) historyPayload.worker_name_snapshot = workerName;
        if (workerCccd) historyPayload.worker_cccd_snapshot = workerCccd;
        if (workerDateOfBirth) {
          historyPayload.worker_date_of_birth_snapshot = workerDateOfBirth;
        }
        if (workerAddress) {
          historyPayload.worker_address_snapshot = workerAddress;
          historyPayload.hometown_snapshot = workerAddress;
        }
        if (cccdIssueDate) historyPayload.cccd_issue_date = cccdIssueDate;
        if (employeeCode) historyPayload.employee_code = employeeCode;
        if (factoryName || factoryCode) {
          const nextFactoryResult = resolveFactory(factoryName, factoryCode);
          if (nextFactoryResult.error) {
            addFailedRow(row, rowNumber, nextFactoryResult.error);
            continue;
          }
          if (!nextFactoryResult.factory) {
            addFailedRow(row, rowNumber, "Không tìm thấy nhà máy cần cập nhật");
            continue;
          }
          historyPayload.factory = nextFactoryResult.factory.id;
        }
        if (joinDate) historyPayload.join_date = joinDate;
        if (leaveDate) historyPayload.leave_date = leaveDate;
        if (recruiterUsername) {
          const recruiter = staffByUsername.get(accountIdentityKey(recruiterUsername));
          if (!recruiter) {
            addFailedRow(row, rowNumber, `Không tìm thấy người tuyển "${recruiterUsername}"`);
            continue;
          }
          historyPayload.recruiter_staff = recruiter.id;
        }
        if (note) historyPayload.note = note;

        const finalJoinDate = String(historyPayload.join_date ?? target.join_date ?? "");
        const finalLeaveDate = String(historyPayload.leave_date ?? target.leave_date ?? "");
        if (finalLeaveDate && finalJoinDate && finalLeaveDate < finalJoinDate) {
          addFailedRow(row, rowNumber, "Ngày nghỉ không thể trước ngày vào");
          continue;
        }
        if (isCurrentlyWorking({ leave_date: finalLeaveDate || undefined })) {
          const anotherWorkingHistory = allHistories.find(
            (history) =>
              history.user === target!.user &&
              history.id !== target!.id &&
              isCurrentlyWorking(history),
          );
          if (anotherWorkingHistory) {
            addFailedRow(
              row,
              rowNumber,
              "Xung đột hai lịch sử đang làm; cần kết thúc lịch sử còn lại trước",
            );
            continue;
          }
        }

        if (Object.keys(historyPayload).length === 0) {
          skipped++;
          continue;
        }

        try {
          if (Object.keys(historyPayload).length) {
            const updatedHistory = await updateEmploymentHistory(target.id, historyPayload);
            const historyIndex = allHistories.findIndex((history) => history.id === target!.id);
            if (historyIndex >= 0) allHistories[historyIndex] = updatedHistory;
          }
          updated++;
        } catch (error: unknown) {
          addFailedRow(
            row,
            rowNumber,
            getUserErrorMessage(error, "Lỗi PocketBase khi cập nhật dữ liệu"),
          );
        }
      }

      const summary = `Cập nhật nhanh: tạo mới 0, cập nhật ${updated}, bỏ qua ${skipped}, thất bại ${failed}`;
      setBulkEditResult(summary);
      toast.success(summary);
      if (failedRows.length) {
        exportToExcel(
          `cap_nhat_nhanh_lich_su_loi_${Date.now()}`,
          { "Dòng lỗi": failedRows },
          { "Dòng lỗi": ["current_join_date"] },
        );
        toast.warning("Đã xuất file các dòng bị lỗi");
      }
      await createStaffActionLog({
        actor: currentUser,
        targetCollection: "employment_histories",
        action: "import",
        after: {
          created: 0,
          updated,
          skipped,
          failed,
          file: file.name,
          exported_errors: failedRows.length,
        },
        note: "Admin cập nhật nhanh lịch sử đi làm/NLĐ từ Excel",
      });
    } catch (error: unknown) {
      toast.error(getUserErrorMessage(error, "Không đọc được file cập nhật nhanh"));
    } finally {
      setImportingBulkEdit(false);
    }
  };

  const downloadHistoriesTemplate = () => {
    exportToExcel(
      "mau_import_lich_su_di_lam",
      {
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
            "Ngày sinh": "01/01/2000",
            "Địa chỉ thường trú": "Hà Nội",
            "Ngày cấp CCCD": "01/01/2020",
            "Mã số thuế": "0123456789",
            "Người tuyển": "staff01",
            "Ngày vào làm": "01/05/2026",
            "Ngày nghỉ": "",
            "Ghi chú": "Nhập mẫu",
          },
        ],
      },
      { "Lịch sử đi làm": ["Ngày sinh", "Ngày cấp CCCD", "Ngày vào làm", "Ngày nghỉ"] },
    );
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
      const staffUsers = allUsers.filter(
        (item) =>
          (item.role === "staff" || item.role === "admin") &&
          !String(item.username || "")
            .toLowerCase()
            .startsWith("vd_"),
      );
      const factoryByName = new Map(factoryRows.map((item) => [item.name.toLowerCase(), item]));
      const factoryByCode = new Map(
        factoryRows.map((item) => [(item.code || "").toLowerCase(), item]),
      );
      const mainHouseByName = new Map(
        mainHouseRows.map((item) => [accountIdentityKey(item.name), item]),
      );
      const { userByUid, userByUsername } = buildUserIdentityMaps(allUsers);
      const staffByUsername = new Map(
        staffUsers.map((item) => [accountIdentityKey(item.username), item]),
      );
      const staffByUid = new Map(
        staffUsers.filter((item) => item.uid).map((item) => [accountIdentityKey(item.uid), item]),
      );
      const existingHistories = await fetchEmploymentHistories();
      for (const history of getStaleWorkingEmploymentHistories(existingHistories)) {
        const updatedHistory = await updateEmploymentHistory(history.id, { status: "left" });
        Object.assign(history, updatedHistory);
      }
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
          "Ngày vào làm": formatDateOnly(
            (row["Ngày vào làm"] ?? row["join_date"] ?? row["Ngày vào"]) as string,
          ),
          "Ngày nghỉ": formatDateOnly((row["leave_date"] ?? row["Ngày nghỉ"]) as string),
          "Họ tên tại nhà máy": pickValue(row, ["worker_name_snapshot", "Họ tên tại nhà máy"]),
          "CCCD tại nhà máy": pickValue(row, ["worker_cccd_snapshot", "CCCD tại nhà máy"]),
          "Ngày sinh": formatDateOnly(
            (row["worker_date_of_birth_snapshot"] ?? row["Ngày sinh"]) as string,
          ),
          "Địa chỉ thường trú": pickValue(row, [
            "worker_address_snapshot",
            "Địa chỉ thường trú",
            "hometown_snapshot",
          ]),
          "Ngày cấp CCCD": formatDateOnly(
            (row["cccd_issue_date"] ?? row["Ngày cấp CCCD"]) as string,
          ),
          "Mã số thuế": pickValue(row, ["worker_tax_code_snapshot", "Mã số thuế", "MST"]),
          "Người tuyển": pickValue(row, ["recruiter_username", "Người tuyển"]),
          "Loại người tuyển": pickValue(row, ["recruiter_type", "Loại người tuyển"]),
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
        const workerDateOfBirth = normalizeExcelDate(
          row["worker_date_of_birth_snapshot"] ?? row["Ngày sinh"],
        );
        const workerAddress = pickValue(row, [
          "worker_address_snapshot",
          "Địa chỉ thường trú",
          "hometown_snapshot",
        ]);
        const cccdIssueDate = normalizeExcelDate(row["cccd_issue_date"] ?? row["Ngày cấp CCCD"]);
        const workerTaxCode = pickValue(row, ["worker_tax_code_snapshot", "Mã số thuế", "MST"]);
        const recruiterUsername = pickValue(row, ["recruiter_username", "Người tuyển"]);
        const recruiterType = pickValue(row, ["recruiter_type", "Loại người tuyển"]);
        const joinDate = normalizeExcelDate(
          row["Ngày vào làm"] ?? row["join_date"] ?? row["Ngày vào"],
        );
        const leaveDate = normalizeExcelDate(row["leave_date"] ?? row["Ngày nghỉ"]);
        const isWorking = isCurrentlyWorking({ leave_date: leaveDate || undefined });
        const note = pickValue(row, ["note", "Ghi chú"]);

        const user =
          (uid ? userByUid.get(accountIdentityKey(uid)) : undefined) ||
          (username ? userByUsername.get(accountIdentityKey(username)) : undefined);
        const factory =
          factoryByName.get(factoryName.toLowerCase()) ||
          factoryByCode.get(factoryCode.toLowerCase());
        const mainHouse = mainHouseName
          ? mainHouseByName.get(accountIdentityKey(mainHouseName))
          : undefined;
        const recruiterKey = accountIdentityKey(recruiterUsername);
        const recruiterTypeKey = accountIdentityKey(recruiterType);
        const internalRecruiter = staffByUsername.get(recruiterKey) || staffByUid.get(recruiterKey);
        const partnerRecruiter = mainHouseByName.get(recruiterKey);
        const wantsPartner = recruiterTypeKey === "partner" || recruiterTypeKey.includes("doi tac");
        const wantsInternal =
          recruiterTypeKey === "internal" || recruiterTypeKey.includes("noi bo");
        const recruiterAmbiguous =
          !wantsPartner && !wantsInternal && Boolean(internalRecruiter && partnerRecruiter);
        const recruiterStaff = wantsPartner ? undefined : internalRecruiter;
        const recruiterPartner = wantsInternal ? undefined : partnerRecruiter;

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
        if (recruiterAmbiguous) {
          addFailedRow(
            row,
            rowNumber,
            "Người tuyển trùng giữa Nội bộ và Đối tác; cần nhập Loại người tuyển.",
          );
          continue;
        }
        if (!recruiterStaff && !recruiterPartner) {
          addFailedRow(row, rowNumber, "Không tìm thấy Người tuyển theo loại đã chọn.");
          continue;
        }
        const missingSnapshotFields = [
          !workerName && "họ tên",
          !workerCccd && "CCCD",
          !workerDateOfBirth && "ngày sinh",
          !workerAddress && "địa chỉ thường trú",
          !cccdIssueDate && "ngày cấp CCCD",
        ].filter(Boolean);
        if (missingSnapshotFields.length) {
          addFailedRow(
            row,
            rowNumber,
            `Thiếu thông tin snapshot: ${missingSnapshotFields.join(", ")}.`,
          );
          continue;
        }

        const sameHistory = existingHistories.find(
          (item) =>
            item.user === user.id && item.factory === factory.id && item.join_date === joinDate,
        );
        const activeHistory = existingHistories.find(
          (item) =>
            item.user === user.id && isCurrentlyWorking(item) && item.id !== sameHistory?.id,
        );

        if (isWorking && activeHistory) {
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
          worker_date_of_birth_snapshot: workerDateOfBirth,
          worker_address_snapshot: workerAddress,
          hometown_snapshot: workerAddress,
          cccd_issue_date: cccdIssueDate,
          worker_tax_code_snapshot: workerTaxCode,
          recruiter_staff: recruiterStaff?.id || "",
          recruiter_partner: recruiterPartner?.id || "",
          join_date: joinDate,
          leave_date: leaveDate || undefined,
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
            getUserErrorMessage(error, "Không lưu được lịch sử đi làm."),
          );
        }
      }

      await syncWorkersFromLatestHistories(touchedUsers);

      const summary = `Lịch sử đi làm: tạo ${created}, cập nhật ${updated}, lỗi ${failed}`;
      setLastResult(summary);
      toast.success(summary);
      if (failedRows.length) {
        exportToExcel(
          `lich_su_di_lam_loi_${Date.now()}`,
          { "Dòng lỗi": failedRows },
          {
            "Dòng lỗi": [
              "Ngày sinh",
              "Ngày cấp CCCD",
              "Ngày vào làm",
              "Ngày nghỉ",
              "join_date",
              "leave_date",
            ],
          },
        );
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
      toast.error(getUserErrorMessage(error, "Không đọc được file lịch sử đi làm"));
    } finally {
      setImportingHistories(false);
    }
  };

  const downloadAccountsTemplate = () => {
    exportToExcel(
      "mau_import_tai_khoan",
      {
        "Tài khoản": [
          {
            "Họ tên": "Nguyễn Văn A",
            "Số điện thoại": "0900000001",
            "Tên đăng nhập": "nguyenvana",
            "Mật khẩu": "12345678",
            "Mã tài khoản (UID)": "",
            "Giới tính": "Nam",
            CCCD: "001099012345",
            "Ngày sinh": "15/01/1990",
            "Địa chỉ": "123 Đường ABC, Quận 1, TP.HCM",
            "Ngân hàng": "VCB",
            "Số tài khoản": "1234567890",
            "Tên tài khoản": "NGUYEN VAN A",
            "Ghi chú STK": "Tài khoản nhận lương",
          },
        ],
      },
      { "Tài khoản": ["Ngày sinh"] },
    );
  };

  const importAccounts = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImportingAccounts(true);
    setAccountImportResult("");
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const existingUsers = await pb.collection("users").getFullList<UserRecord>({
        fields: "id,username,uid",
      });
      const usernameKeys = new Set(
        existingUsers.map((user) => accountIdentityKey(user.username)).filter(Boolean),
      );
      const uidKeys = new Set(
        existingUsers.map((user) => accountIdentityKey(user.uid)).filter(Boolean),
      );
      const failedRows: Array<Record<string, unknown>> = [];
      let created = 0;
      let failed = 0;

      for (const [index, row] of rows.entries()) {
        const rowNumber = index + 2;
        const fullName = pickValue(row, ["Họ tên", "full_name"]);
        const phone = pickValue(row, ["Số điện thoại", "phone"]);
        const rawUsername = pickValue(row, ["Tên đăng nhập", "username"]);
        const username = normalizeAccountUsername(rawUsername);
        const password = pickValue(row, ["Mật khẩu", "password"]);
        const manualUid = pickValue(row, ["Mã tài khoản (UID)", "Mã tài khoản", "Mã TK", "uid"]);
        const gender = pickValue(row, ["Giới tính", "gender"]);
        const cccd = pickValue(row, ["CCCD", "cccd"]);
        const birthdayRaw = row["Ngày sinh"] ?? row["date_of_birth"] ?? "";
        const dateOfBirth = normalizeExcelDate(birthdayRaw);
        const address = pickValue(row, ["Địa chỉ", "address"]);
        const bankName = resolveBankName(pickValue(row, ["Ngân hàng", "bank_name"]));
        const bankAccountNumber = pickValue(row, ["Số tài khoản", "Số TK", "bank_account_number"]);
        const bankAccountName = pickValue(row, ["Tên tài khoản", "Tên TK", "bank_account_name"]);
        const bankAccountNote = pickValue(row, [
          "Ghi chú STK",
          "Ghi chú tài khoản",
          "bank_account_note",
        ]);

        const addFailedRow = (reason: string) => {
          failed++;
          failedRows.push({ Dòng: rowNumber, "Lý do lỗi": reason, ...row });
        };

        if (!fullName || !phone || !username || !password) {
          addFailedRow("Thiếu thông tin bắt buộc: họ tên, SĐT, tên đăng nhập hoặc mật khẩu");
          continue;
        }
        if (String(birthdayRaw).trim() && !dateOfBirth) {
          addFailedRow("Ngày sinh không hợp lệ");
          continue;
        }
        if (usernameKeys.has(accountIdentityKey(username))) {
          addFailedRow("Tên đăng nhập đã tồn tại");
          continue;
        }
        if (manualUid && uidKeys.has(accountIdentityKey(manualUid))) {
          addFailedRow("Mã tài khoản đã tồn tại");
          continue;
        }
        if (password.length < 8) {
          addFailedRow("Mật khẩu phải có ít nhất 8 ký tự");
          continue;
        }

        try {
          const uid = await generateUid(manualUid || undefined);
          await pb.collection("users").create({
            full_name: fullName,
            phone,
            username,
            uid,
            password,
            passwordConfirm: password,
            gender,
            cccd,
            date_of_birth: dateOfBirth,
            address,
            bank_name: bankName,
            bank_account_number: bankAccountNumber,
            bank_account_name: bankAccountName,
            bank_account_note: bankAccountNote,
            role: "user",
            approvalStatus: "approved",
            approved: "true",
            status: "active",
            must_change_password: password === "12345678",
          });
          usernameKeys.add(accountIdentityKey(username));
          uidKeys.add(accountIdentityKey(uid));
          created++;
        } catch (error: unknown) {
          addFailedRow(getUserErrorMessage(error, "Lỗi PocketBase khi tạo tài khoản"));
        }
      }

      const summary = `Import tài khoản: tạo ${created}, cập nhật 0, thất bại ${failed}`;
      setAccountImportResult(summary);
      toast.success(summary);
      if (failedRows.length) {
        exportToExcel(
          `import_tai_khoan_loi_${Date.now()}`,
          { "Dòng lỗi": failedRows },
          { "Dòng lỗi": ["Ngày sinh", "date_of_birth"] },
        );
        toast.warning("Đã xuất file các dòng bị lỗi");
      }
      await createStaffActionLog({
        actor: currentUser,
        targetCollection: "users",
        action: "import",
        after: { created, updated: 0, failed, file: file.name, exported_errors: failedRows.length },
        note: "Admin import tài khoản NLĐ từ Excel",
      });
    } catch (error: unknown) {
      toast.error(getUserErrorMessage(error, "Không đọc được file import tài khoản"));
    } finally {
      setImportingAccounts(false);
    }
  };

  return (
    <PageContainer
      title="Nhập dữ liệu"
      subtitle="Tạo mới, nhập và cập nhật dữ liệu Excel tập trung cho quản trị viên"
    >
      <div className="space-y-4 desktop:grid desktop:grid-cols-2 desktop:items-start desktop:gap-5 desktop:space-y-0">
        <BulkWorkerHistoryImportCard actor={currentUser} />

        <Card className="space-y-3 rounded-2xl p-4 shadow-soft">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <FileSpreadsheet className="h-4 w-4 text-primary" /> Import lịch sử đi làm đầy đủ
          </div>
          <div className="text-sm text-muted-foreground">
            Dùng UID hoặc tên đăng nhập của tài khoản đã tồn tại để tạo mới/cập nhật lịch sử, kèm
            nhà máy, ngày vào và thông tin snapshot tại nhà máy.
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-full" onClick={downloadHistoriesTemplate}>
              <FileSpreadsheet className="h-4 w-4" /> Tải file mẫu
            </Button>
            <label className="inline-flex">
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={importHistories}
              />
              <span className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground">
                <Upload className="h-4 w-4" />{" "}
                {importingHistories ? "Đang nhập..." : "Chọn file lịch sử"}
              </span>
            </label>
          </div>
          {lastResult && <ImportResult>{lastResult}</ImportResult>}
        </Card>

        <Card className="hidden space-y-3 rounded-2xl p-4 shadow-soft desktop:block">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <FileInput className="h-4 w-4 text-primary" /> Cập nhật nhanh lịch sử/NLĐ
          </div>
          <div className="text-sm text-muted-foreground">
            Chỉ điền các cột cần sửa. Ưu tiên <code>Mã lịch sử (UID)</code> đang hiển thị trên bản
            ghi; hệ thống vẫn chấp nhận PocketBase record ID. Nếu không có, dùng thông tin NLĐ kèm
            nhà máy và ngày vào hiện tại. Ô để trống sẽ giữ nguyên dữ liệu; chỉ collection lịch sử
            được cập nhật.
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-full" onClick={downloadBulkEditTemplate}>
              <FileSpreadsheet className="h-4 w-4" /> Tải file mẫu
            </Button>
            <label className="inline-flex">
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={bulkEditHistories}
              />
              <span className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground">
                <Upload className="h-4 w-4" />{" "}
                {importingBulkEdit ? "Đang xử lý..." : "Chọn file cập nhật"}
              </span>
            </label>
          </div>
          {bulkEditResult && <ImportResult>{bulkEditResult}</ImportResult>}
        </Card>

        <Card className="hidden space-y-3 rounded-2xl p-4 shadow-soft desktop:block">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <UsersRound className="h-4 w-4 text-primary" /> Import tài khoản NLĐ
          </div>
          <div className="text-sm text-muted-foreground">
            Tạo mới tài khoản NLĐ từ Excel. File lỗi sẽ được xuất lại, kèm số dòng và nguyên nhân cụ
            thể.
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-full" onClick={downloadAccountsTemplate}>
              <FileSpreadsheet className="h-4 w-4" /> Tải file mẫu
            </Button>
            <label className="inline-flex">
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={importAccounts} />
              <span className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground">
                <Upload className="h-4 w-4" />{" "}
                {importingAccounts ? "Đang nhập..." : "Chọn file tài khoản"}
              </span>
            </label>
          </div>
          {accountImportResult && <ImportResult>{accountImportResult}</ImportResult>}
        </Card>

        <Card className="hidden space-y-3 rounded-2xl p-4 shadow-soft desktop:block">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Building2 className="h-4 w-4 text-primary" /> Check công và bảng lương
          </div>
          <div className="text-sm text-muted-foreground">
            Các file chấm công và bảng lương có luồng nghiệp vụ riêng, tiếp tục xử lý tại màn hình
            Check công/lương.
          </div>
          <Button asChild variant="outline" className="rounded-full">
            <Link to="/check-attendance">
              Mở Check công/lương <ExternalLink className="h-4 w-4" />
            </Link>
          </Button>
        </Card>

        <Card className="space-y-2 rounded-2xl p-4 shadow-soft desktop:col-span-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Workflow className="h-4 w-4 text-primary" /> Quy tắc import
          </div>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>- Dòng lỗi không làm dừng các dòng hợp lệ; hệ thống xuất lại file để sửa.</li>
            <li>- Cập nhật nhanh không xóa dữ liệu bằng ô trống và không tự tạo lịch sử mới.</li>
            <li>- Cập nhật nhanh chỉ ghi vào lịch sử; không thay đổi dữ liệu hồ sơ NLĐ.</li>
            <li>
              - Mọi lần import đều ghi Nhật ký thao tác hệ thống cùng tên file và kết quả tổng hợp.
            </li>
          </ul>
        </Card>
      </div>
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

function normalizeExcelDate(value: unknown) {
  if (!value) return "";
  return normalizeDate(value);
}

function ImportResult({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm text-primary">
      {children}
    </div>
  );
}

async function syncWorkersFromLatestHistories(userIds: Iterable<string>) {
  for (const userId of userIds) {
    const histories = (await fetchEmploymentHistories([userId])).filter(
      (history) => history.user === userId,
    );
    const latest = getLatestEmploymentHistory(histories);
    await updateUserAndCache(userId, {
      company: latest?.expand?.factory?.name || "",
      employee_code: latest?.employee_code || "",
    });
  }
}
