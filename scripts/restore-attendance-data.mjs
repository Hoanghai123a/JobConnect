#!/usr/bin/env node
import PocketBase from "pocketbase";
import fs from "fs";

async function connectPocketBase() {
  const baseUrl = process.env.PB_URL || process.env.VITE_PB_URL || "http://127.0.0.1:8090";
  const token = process.env.PB_ADMIN_TOKEN;
  const identity = process.env.PB_ADMIN_EMAIL;
  const password = process.env.PB_ADMIN_PASSWORD;

  if (!token && (!identity || !password)) {
    throw new Error("Thiếu PB_ADMIN_TOKEN hoặc PB_ADMIN_EMAIL/PB_ADMIN_PASSWORD");
  }

  const pb = new PocketBase(baseUrl);
  pb.autoCancellation(false);

  if (token) {
    pb.authStore.save(token, null);
  } else {
    await pb
      .collection("_superusers")
      .authWithPassword(identity, password)
      .catch(() => pb.admins.authWithPassword(identity, password));
  }

  console.log(`✅ Đã kết nối PocketBase: ${baseUrl}`);
  return pb;
}

async function restoreAttendanceRecords(pb, data) {
  console.log(`\n📊 Đang restore ${data.length} attendance records...`);

  let restored = 0;
  let skipped = 0;
  let errors = 0;

  for (const record of data) {
    try {
      // Check if record exists
      const existing = await pb.collection("attendance_records").getList(1, 1, {
        filter: `user="${record.user}" && date="${record.date}"`,
      });

      if (existing.items.length > 0) {
        console.log(`  ⏭️  Skip existing: ${record.date} - User ${record.user}`);
        skipped++;
        continue;
      }

      // Create new record (exclude id, created, updated)
      const { id, created, updated, collectionId, collectionName, expand, ...cleanData } = record;
      await pb.collection("attendance_records").create(cleanData);

      restored++;
      if (restored % 50 === 0) {
        console.log(`  → Restored ${restored}/${data.length}`);
      }
    } catch (error) {
      console.error(`  ❌ Error: ${record.date} - ${error.message}`);
      errors++;
    }
  }

  console.log(`\n✅ Kết quả:`);
  console.log(`  - Restored: ${restored}`);
  console.log(`  - Skipped (đã tồn tại): ${skipped}`);
  console.log(`  - Errors: ${errors}`);
}

async function main() {
  const backupFile = process.argv[2];

  if (!backupFile) {
    console.error("❌ Usage: node restore-attendance-data.mjs <backup-file.json>");
    process.exit(1);
  }

  if (!fs.existsSync(backupFile)) {
    console.error(`❌ File không tồn tại: ${backupFile}`);
    process.exit(1);
  }

  try {
    console.log("🚀 Bắt đầu restore attendance_records...\n");
    console.log(`📁 Backup file: ${backupFile}`);

    const data = JSON.parse(fs.readFileSync(backupFile, "utf8"));
    console.log(`📊 Số records trong backup: ${data.length}`);

    const pb = await connectPocketBase();
    await restoreAttendanceRecords(pb, data);

    console.log("\n✅ HOÀN TẤT RESTORE!\n");
  } catch (error) {
    console.error("\n❌ Lỗi:", error.message);
    process.exit(1);
  }
}

main();
