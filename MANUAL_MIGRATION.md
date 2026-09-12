# PocketBase Manual Migration Guide
## Xóa Staff Collections - Từng Bước Cụ Thể

⚠️ **QUAN TRỌNG**: Backup trước khi làm!
```bash
cp -r pb_data pb_data_backup_$(date +%Y%m%d_%H%M%S)
```

---

## Bước 1: Mở PocketBase Admin UI

1. Truy cập: http://localhost:8090/_/
2. Login với admin account
3. Vào tab **Collections** (bên trái)

---

## Bước 2: Xóa 5 Collections (Từng Cái Một)

Với mỗi collection dưới đây:
- Click vào tên collection
- Click nút **"..."** (3 chấm) ở góc trên bên phải
- Chọn **"Delete"**
- Confirm bằng cách nhập tên collection
- Click **"Delete collection"**

### 2.1. Xóa `staff_action_logs`
- Tìm trong list: **staff_action_logs**
- ... → Delete → Nhập `staff_action_logs` → Delete collection

### 2.2. Xóa `factory_managers`
- Tìm: **factory_managers**
- ... → Delete → Nhập `factory_managers` → Delete collection

### 2.3. Xóa `recruitment_entities`
- Tìm: **recruitment_entities**
- ... → Delete → Nhập `recruitment_entities` → Delete collection

### 2.4. Xóa `salary_holds`
- Tìm: **salary_holds**
- ... → Delete → Nhập `salary_holds` → Delete collection

### 2.5. Xóa `cccd_versions`
- Tìm: **cccd_versions**
- ... → Delete → Nhập `cccd_versions` → Delete collection

✅ **Checkpoint**: Kiểm tra - 5 collections trên không còn trong list

---

## Bước 3: Cập Nhật Collection `users`

### 3.1. Mở users collection
- Click vào **"users"** trong list
- Click **"Edit collection"** (icon bút chì ở góc trên)

### 3.2. Sửa field "role"
- Tìm field: **role** (type: Select)
- Click vào field để edit
- Trong **Values**, xóa dòng `staff`:
  ```
  admin
  user
  ```
  (Chỉ còn 2 dòng)
- Click **"Save"** field
- Click **"Save collection"**

### 3.3. Update existing staff users (quan trọng!)
- Vào tab **Records** của users collection
- Filter: `role = "staff"`
- Với mỗi user có role="staff", có 2 lựa chọn:

**Option A: Chuyển thành user**
- Click vào record
- Đổi role từ "staff" → "user"
- Click Save

**Option B: Xóa user** (cẩn thận!)
- Select records
- Click Delete

💡 **Tip**: Dùng API Console (Settings → API Preview) để update hàng loạt:
```javascript
// Update tất cả staff → user
$app.findRecordsByFilter(
  "users",
  "role = 'staff'"
).forEach(record => {
  record.set("role", "user");
  $app.save(record);
});
```

---

## Bước 4: Cập Nhật Collection `advances`

### 4.1. Mở advances collection
- Click vào **"advances"** trong list
- Click **"Edit collection"**

### 4.2. Sửa field "status"
- Tìm field: **status** (type: Select)
- Click để edit
- Trong **Values**, xóa dòng `recruiter_approved`:
  ```
  pending
  accepted
  rejected
  ```
  (Chỉ còn 3 dòng)
- Click **"Save"** field

### 4.3. Xóa các field không dùng (Optional - khuyến khích)
Xóa những fields này nếu có:
- **recruiter_id** (type: Relation) → Click X → Confirm delete
- **recruiter_staff** (type: Text) → Click X → Confirm delete
- **recruiter_partner** (type: Text) → Click X → Confirm delete
- **recruiter_note** (type: Text) → Click X → Confirm delete

- Click **"Save collection"**

### 4.4. Update existing recruiter_approved advances
Nếu có advances đang ở trạng thái `recruiter_approved`:

**Option 1: Via API Console**
```javascript
// Chuyển tất cả recruiter_approved → pending
$app.findRecordsByFilter(
  "advances",
  "status = 'recruiter_approved'"
).forEach(record => {
  record.set("status", "pending");
  $app.save(record);
});
```

**Option 2: Manual**
- Vào Records tab của advances
- Filter: `status = "recruiter_approved"`
- Update từng record: status → "pending"

---

## Bước 5: Verify Migration

### 5.1. Kiểm tra Collections
Trong Collections list, bạn NÊN thấy:
- ✅ users (role: admin, user)
- ✅ factories
- ✅ employment_histories
- ✅ advances (status: pending, accepted, rejected)
- ✅ complaints
- ✅ news
- ✅ attendance_records
- ✅ check_attendance_batches
- ✅ check_attendance_items
- ✅ check_salary_batches
- ✅ check_salary_items
- ✅ app_settings
- ✅ transport_routes

Bạn KHÔNG NÊN thấy:
- ❌ staff_action_logs
- ❌ factory_managers
- ❌ recruitment_entities
- ❌ salary_holds
- ❌ cccd_versions

### 5.2. Test API
Mở API Preview (Settings → API Preview):

```javascript
// Test 1: Check users roles
$app.findRecordsByFilter("users", "").forEach(u => {
  console.log(u.getString("email"), u.getString("role"));
});
// Should only see: admin, user (no staff)

// Test 2: Check advances statuses
$app.findRecordsByFilter("advances", "").forEach(a => {
  console.log(a.getString("id"), a.getString("status"));
});
// Should only see: pending, accepted, rejected
```

---

## Bước 6: Restart PocketBase (Optional)

Để chắc chắn schema được reload:

```bash
# Stop PocketBase (Ctrl+C)
# Start lại
./pocketbase serve
```

---

## Troubleshooting

### Lỗi: "Cannot delete collection - has relations"
- Có collection khác đang reference collection này
- Xóa relations trước, hoặc xóa theo thứ tự ngược lại

### Lỗi: "Cannot change role - existing records"
- Có users đang có role="staff"
- Update users đó trước (Bước 3.3)

### Lỗi: "Cannot change status values - existing records"
- Có advances đang có status="recruiter_approved"
- Update advances đó trước (Bước 4.4)

---

## Rollback (Nếu Có Vấn Đề)

```bash
# 1. Stop PocketBase
# 2. Restore backup
rm -rf pb_data
cp -r pb_data_backup pb_data

# 3. Restart PocketBase
./pocketbase serve
```

---

## Thời Gian Ước Tính

- Backup: 1 phút
- Xóa collections: 5 phút (1 phút/collection)
- Update users: 2-5 phút
- Update advances: 2-5 phút
- Verify: 2 phút

**Tổng: 15-20 phút**

---

## Checklist

- [ ] Đã backup pb_data
- [ ] Xóa staff_action_logs
- [ ] Xóa factory_managers
- [ ] Xóa recruitment_entities
- [ ] Xóa salary_holds
- [ ] Xóa cccd_versions
- [ ] Cập nhật users.role (chỉ admin/user)
- [ ] Cập nhật users có role=staff
- [ ] Cập nhật advances.status (bỏ recruiter_approved)
- [ ] Xóa advances fields không dùng (optional)
- [ ] Cập nhật advances có status=recruiter_approved
- [ ] Verify: 13 collections còn lại
- [ ] Verify: Không có staff users
- [ ] Verify: Không có recruiter_approved advances
- [ ] Test app: User flow
- [ ] Test app: Admin flow

---

**Hoàn tất!** ✅

Sau khi xong, test app:
1. Login as user → Request advance → Thấy "Chờ admin duyệt"
2. Login as admin → View advances → Approve/reject trực tiếp
