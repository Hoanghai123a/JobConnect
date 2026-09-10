#!/usr/bin/env node
/**
 * Script import dữ liệu JSON users và attendance vào PocketBase
 * Sử dụng PocketBase SDK
 */

import fs from "fs/promises";
import path from "path";
import PocketBase from "pocketbase";

import fsSync from "fs";

function readEnvFile(envPath) {
  try {
    const content = fsSync.readFileSync(envPath, "utf8");
    return Object.fromEntries(
      content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const separator = line.indexOf("=");
          const key = line.slice(0, separator).trim();
          const value = line
            .slice(separator + 1)
            .trim()
            .replace(/^["']|["']$/g, "");
          return [key, value];
        }),
    );
  } catch {
    return {};
  }
}

const DOWNLOAD_DIR = process.env.IMPORT_DIR || "/tmp";
const fileEnv = readEnvFile(".env");
const POCKETBASE_URL =
  process.env.PB_URL ||
  process.env.VITE_PB_URL ||
  fileEnv.PB_URL ||
  fileEnv.VITE_PB_URL ||
  "http://127.0.0.1:8090";

const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || fileEnv.PB_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || fileEnv.PB_ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  throw new Error("Thiếu PB_ADMIN_EMAIL hoặc PB_ADMIN_PASSWORD trong .env");
}

const pb = new PocketBase(POCKETBASE_URL);
pb.autoCancellation(false);

async function authenticateAdmin() {
  console.log("🔐 Đăng nhập admin...");
  await pb.collection("_superusers").authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log("   ✅ Đăng nhập thành công\n");
}

async function createUser(userData) {
  // Tạo user mới, bỏ qua các trường internal
  const payload = {
    username: userData.username,
    email: userData.email || `${userData.username}@temp.local`, // Email bắt buộc
    password: userData.password || "12345678", // Password mặc định
    passwordConfirm: userData.password || "12345678",
    full_name: userData.full_name,
    phone: userData.phone,
    cccd: userData.cccd || "",
    date_of_birth: userData.date_of_birth || "",
    gender: userData.gender || "",
    address: userData.address || "",
    uid: userData.uid,
    employee_code: userData.employee_code || "",
    role: userData.role || "user",
    status: userData.status || "active",
    lcb: userData.lcb || 0,
    chuyen_can: userData.chuyen_can || 0,
    doi_song: userData.doi_song || 0,
    tham_nien: userData.tham_nien || 0,
    attendance_cutoff_day: userData.attendance_cutoff_day || 30,
    default_hc_hours: userData.default_hc_hours || 8,
    default_ot_hours: userData.default_ot_hours || 3,
    bank_name: userData.bank_name || "",
    bank_account_number: userData.bank_account_number || "",
    bank_account_name: userData.bank_account_name || "",
    approvalStatus: userData.approvalStatus || "approved",
  };

  try {
    return await pb.collection("users").create(payload);
  } catch (error) {
    // In chi tiết lỗi
    console.log(`   ⚠️  Lỗi tạo user: ${error.message}`);
    if (error.data) {
      console.log(`   📋 Chi tiết:`, JSON.stringify(error.data, null, 2));
    }

    // Nếu user đã tồn tại, thử update
    console.log(`   🔍 Thử tìm user ${userData.username} để cập nhật...`);

    try {
      // Tìm user theo username
      const existing = await pb
        .collection("users")
        .getFirstListItem(`username='${userData.username}'`);

      console.log(`   ℹ️  Tìm thấy user, đang cập nhật...`);
      // Bỏ password khi update user đã có
      delete payload.password;
      delete payload.passwordConfirm;
      return await pb.collection("users").update(existing.id, payload);
    } catch (findError) {
      console.log(`   ❌ Không tìm thấy user để cập nhật: ${findError.message}`);
      throw error;
    }
  }
}

async function createAttendance(userId, attData) {
  const payload = {
    user: userId,
    date: attData.date,
    hc_hours: attData.hc_hours || 0,
    ot_hours: attData.ot_hours || 0,
    shift: attData.shift || "day",
    is_sunday: attData.is_sunday || false,
    is_holiday: attData.is_holiday || false,
    note: attData.note || "",
  };

  return await pb.collection("attendance").create(payload);
}

async function main() {
  console.log("🚀 Bắt đầu import dữ liệu vào PocketBase\n");

  // Đọc dữ liệu
  console.log("📖 Đọc file JSON...");
  const userCuc = JSON.parse(
    await fs.readFile(path.join(DOWNLOAD_DIR, "userCuc.json"), "utf-8"),
  );
  const userThang = JSON.parse(
    await fs.readFile(path.join(DOWNLOAD_DIR, "userThang.json"), "utf-8"),
  );
  const attenCuc = JSON.parse(
    await fs.readFile(path.join(DOWNLOAD_DIR, "attenCuc.json"), "utf-8"),
  );
  const attenThang = JSON.parse(
    await fs.readFile(path.join(DOWNLOAD_DIR, "attenThang.json"), "utf-8"),
  );

  console.log(
    `   ✅ ${attenCuc.length} bản ghi chấm công của ${userCuc.full_name}`,
  );
  console.log(
    `   ✅ ${attenThang.length} bản ghi chấm công của ${userThang.full_name}\n`,
  );

  // Authenticate
  await authenticateAdmin();

  // Import users
  console.log("👤 Import users...");
  const createdCuc = await createUser(userCuc);
  console.log(`   ✅ ${userCuc.full_name} (${createdCuc.id})`);

  const createdThang = await createUser(userThang);
  console.log(`   ✅ ${userThang.full_name} (${createdThang.id})\n`);

  // Map old ID to new ID
  const userIdMap = {
    [userCuc.id]: createdCuc.id,
    [userThang.id]: createdThang.id,
  };

  // Import attendance
  console.log("📅 Import attendance...");
  let successCount = 0;
  let failCount = 0;

  const allAttendance = [
    ...attenCuc.map((a) => ({ ...a, userName: userCuc.full_name })),
    ...attenThang.map((a) => ({ ...a, userName: userThang.full_name })),
  ];

  for (const att of allAttendance) {
    try {
      const newUserId = userIdMap[att.user];
      if (!newUserId) {
        console.log(`   ⚠️  Không tìm thấy user ID cho: ${att.user}`);
        failCount++;
        continue;
      }

      await createAttendance(newUserId, att);
      successCount++;

      if (successCount % 10 === 0) {
        process.stdout.write(
          `   📊 Đang xử lý: ${successCount}/${allAttendance.length}\r`,
        );
      }
    } catch (error) {
      console.log(
        `\n   ❌ Lỗi: ${att.userName} - ${att.date}: ${error.message}`,
      );
      failCount++;
    }
  }

  console.log(`\n   ✅ Thành công: ${successCount}/${allAttendance.length}`);
  if (failCount > 0) {
    console.log(`   ❌ Thất bại: ${failCount}`);
  }

  console.log("\n✨ Hoàn tất import!");
}

main().catch((error) => {
  console.error("\n❌ Lỗi:", error.message);
  console.error("\n💡 Kiểm tra:");
  console.error("   1. PocketBase đang chạy tại http://127.0.0.1:8090");
  console.error("   2. Đặt biến môi trường: ADMIN_EMAIL và ADMIN_PASSWORD");
  console.error("   3. Admin account có quyền tạo users và attendance");
  process.exit(1);
});
