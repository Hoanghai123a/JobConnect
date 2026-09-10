# Hướng dẫn Backup & Xóa Dữ liệu

## ⚠️ QUAN TRỌNG

Hướng dẫn này sẽ:
1. ✅ **BACKUP** dữ liệu tự chấm công của NLĐ (`attendance_records`)
2. ✅ **GIỮ LẠI** thông tin tài khoản `users` (chỉ update role)
3. ❌ **XÓA HẾT** các collections Staff và dữ liệu liên quan

---

## Bước 1: Backup Dữ liệu Attendance (BẮT BUỘC)

### 1.1. Kiểm tra PocketBase credentials

File `.env` đã có sẵn thông tin kết nối:
- `PB_URL=http://127.0.0.1:8090`
- `PB_ADMIN_EMAIL=admin@ccc.com`
- `PB_ADMIN_PASSWORD=...`

Script sẽ tự động đọc từ `.env`, không cần cấu hình thêm.

### 1.2. Chạy script backup

```bash
node scripts/backup-attendance-data.mjs
```

### 1.3. Verify backup

Script sẽ tạo file trong folder `pb_backups/`:
- `attendance_records_backup_YYYY-MM-DD-HHmmss.json`

**Kiểm tra file**:
- Mở file JSON
- Xem có đủ số bản ghi không
- **Lưu file này ra USB/cloud/email để an toàn**

---

## Bước 2: Backup toàn bộ PocketBase (khuyến nghị)

### Windows PowerShell:
```powershell
Copy-Item -Recurse pb_data "pb_data_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
```

### Bash/Git Bash:
```bash
cp -r pb_data "pb_data_backup_$(date +%Y%m%d_%H%M%S)"
```

**Verify**:
```bash
ls pb_data_backup_*
```

---

## Bước 3: Xóa Collections qua Admin UI

### 3.1. Mở PocketBase Admin
- Truy cập: http://localhost:8090/_/
- Login với admin account
- Vào tab **Collections**

### 3.2. Xóa 5 collections Staff (BẮT BUỘC)

Với mỗi collection, click "..." → Delete → nhập tên → Delete:

1. ❌ `staff_action_logs`
2. ❌ `factory_managers`
3. ❌ `recruitment_entities`
4. ❌ `salary_holds`
5. ❌ `cccd_versions`

### 3.3. (Tùy chọn) Xóa thêm collections

**Nếu không cần tra công/lương từ nhà máy nữa**:
- ❌ `check_attendance_batches`
- ❌ `check_attendance_items`
- ❌ `check_salary_batches`
- ❌ `check_salary_items`

**Nếu không cần lịch sử employment** (code đã stub):
- ❌ `employment_histories`

### 3.4. Collections GIỮ LẠI

**PHẢI giữ** những collections này:
- ✅ `attendance_records` (dữ liệu tự chấm công - ĐÃ BACKUP)
- ✅ `users` (tài khoản - sẽ update role ở bước sau)
- ✅ `advances` (ứng lương)
- ✅ `complaints` (khiếu nại)
- ✅ `news` (tin tức)
- ✅ `factories` (danh sách nhà máy)
- ✅ `transport_routes` (xe đưa đón)
- ✅ `app_settings` (cài đặt hệ thống)

---

## Bước 4: Update Users Collection

### 4.1. Mở collection `users`
- Click vào **users** trong Collections
- Click **Edit collection**

### 4.2. Sửa field "role"
- Tìm field: **role** (type: Select)
- Click vào field để edit
- Trong **Values**, xóa dòng `staff`, chỉ giữ:
  ```
  admin
  user
  ```
- Click **Save** field
- Click **Save collection**

### 4.3. Update existing staff users

**Cách 1: API Console** (Settings → API Preview):
```javascript
// Chuyển tất cả staff → user
$app.findRecordsByFilter('users', "role = 'staff'").forEach(record => {
  record.set('role', 'user');
  $app.save(record);
});
```

**Cách 2: Manual** (Records tab):
- Filter: `role = "staff"`
- Với mỗi user:
  - Option A: Edit → Đổi role → "user" → Save
  - Option B: Xóa user (cẩn thận!)

---

## Bước 5: Update Advances Collection

### 5.1. Mở collection `advances`
- Click vào **advances**
- Click **Edit collection**

### 5.2. Sửa field "status"
- Tìm field: **status** (type: Select)
- Click để edit
- Xóa value `recruiter_approved`, chỉ giữ:
  ```
  pending
  accepted
  rejected
  ```
- Click **Save** field
- Click **Save collection**

### 5.3. Update existing advances với status recruiter_approved

**API Console** (Settings → API Preview):
```javascript
// Chuyển recruiter_approved → pending
$app.findRecordsByFilter('advances', "status = 'recruiter_approved'").forEach(record => {
  record.set('status', 'pending');
  $app.save(record);
});
```

### 5.4. (Tùy chọn) Xóa fields không dùng

Trong advances collection, có thể xóa những fields này:
- `recruiter_id` (type: Relation)
- `recruiter_staff` (type: Text)
- `recruiter_partner` (type: Text)
- `recruiter_note` (type: Text)

Click X bên cạnh mỗi field → Confirm delete

---

## Bước 6: Verify Migration

### 6.1. Check collections còn lại

Trong Collections tab, **PHẢI thấy**:
- ✅ users (role: admin, user)
- ✅ attendance_records
- ✅ advances
- ✅ complaints
- ✅ news
- ✅ factories
- ✅ transport_routes
- ✅ app_settings

**KHÔNG thấy**:
- ❌ staff_action_logs
- ❌ factory_managers
- ❌ recruitment_entities
- ❌ salary_holds
- ❌ cccd_versions

### 6.2. Test API Console

Settings → API Preview, chạy:

```javascript
// Test 1: Check users roles
$app.findRecordsByFilter('users', '').forEach(u => {
  console.log(u.getString('email'), u.getString('role'));
});
// Chỉ thấy: admin, user (không có staff)

// Test 2: Count attendance records
const count = $app.findRecordsByFilter('attendance_records', '').length;
console.log(`Total attendance: ${count}`);
// So sánh với số bản ghi trong backup JSON
```

---

## Bước 7: Restart & Test App

```bash
npm run dev
```

### Test User Flow:
1. Login as User
2. Vào trang **Attendance** → Thấy dữ liệu cũ (đã backup)
3. Thêm chấm công mới → OK
4. Request advance → Goes to Admin (không qua Staff)

### Test Admin Flow:
1. Login as Admin
2. Vào **Attendance** → Thấy tất cả user
3. Export Excel → OK
4. Approve/reject advances → OK

---

## Rollback (nếu có vấn đề)

```bash
# 1. Stop app (Ctrl+C)

# 2. Restore PocketBase
rm -rf pb_data
cp -r pb_data_backup pb_data

# 3. Restart
npm run dev
```

---

## Restore Attendance từ backup JSON (nếu cần)

Nếu sau khi xóa mới phát hiện cần khôi phục attendance:

```bash
node scripts/restore-attendance-data.mjs pb_backups/attendance_records_backup_YYYY-MM-DD-HHmmss.json
```

---

## Checklist

### Pre-Migration:
- [ ] ✅ Đã backup `attendance_records` (JSON file)
- [ ] ✅ Đã backup `pb_data` folder
- [ ] ✅ Đã lưu backup ra nơi an toàn (USB/cloud)

### Xóa Collections:
- [ ] ❌ Xóa `staff_action_logs`
- [ ] ❌ Xóa `factory_managers`
- [ ] ❌ Xóa `recruitment_entities`
- [ ] ❌ Xóa `salary_holds`
- [ ] ❌ Xóa `cccd_versions`
- [ ] (Tùy chọn) Xóa `check_attendance_batches` + `check_attendance_items`
- [ ] (Tùy chọn) Xóa `check_salary_batches` + `check_salary_items`
- [ ] (Tùy chọn) Xóa `employment_histories`

### Update Collections:
- [ ] ✅ Update `users.role` (chỉ admin/user)
- [ ] ✅ Update staff users → user hoặc xóa
- [ ] ✅ Update `advances.status` (bỏ recruiter_approved)
- [ ] ✅ Update advances có status=recruiter_approved → pending
- [ ] (Tùy chọn) Xóa advances fields không dùng

### Verify:
- [ ] ✅ Verify collections còn lại (13 collections)
- [ ] ✅ Verify không có staff users
- [ ] ✅ Verify không có recruiter_approved advances
- [ ] ✅ Test app: User flow
- [ ] ✅ Test app: Admin flow
- [ ] ✅ Verify attendance data vẫn còn

---

## Thời gian ước tính

- Backup: 2-3 phút
- Xóa collections: 5-10 phút
- Update users: 2-5 phút
- Update advances: 2-5 phút
- Verify & test: 5 phút

**Tổng: 20-30 phút**

---

## Rủi ro & An toàn

✅ **Thấp** - Đã backup đầy đủ:
- Attendance data → JSON file
- Toàn bộ PocketBase → pb_data backup folder
- Có thể rollback bất cứ lúc nào

⚠️ **Lưu ý**:
- Xóa collections = mất data vĩnh viễn (trừ khi restore từ backup)
- Staff users sẽ mất quyền truy cập (cần chuyển sang User)
- Advances đang chờ Staff approval sẽ chuyển về Pending

---

**Hoàn tất!** ✅

Sau khi xong, app sẽ hoạt động với workflow đơn giản hơn:
- User → Request advance → Admin duyệt trực tiếp
- Không còn vai trò Staff
- Dữ liệu chấm công được bảo toàn
