# Hướng dẫn Testing Tính năng Leaderboard

## ✅ Các vấn đề đã sửa

### 1. Route Guard cho Admin
**Vấn đề**: File `src/routes/_authenticated/admin/leaderboard.tsx` thiếu `beforeLoad` check admin role.

**Đã sửa**: Thêm beforeLoad với redirect nếu không phải admin:
```typescript
beforeLoad: () => {
  const currentUser = pb.authStore.record as UserRecord | null;
  if (typeof window !== "undefined" && currentUser?.role !== "admin") {
    throw redirect({ to: "/" });
  }
}
```

### 2. Expose PocketBase cho Dev Testing
**Vấn đề**: Không thể test security từ browser console vì biến `pb` không accessible.

**Đã sửa**: Thêm vào `src/lib/pocketbase.ts`:
```typescript
// Expose pb to window for dev testing
if (import.meta.env.DEV) {
  (window as any).pb = pb;
  (window as any).getCurrentUser = () => pb.authStore.record;
}
```

---

## 📋 Checklist Deploy & Testing

### Bước 1: Backup & Migration
```bash
# 1. Backup database trước khi migrate
cp pb_data/data.db pb_backups/backup_before_leaderboard_$(date +%Y%m%d_%H%M%S).db

# 2. Copy PocketBase hook
cp docs/pocketbase/pb_hooks/leaderboard_api.pb.js pb_hooks/

# 3. Start PocketBase (migration tự động chạy)
./pocketbase serve

# 4. Verify collections được tạo
curl http://localhost:8090/api/collections
```

### Bước 2: Verify Schema
Kiểm tra 3 collections mới và fields trong users:

```bash
# Check users có employee_code, is_internal
curl http://localhost:8090/api/collections/users/records?perPage=1

# Check internal_staff_hours
curl http://localhost:8090/api/collections/internal_staff_hours/records

# Check leaderboard_settings
curl http://localhost:8090/api/collections/leaderboard_settings/records

# Check import history
curl http://localhost:8090/api/collections/staff_hours_import_history/records
```

### Bước 3: Test Security (CRITICAL)

#### 3.1 Test từ Browser Console
```bash
# 1. Start dev server
npm run dev

# 2. Mở http://localhost:3000 và đăng nhập với user THƯỜNG (không phải admin)

# 3. Mở DevTools Console (F12), chạy các lệnh sau:
```

**Test 1: Verify pb accessible**
```javascript
// Check pb đã được expose
console.log(window.pb); // Should print PocketBase instance

// Check current user
console.log(window.getCurrentUser()); // Should print user object
```

**Test 2: User không thể self-update is_internal**
```javascript
const userId = window.getCurrentUser().id;

// Thử update is_internal
const result = await window.pb.collection('users').update(userId, {
  is_internal: true
});

// Check kết quả - Hook phải revert về giá trị cũ
console.log('is_internal:', result.is_internal); 
// Expected: false (không đổi) hoặc hook báo lỗi
```

**Test 3: User không thể self-update employee_code**
```javascript
const userId = window.getCurrentUser().id;

// Thử update employee_code
const result = await window.pb.collection('users').update(userId, {
  employee_code: 'FAKE001'
});

// Check kết quả
console.log('employee_code:', result.employee_code);
// Expected: null/undefined (không đổi) hoặc hook báo lỗi
```

**Test 4: User chỉ xem được data của mình**
```javascript
// Thử fetch tất cả internal_staff_hours
const allHours = await window.pb.collection('internal_staff_hours').getFullList();

console.log('Records fetched:', allHours.length);
console.log('All belong to current user?', allHours.every(r => r.user === window.getCurrentUser().id));
// Expected: true (chỉ thấy records của mình)
```

#### 3.2 Test Admin Access
```bash
# 1. Đăng xuất user thường
# 2. Đăng nhập với admin account
# 3. Thử truy cập /admin/leaderboard
```

**Expected**: Admin vào được trang và thấy 4 tabs.

#### 3.3 Test Non-Admin Blocked
```bash
# 1. Đăng nhập với user thường (không phải admin)
# 2. Thử truy cập trực tiếp: http://localhost:3000/admin/leaderboard
```

**Expected**: Tự động redirect về trang chủ (/).

#### 3.4 Test Internal Staff Access
```bash
# 1. Admin set is_internal = true cho 1 user
# 2. Đăng nhập với user đó
# 3. Check Trophy icon hiển thị trong navigation
# 4. Click vào Trophy → vào /leaderboard
```

**Expected**: 
- Trophy icon hiển thị
- Vào được trang /leaderboard
- Thấy leaderboard data

#### 3.5 Test Non-Internal Blocked
```bash
# 1. Đăng nhập với user có is_internal = false
# 2. Thử truy cập trực tiếp: http://localhost:3000/leaderboard
```

**Expected**: Redirect về trang chủ (/).

---

### Bước 4: Test Import Workflow

#### 4.1 Prepare Test Data
1. Vào `/admin/leaderboard` tab "Quản lý NV"
2. Tạo 3 test users với `is_internal = true` và gán `employee_code`:
   - User 1: NV001
   - User 2: NV002
   - User 3: NV003

#### 4.2 Download & Fill Template
1. Vào tab "Import"
2. Click "Tải template mẫu"
3. Fill Excel file:
   ```
   | employee_code | hc_hours | tc_hours |
   |---------------|----------|----------|
   | NV001         | 160      | 20       |
   | NV002         | 150      | 30       |
   | NV003         | 140      | 10       |
   | INVALID999    | 100      | 0        |
   ```

#### 4.3 Test Preview
1. Upload file
2. Check preview shows:
   - ✅ 3 success rows (NV001, NV002, NV003)
   - ❌ 1 error row (INVALID999 - không tìm thấy user)
3. **KHÔNG** click "Xác nhận" yet

#### 4.4 Test Import Execute
1. Click "Xác nhận import"
2. Wait for completion
3. Verify:
   - Toast notification "Import thành công: 3 records"
   - Import history shows: success_count = 3, error_count = 1
   - Tab "Xếp hạng" shows 3 users

#### 4.5 Test Upsert (Import lặp lại)
1. Modify Excel file:
   ```
   | employee_code | hc_hours | tc_hours |
   |---------------|----------|----------|
   | NV001         | 170      | 25       |  <- Tăng giờ
   | NV002         | 150      | 30       |  <- Giữ nguyên
   ```
2. Upload & import lại
3. Verify:
   - NV001 total_hours = 195 (updated, không duplicate)
   - NV002 total_hours = 180 (không đổi)
   - NV003 vẫn còn data cũ (140 + 10 = 150)

#### 4.6 Test Rollback
1. Stop PocketBase mid-import (hoặc dùng file Excel có lỗi SQL)
2. Verify batch_id bị rollback
3. Check import history status = "failed" hoặc "rolled_back"

---

### Bước 5: Test UI/UX

#### 5.1 Leaderboard Display
1. Vào `/admin/leaderboard` tab "Xếp hạng"
2. Verify:
   - ✅ Podium: Rank 1 ở giữa (cao nhất), Rank 2 bên PHẢI, Rank 3 bên TRÁI
   - ✅ Table: Rank 4+ displayed
   - ✅ Search by employee code works
   - ✅ Month selector changes data
   - ✅ Toggle source (admin_upload / self_checkin) switches data

#### 5.2 Responsive Mobile
1. Resize browser to < 768px
2. Verify:
   - Podium stacks vertically
   - Table becomes card layout
   - Tab labels hide on mobile (chỉ icon)

#### 5.3 User Ranking Card (Sticky)
1. Login as internal staff user
2. Vào `/leaderboard`
3. Scroll down
4. Verify sticky card shows:
   - **In top N**: Shows rank badge + position
   - **Ngoài top N**: Shows "Vô hạng"
   - **Chưa có data**: Shows "Chưa có dữ liệu"

#### 5.4 Navigation Icon
1. Login as internal staff
2. Check BottomNav (mobile) or AppHeader
3. Verify Trophy icon visible và clickable
4. Login as non-internal user
5. Verify Trophy icon KHÔNG hiển thị

---

### Bước 6: Test Edge Cases

#### 6.1 Tie Ranks
Import data với cùng total_hours:
```
| employee_code | hc_hours | tc_hours |
|---------------|----------|----------|
| NV001         | 160      | 20       |  <- total = 180
| NV002         | 150      | 30       |  <- total = 180 (tie)
| NV003         | 140      | 40       |  <- total = 180 (tie)
```

**Expected**: Tie-breaking theo thứ tự:
1. total_hours DESC (same = 180)
2. hc_hours DESC → NV001 rank 1, NV002 rank 2, NV003 rank 3

#### 6.2 Empty State
1. Select month chưa có data
2. Verify: "Chưa có dữ liệu tháng này"

#### 6.3 Large Dataset (Performance)
1. Import 100+ rows
2. Check query time < 500ms
3. Verify pagination works

#### 6.4 Duplicate Employee Code
1. Admin thử gán employee_code đã tồn tại cho user khác
2. **Expected**: Validation error "Mã nhân viên đã tồn tại"

---

## 🚨 Known Issues & Limitations

### 1. Self-Checkin Aggregation
**Status**: Logic đã viết nhưng CHƯA TEST với LocalStorage format thật.

**File**: `src/lib/leaderboard.ts` → `aggregateHoursFromSelfCheckin()`

**Action Required**: Kiểm tra key và structure LocalStorage của hệ thống chấm công hiện tại có khớp với logic trong hàm không.

### 2. PocketBase Hook Placement
**Critical**: Hook chỉ chạy khi file nằm trong `pb_hooks/` (root level, ngang với binary `./pocketbase`).

**Verify**: 
```bash
ls -la pb_hooks/leaderboard_api.pb.js
# Phải tồn tại tại đây, KHÔNG phải docs/pocketbase/pb_hooks/
```

### 3. Transaction Timeout
**Risk**: Import batch lớn (100+ rows) có thể timeout.

**Mitigation**: Test với file 50-100 rows trước khi production.

### 4. Realtime Updates
**Current**: Manual refresh (user phải reload page).

**Future**: Implement PocketBase realtime subscriptions.

---

## 📊 Success Criteria Final Check

- [ ] Migration ran successfully, 3 collections created
- [ ] PocketBase hook active (check pb_hooks/ directory)
- [ ] Admin vào được /admin/leaderboard với 4 tabs
- [ ] User thường KHÔNG vào được admin route
- [ ] Internal staff vào được /leaderboard, thấy Trophy icon
- [ ] Non-internal staff KHÔNG vào được user leaderboard
- [ ] Security test: User không self-update is_internal/employee_code
- [ ] Security test: User chỉ fetch được own data
- [ ] Import Excel: Preview → Confirm workflow works
- [ ] Import lặp lại: Upsert đúng (không duplicate)
- [ ] Podium layout: 1 giữa, 2 phải, 3 trái
- [ ] Tie-breaking: Ranks phân biệt theo hc_hours
- [ ] Search by employee code works
- [ ] Export to Excel works
- [ ] Mobile responsive: Podium stacks, table → cards
- [ ] Sticky user card: 3 states (rank / unranked / no data)

---

## 🛠️ Troubleshooting

### Issue: Route 404 / Trắng trang
**Cause**: Route tree chưa được regenerate.

**Fix**: 
```bash
npm run dev
# TanStack Router tự động regenerate route tree
```

### Issue: Hook không chạy
**Cause**: File không nằm đúng thư mục.

**Fix**:
```bash
# Ensure hook ở đúng vị trí
cp docs/pocketbase/pb_hooks/leaderboard_api.pb.js pb_hooks/

# Restart PocketBase
./pocketbase serve
```

### Issue: pb is not defined trong console
**Cause**: Dev server chưa được khởi động lại sau khi sửa pocketbase.ts.

**Fix**:
```bash
# Stop dev server (Ctrl+C)
npm run dev
# Refresh browser
```

### Issue: Migration không chạy
**Cause**: PocketBase không tự động detect migration file.

**Fix**:
```bash
# Run migration manually
./pocketbase migrate up
```

---

## 📞 Support

Nếu gặp vấn đề không nằm trong guide này, check:
1. PocketBase logs: `pb_data/logs/`
2. Browser console errors (F12)
3. Network tab (F12) để xem API responses
4. File `docs/leaderboard-implementation-summary.md` cho chi tiết implementation
