# Quick Start - Deploy Leaderboard trong 5 phút

## 1. Backup & Deploy (2 phút)

```bash
# Backup database
cp pb_data/data.db pb_backups/backup_$(date +%Y%m%d_%H%M%S).db

# Copy hook vào PocketBase
cp docs/pocketbase/pb_hooks/leaderboard_api.pb.js pb_hooks/

# Start PocketBase (migration tự động chạy)
./pocketbase serve

# Start dev server (tab mới)
npm run dev
```

## 2. Verify Deploy (1 phút)

Mở browser console (F12) và test:

```javascript
// Check pb đã expose
console.log(window.pb); // ✅ Should show PocketBase instance

// Check collections mới
const settings = await pb.collection('leaderboard_settings').getFullList();
console.log('Settings:', settings); // ✅ Should have 1 default record
```

## 3. Setup Data (2 phút)

### Admin: Tạo test users
1. Vào `/admin/leaderboard` → Tab "Quản lý NV"
2. Search user → Click "Đặt làm NV nội bộ" → Gán mã NV (VD: NV001)
3. Lặp lại cho 2-3 users

### Admin: Import giờ làm
1. Tab "Import" → "Tải template mẫu"
2. Fill Excel:
   ```
   employee_code | hc_hours | tc_hours
   NV001        | 160      | 20
   NV002        | 150      | 30
   NV003        | 140      | 10
   ```
3. Upload → Preview → Xác nhận

### Verify: Check leaderboard
1. Tab "Xếp hạng" → Thấy 3 users với podium layout
2. Đăng xuất admin
3. Đăng nhập user NV001
4. Click Trophy icon → Vào `/leaderboard`
5. ✅ Thấy bảng xếp hạng + sticky card rank của mình

## 4. Test Security (CRITICAL - 30 giây)

Login as user thường (không phải admin), mở console:

```javascript
// Test 1: Không thể tự set is_internal
const me = window.getCurrentUser();
const result = await pb.collection('users').update(me.id, { is_internal: true });
console.log('is_internal:', result.is_internal); 
// ✅ Expected: false (hook chặn lại)

// Test 2: Không thể tự set employee_code
const result2 = await pb.collection('users').update(me.id, { employee_code: 'HACK' });
console.log('employee_code:', result2.employee_code);
// ✅ Expected: null/undefined (hook chặn lại)
```

## ✅ Done!

Nếu 4 bước trên pass → Leaderboard đã sẵn sàng.

Chi tiết testing đầy đủ: `docs/LEADERBOARD_TESTING_GUIDE.md`
