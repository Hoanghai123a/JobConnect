# Leaderboard Feature - Implementation Summary

## ✅ Đã hoàn thành

### Phase 1: Database Foundation
- ✅ Migration script: `pb_migrations/1738700000_add_internal_staff_fields.js`
  - Thêm `employee_code` và `is_internal` vào collection `users`
  - Tạo 3 collections mới: `internal_staff_hours`, `staff_hours_import_history`, `leaderboard_settings`
- ✅ TypeScript types: Updated `src/lib/pocketbase.ts`

### Phase 2: Core Business Logic
- ✅ `src/lib/leaderboard.ts`: 
  - Fetch leaderboard với caching TTL 60s
  - Calculate rankings với tie-breaking logic
  - Get user ranking (backend query, không fetch full list)
  - Aggregate hours from self-checkin LocalStorage
  - Settings management
- ✅ `src/lib/staff-hours-import.ts`:
  - Excel parsing, validation
  - Preview → Execute → Rollback workflow
  - Match employee code (CHÍNH XÁC, không auto-match mơ hồ)
  - Batch import với transaction

### Phase 3: UI Components
- ✅ `src/components/leaderboard/RankBadge.tsx`
- ✅ `src/components/leaderboard/MonthSelector.tsx`
- ✅ `src/components/leaderboard/LeaderboardPodium.tsx` (rank 1 giữa, 2 phải, 3 trái)
- ✅ `src/components/leaderboard/LeaderboardTable.tsx`
- ✅ `src/components/leaderboard/StaffHoursImport.tsx`

### Phase 4: Admin Pages
- ✅ `src/components/leaderboard/admin/AdminRankingsTab.tsx` - Full leaderboard view
- ✅ `src/components/leaderboard/admin/AdminStaffManagementTab.tsx` - Staff management
- ✅ `src/components/leaderboard/admin/AdminSettingsTab.tsx` - Settings
- ✅ `src/components/leaderboard/admin/AdminImportTab.tsx` - Import với history
- ✅ `src/routes/_authenticated/admin/leaderboard.tsx` - Main admin page với 4 tabs
- ✅ Updated `src/routes/_authenticated/admin/manage.tsx` - Thêm navigation tile

### Phase 5: User Pages & Navigation
- ✅ `src/routes/_authenticated/leaderboard.tsx` - User view với sticky ranking card
- ✅ Updated `src/components/layout/BottomNav.tsx` - Thêm Trophy icon cho is_internal users

### Phase 6: Security & Testing
- ⏳ Migration chưa được run trên DB
- ⏳ API rules cần verify sau khi migration
- ⏳ Testing workflow chưa thực hiện

## 🔐 Security Features Implemented

### Backend Protection (API Rules trong migration)
1. **internal_staff_hours collection**:
   - listRule: Admin hoặc chính user đó
   - viewRule: Admin hoặc chính user đó
   - createRule: Chỉ admin
   - updateRule: Chỉ admin
   - deleteRule: Chỉ admin

2. **users collection**:
   - Update rule: User không thể tự update `is_internal` và `employee_code`
   - Cần verify bằng PocketBase hook hoặc custom validation

3. **Frontend chỉ fetch top N + user's own data**:
   - `fetchLeaderboardForUser()` chỉ fetch theo maxRankDisplay
   - Không tải full list xuống client

### Data Integrity
- `total_hours` là computed field ở backend (hc_hours + tc_hours)
- `employee_code` có thể trùng giữa các nhà máy; việc ghép import dùng thêm họ tên và nhà máy
- Unique constraint: user + month + source trong internal_staff_hours

## 📋 Next Steps để Production-Ready

### 1. Run Migration
```bash
# Backup database trước
cp pb_data/data.db pb_backups/backup_before_leaderboard_$(date +%Y%m%d_%H%M%S).db

# Start PocketBase (sẽ tự động chạy migration)
./pocketbase serve

# Verify schema
curl http://localhost:8090/api/collections/users/records | jq '.items[0] | {employee_code, is_internal}'
curl http://localhost:8090/api/collections/internal_staff_hours/records
curl http://localhost:8090/api/collections/leaderboard_settings/records
```

### 2. Verify API Rules
Cần test trực tiếp với PocketBase API:

```bash
# Test 1: User không thể self-update is_internal
curl -X PATCH http://localhost:8090/api/collections/users/records/USER_ID \
  -H "Authorization: USER_TOKEN" \
  -d '{"is_internal": true}' \
  # Expected: 403 Forbidden hoặc field bị ignore

# Test 2: User chỉ xem được data của mình
curl http://localhost:8090/api/collections/internal_staff_hours/records \
  -H "Authorization: USER_TOKEN"
  # Expected: Chỉ trả records của user đó

# Test 3: Admin xem được tất cả
curl http://localhost:8090/api/collections/internal_staff_hours/records \
  -H "Authorization: ADMIN_TOKEN"
  # Expected: Trả tất cả records
```

### 3. Testing Workflow

#### Import Testing
1. Tạo file Excel test với:
   - Mã NV hợp lệ
   - Mã NV không tồn tại
   - Mã NV trùng trong file
   - Giá trị giờ âm / không hợp lệ
2. Test preview → confirm → execute
3. Test rollback sau import
4. Test import lặp lại (upsert logic)

#### UI/UX Testing
1. Responsive: Test mobile, tablet, desktop
2. Podium layout: Verify rank 1 giữa, 2 phải, 3 trái
3. User ranking card: Test 3 states (in_top, unranked, no_data)
4. Search functionality
5. Loading states, empty states, error states
6. Navigation icon: Verify Trophy hiển thị cho is_internal users

#### Data Flow Testing
1. Admin import Excel → verify leaderboard updates
2. Toggle data source → verify data độc lập
3. Change month → verify data filtering
4. User view: Verify chỉ fetch top N + own data

### 4. PocketBase Hook (Optional - Tăng cường security)

Tạo file `pb_hooks/leaderboard_validation.pb.js`:

```javascript
// Block user từ self-updating is_internal và employee_code
onRecordBeforeUpdateRequest((e) => {
  if (e.collection.name !== 'users') return;
  
  const authRecord = e.httpContext.get('authRecord');
  if (!authRecord || authRecord.get('role') === 'admin') return;
  
  // User đang update chính mình
  if (authRecord.id === e.record.id) {
    // Block is_internal và employee_code changes
    const original = e.record.originalCopy();
    e.record.set('is_internal', original.get('is_internal'));
    e.record.set('employee_code', original.get('employee_code'));
  }
});

// Compute total_hours trước khi save
onRecordBeforeCreateRequest((e) => {
  if (e.collection.name !== 'internal_staff_hours') return;
  computeTotalHours(e.record);
});

onRecordBeforeUpdateRequest((e) => {
  if (e.collection.name !== 'internal_staff_hours') return;
  computeTotalHours(e.record);
});

function computeTotalHours(record) {
  const hc = record.get('hc_hours') || 0;
  const tc = record.get('tc_hours') || 0;
  record.set('total_hours', hc + tc);
}
```

### 5. Edge Cases cần test

- [ ] User không có employee_code: Import sẽ không match
- [ ] User bị set is_internal=false sau khi có data: Route guard sẽ redirect
- [ ] Hai users cùng total_hours: Tie-breaking theo hc_hours
- [ ] maxRankDisplay < số người: "Vô hạng" hiển thị đúng
- [ ] maxRankDisplay thay đổi: User's rank status thay đổi
- [ ] Import với batch size lớn (100+ rows): Performance
- [ ] Month chưa có data: Empty state
- [ ] Rollback import đã rollback: Idempotent

## 🎯 Success Metrics

Sau khi production:
- [ ] Admin import Excel thành công với preview → confirm
- [ ] Admin toggle giữa 2 data sources độc lập
- [ ] Admin set maxRankDisplay, user thấy thay đổi
- [ ] User xem leaderboard, top 3 podium đúng layout
- [ ] User ngoài top N thấy "Vô hạng"
- [ ] User chưa có data thấy "Chưa có dữ liệu"
- [ ] Trophy icon hiển thị cho is_internal users
- [ ] Search by employee code works
- [ ] Export Excel successful
- [ ] Rollback import successful
- [ ] Backend chỉ trả top N + user data (verify network tab)
- [ ] API rules: user không self-update is_internal
- [ ] API rules: user chỉ xem data của mình
- [ ] total_hours computed đúng
- [ ] Mã NV trùng giữa các nhà máy vẫn được tra cứu và import đúng người

## ⚠️ Known Limitations & Risks

### Chưa implement
1. **Real-time updates**: User cần manual refresh sau khi admin import
   - Solution Phase 2: PocketBase realtime subscriptions
2. **Self-checkin data aggregation**: Logic đã có nhưng chưa test với LocalStorage thật
   - Cần verify format key: `attendance_${userId}_${date}`
3. **API rule enforcement**: Chưa test trực tiếp trên PocketBase
   - Cần verify user không bypass được security

### Migration risks
- Migration script chưa được test trên DB thật
- Rollback migration chưa có script
- Nếu có data sẵn trong users, cần handle carefully

### Performance
- Query leaderboard với 1000+ users: Chưa test
- Import batch 100+ rows: Chưa test transaction timeout
- Caching TTL 60s: Có thể cần adjust dựa trên usage

## 📁 Files Created/Modified

### New Files (21)
- pb_migrations/1738700000_add_internal_staff_fields.js
- src/lib/leaderboard.ts
- src/lib/staff-hours-import.ts
- src/components/leaderboard/RankBadge.tsx
- src/components/leaderboard/MonthSelector.tsx
- src/components/leaderboard/LeaderboardPodium.tsx
- src/components/leaderboard/LeaderboardTable.tsx
- src/components/leaderboard/StaffHoursImport.tsx
- src/components/leaderboard/admin/AdminRankingsTab.tsx
- src/components/leaderboard/admin/AdminStaffManagementTab.tsx
- src/components/leaderboard/admin/AdminSettingsTab.tsx
- src/components/leaderboard/admin/AdminImportTab.tsx
- src/routes/_authenticated/admin/leaderboard.tsx
- src/routes/_authenticated/leaderboard.tsx

### Modified Files (3)
- src/lib/pocketbase.ts (added types)
- src/routes/_authenticated/admin/manage.tsx (added navigation tile)
- src/components/layout/BottomNav.tsx (added Trophy icon for internal users)

## 🚀 Deploy Checklist

- [ ] Review migration script
- [ ] Backup database
- [ ] Run migration
- [ ] Verify schema và API rules
- [ ] Test import workflow end-to-end
- [ ] Test user view và admin view
- [ ] Verify security: user không self-update is_internal
- [ ] Verify performance với large dataset
- [ ] Document cho user: Cách sử dụng tính năng
- [ ] Monitor logs sau deploy
