#!/usr/bin/env node
/**
 * Script chuyển đổi dữ liệu JSON (users + attendance) sang file Excel
 * để import vào JobConnect qua tính năng Bulk Import
 */

import fs from 'fs/promises';
import path from 'path';
import ExcelJS from 'exceljs';

const DOWNLOAD_DIR = 'D:\\Download';

async function main() {
  // Đọc dữ liệu từ các file JSON
  console.log('📖 Đọc dữ liệu từ các file JSON...');

  const userCuc = JSON.parse(
    await fs.readFile(path.join(DOWNLOAD_DIR, 'userCuc.json'), 'utf-8')
  );
  const userThang = JSON.parse(
    await fs.readFile(path.join(DOWNLOAD_DIR, 'userThang.json'), 'utf-8')
  );
  const attenCuc = JSON.parse(
    await fs.readFile(path.join(DOWNLOAD_DIR, 'attenCuc.json'), 'utf-8')
  );
  const attenThang = JSON.parse(
    await fs.readFile(path.join(DOWNLOAD_DIR, 'attenThang.json'), 'utf-8')
  );

  console.log(`✅ Đã tải: ${attenCuc.length} bản ghi chấm công của Cúc`);
  console.log(`✅ Đã tải: ${attenThang.length} bản ghi chấm công của Thắng`);

  // Tạo workbook
  const workbook = new ExcelJS.Workbook();

  // Sheet 1: Người lao động
  const userSheet = workbook.addWorksheet('Người lao động');
  userSheet.columns = [
    { header: 'Mã NLĐ', key: 'uid', width: 15 },
    { header: 'Họ và tên', key: 'full_name', width: 25 },
    { header: 'SĐT', key: 'phone', width: 15 },
    { header: 'CCCD', key: 'cccd', width: 15 },
    { header: 'Ngày sinh', key: 'date_of_birth', width: 12 },
    { header: 'Giới tính', key: 'gender', width: 10 },
    { header: 'Địa chỉ', key: 'address', width: 30 },
    { header: 'Lương CB', key: 'lcb', width: 12 },
    { header: 'Chuyên cần', key: 'chuyen_can', width: 12 },
    { header: 'Đời sống', key: 'doi_song', width: 12 },
    { header: 'Thâm niên', key: 'tham_nien', width: 10 },
    { header: 'Ngày chốt công', key: 'attendance_cutoff_day', width: 15 },
    { header: 'Tên ngân hàng', key: 'bank_name', width: 20 },
    { header: 'STK', key: 'bank_account_number', width: 20 },
    { header: 'Tên tài khoản', key: 'bank_account_name', width: 25 },
  ];

  // Thêm dữ liệu user
  [userCuc, userThang].forEach(user => {
    userSheet.addRow({
      uid: user.uid,
      full_name: user.full_name,
      phone: user.phone,
      cccd: user.cccd || '',
      date_of_birth: user.date_of_birth || '',
      gender: user.gender || '',
      address: user.address || '',
      lcb: user.lcb,
      chuyen_can: user.chuyen_can,
      doi_song: user.doi_song,
      tham_nien: user.tham_nien,
      attendance_cutoff_day: user.attendance_cutoff_day,
      bank_name: user.bank_name || '',
      bank_account_number: user.bank_account_number || '',
      bank_account_name: user.bank_account_name || '',
    });
  });

  // Sheet 2: Lịch sử đi làm
  const historySheet = workbook.addWorksheet('Lịch sử đi làm');
  historySheet.columns = [
    { header: 'Mã NLĐ', key: 'worker_uid', width: 15 },
    { header: 'Ngày làm việc', key: 'date', width: 12 },
    { header: 'Giờ HC', key: 'hc_hours', width: 10 },
    { header: 'Giờ TC', key: 'ot_hours', width: 10 },
    { header: 'Ca', key: 'shift', width: 10 },
    { header: 'Chủ nhật', key: 'is_sunday', width: 10 },
    { header: 'Ngày lễ', key: 'is_holiday', width: 10 },
    { header: 'Ghi chú', key: 'note', width: 30 },
  ];

  // Map user ID sang UID để liên kết
  const userIdToUid = {
    [userCuc.id]: userCuc.uid,
    [userThang.id]: userThang.uid,
  };

  // Thêm dữ liệu attendance
  const allAttendance = [
    ...attenCuc.map(a => ({ ...a, workerUid: userIdToUid[a.user] })),
    ...attenThang.map(a => ({ ...a, workerUid: userIdToUid[a.user] })),
  ];

  // Sắp xếp theo worker và date
  allAttendance.sort((a, b) => {
    if (a.workerUid !== b.workerUid) {
      return a.workerUid.localeCompare(b.workerUid);
    }
    return new Date(a.date) - new Date(b.date);
  });

  allAttendance.forEach(att => {
    // Chuyển đổi date từ ISO sang dd/MM/yyyy
    const date = new Date(att.date);
    const dateStr = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;

    historySheet.addRow({
      worker_uid: att.workerUid,
      date: dateStr,
      hc_hours: att.hc_hours,
      ot_hours: att.ot_hours,
      shift: att.shift === 'day' ? 'Ngày' : 'Đêm',
      is_sunday: att.is_sunday ? 'x' : '',
      is_holiday: att.is_holiday ? 'x' : '',
      note: att.note || '',
    });
  });

  // Lưu file
  const outputPath = path.join(DOWNLOAD_DIR, 'JobConnect_Import.xlsx');
  await workbook.xlsx.writeFile(outputPath);

  console.log(`\n✅ Đã tạo file Excel: ${outputPath}`);
  console.log(`\n📊 Thống kê:`);
  console.log(`   - Số NLĐ: 2`);
  console.log(`   - Số bản ghi chấm công: ${allAttendance.length}`);
  console.log(`   - Bản ghi của ${userCuc.full_name}: ${attenCuc.length}`);
  console.log(`   - Bản ghi của ${userThang.full_name}: ${attenThang.length}`);
  console.log(`\n🎯 Bước tiếp theo:`);
  console.log(`   1. Mở file ${outputPath}`);
  console.log(`   2. Kiểm tra và điều chỉnh dữ liệu nếu cần`);
  console.log(`   3. Vào /admin/imports trong JobConnect`);
  console.log(`   4. Chọn "Tạo hàng loạt NLĐ và lịch sử đi làm"`);
  console.log(`   5. Upload file Excel này`);
}

main().catch(console.error);
