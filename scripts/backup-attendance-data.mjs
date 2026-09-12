#!/usr/bin/env node
import PocketBase from "pocketbase";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ⚠️ ĐIỀN THÔNG TIN POCKETBASE VÀO ĐÂY
const PB_CONFIG = {
  url: "http://127.0.0.1:8090",
  email: "admin@ccc.com",
  password: "Hoanghai12!",
};

async function connectPocketBase() {
  const pb = new PocketBase(PB_CONFIG.url);
  pb.autoCancellation(false);

  await pb
    .collection("_superusers")
    .authWithPassword(PB_CONFIG.email, PB_CONFIG.password)
    .catch(() => pb.admins.authWithPassword(PB_CONFIG.email, PB_CONFIG.password));

  console.log(`✅ Đã kết nối PocketBase: ${PB_CONFIG.url}`);
  return pb;
}

async function backupCollection(pb, collectionName) {
  console.log(`\n📊 Đang backup ${collectionName}...`);

  let page = 1;
  const perPage = 500;
  let allRecords = [];

  while (true) {
    const result = await pb.collection(collectionName).getList(page, perPage, {
      sort: "date",
      expand: "user",
    });

    allRecords = allRecords.concat(result.items);
    console.log(`  → Page ${page}/${result.totalPages}: ${result.items.length} records`);

    if (page >= result.totalPages) break;
    page++;
  }

  console.log(`✅ Tổng cộng: ${allRecords.length} bản ghi ${collectionName}`);
  return allRecords;
}

async function saveBackup(data, filename) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
  const backupDir = path.join(process.cwd(), "pb_backups");

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const filepath = path.join(backupDir, `${filename}_${timestamp}.json`);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), "utf8");

  console.log(`\n💾 Đã lưu backup: ${filepath}`);
  console.log(`   Kích thước: ${(fs.statSync(filepath).size / 1024).toFixed(2)} KB`);

  return filepath;
}

async function main() {
  try {
    console.log("🚀 Bắt đầu backup dữ liệu chấm công...\n");

    const pb = await connectPocketBase();

    // Backup attendance collection
    const attendanceData = await backupCollection(pb, "attendance");
    const attendancePath = await saveBackup(attendanceData, "attendance_backup");

    // Thống kê
    const userIds = new Set(attendanceData.map((r) => r.user));
    const dates = attendanceData.map((r) => r.date);
    const minDate = dates.length > 0 ? dates.reduce((a, b) => (a < b ? a : b)) : "N/A";
    const maxDate = dates.length > 0 ? dates.reduce((a, b) => (a > b ? a : b)) : "N/A";

    console.log("\n📈 Thống kê Attendance:");
    console.log(`  - Tổng số bản ghi: ${attendanceData.length}`);
    console.log(`  - Số user: ${userIds.size}`);
    console.log(`  - Từ ngày: ${minDate}`);
    console.log(`  - Đến ngày: ${maxDate}`);

    console.log("\n✅ HOÀN TẤT BACKUP!");
    console.log(`\n💡 File backup:`);
    console.log(`   - ${attendancePath}`);
    console.log("\n⚠️  Hãy sao lưu file này ra nơi an toàn trước khi xóa database.\n");
  } catch (error) {
    console.error("\n❌ Lỗi:", error.message);
    process.exit(1);
  }
}

main();
