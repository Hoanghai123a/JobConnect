# Hướng Dẫn Import Schema PocketBase (No Staff)

## File Schema

**File**: `pb_schema_v0.38.0_no_staff.json`  
**PocketBase Version**: 0.38.0+  
**Date**: 2025-01-XX

## Collections Included

Schema này bao gồm các collections sau (không có Staff-related collections):

### Core Collections
1. ✅ **users** - User accounts (admin/user only, no staff)
2. ✅ **factories** - Factory/company list
3. ✅ **employment_histories** - Employment records (admin-managed)

### Feature Collections
4. ✅ **advances** - Salary advances (User → Admin workflow)
5. ✅ **complaints** - User complaints
6. ✅ **news** - News articles
7. ✅ **attendance_records** - Attendance tracking

### Check Collections
8. ✅ **check_attendance_batches** - Attendance batch uploads
9. ✅ **check_attendance_items** - Individual attendance records
10. ✅ **check_salary_batches** - Salary batch uploads
11. ✅ **check_salary_items** - Individual salary records

### Settings Collections
12. ✅ **app_settings** - Application settings
13. ✅ **transport_routes** - Transport routes

## Collections REMOVED (Staff-related)

These collections are NOT included in this schema:

- ❌ staff_action_logs
- ❌ factory_managers
- ❌ recruitment_entities (main_houses)
- ❌ salary_holds
- ❌ cccd_versions

## Import Methods

### Method 1: Via Admin UI (RECOMMENDED)

1. **Backup existing data**:
   ```bash
   cp -r pb_data pb_data_backup_$(date +%Y%m%d_%H%M%S)
   ```

2. **Stop PocketBase** (if running)

3. **Open PocketBase Admin UI**:
   ```bash
   # Start PocketBase
   ./pocketbase serve
   
   # Open in browser
   http://localhost:8090/_/
   ```

4. **Import Schema**:
   - Go to: **Settings** → **Import collections**
   - Click: **Load from JSON file**
   - Select: `pb_schema_v0.38.0_no_staff.json`
   - Review collections to import
   - Click: **Import**

5. **Verify Import**:
   - Go to: **Collections** tab
   - Check that all 13 collections exist
   - Verify: No staff-related collections

### Method 2: Via CLI (Fresh Install)

For a fresh PocketBase installation:

```bash
# 1. Create new PocketBase directory
mkdir jobconnect-no-staff
cd jobconnect-no-staff

# 2. Download PocketBase
# (Download from https://pocketbase.io/docs/)

# 3. Start PocketBase
./pocketbase serve

# 4. Create admin account via browser
# http://localhost:8090/_/

# 5. Import schema via Admin UI (see Method 1 step 4)
```

### Method 3: Programmatic Import

Using the migration script:

```bash
node scripts/import-schema.mjs pb_schema_v0.38.0_no_staff.json
```

## Post-Import Steps

### 1. Verify Collections

Check in Admin UI → Collections:

```
✓ users (auth)
✓ factories
✓ employment_histories
✓ advances
✓ complaints
✓ news
✓ attendance_records
✓ check_attendance_batches
✓ check_attendance_items
✓ check_salary_batches
✓ check_salary_items
✓ app_settings
✓ transport_routes
```

### 2. Create Initial Data

#### Create Admin User
Go to: Collections → **users** → **+ New record**

```json
{
  "email": "admin@jobconnect.local",
  "password": "admin123456",
  "passwordConfirm": "admin123456",
  "role": "admin",
  "full_name": "System Admin",
  "status": "active"
}
```

#### Create App Settings
Go to: Collections → **app_settings** → **+ New record**

```json
{
  "key": "default",
  "default_advance_limit": 5000000,
  "advance_reporting_enabled": true,
  "allow_advance_after_leave": false,
  "advance_rules": "<p>Quy định ứng lương:</p><ul><li>Hạn mức tối đa: 5,000,000 đ</li><li>Chỉ được ứng khi đang làm việc</li></ul>"
}
```

#### Create Sample Factory
Go to: Collections → **factories** → **+ New record**

```json
{
  "name": "Nhà máy A",
  "address": "123 Đường ABC, Quận 1, TP.HCM",
  "attendance_cutoff_day": 25,
  "is_active": true
}
```

### 3. Test User Creation

Create a test user:

```json
{
  "email": "user@test.com",
  "password": "user123456",
  "passwordConfirm": "user123456",
  "role": "user",
  "uid": "HL000001",
  "full_name": "Nguyễn Văn A",
  "phone": "0900000000",
  "status": "active"
}
```

### 4. Create Employment History (for test user)

Go to: Collections → **employment_histories** → **+ New record**

```json
{
  "user": "<user_id>",
  "employee_code": "NV001",
  "factory": "<factory_id>",
  "join_date": "2024-01-01",
  "is_current": true
}
```

## Key Changes from Previous Schema

### Users Collection
- ❌ Removed: `role = "staff"` option
- ✅ Only: `admin` and `user` roles

### Advances Collection
- ❌ Removed: `recruiter_approved` status
- ❌ Removed: Staff approval workflow
- ✅ Simplified: `pending` → `accepted` / `rejected`

### Employment Histories
- ✅ Kept for check-attendance functionality
- ✅ Admin-managed (no Staff workflow)

## Verification Queries

Run these in: **Settings** → **Backups** → **Console**

```sql
-- Check user roles (should only show admin/user)
SELECT role, COUNT(*) as count FROM users GROUP BY role;

-- Check collections exist
SELECT name FROM _collections ORDER BY name;

-- Verify advances status values
SELECT DISTINCT status FROM advances;
-- Should only show: pending, accepted, rejected (no recruiter_approved)
```

## Troubleshooting

### Import Fails

**Error**: "Collection already exists"

**Solution**: 
1. Delete existing collections first via Admin UI
2. Or import into fresh PocketBase instance

### Missing Fields

**Error**: Fields missing after import

**Solution**:
1. Verify JSON file is valid
2. Check PocketBase version compatibility (need 0.38.0+)
3. Re-import schema

### Permission Errors

**Error**: Cannot create records

**Solution**:
1. Check collection rules in Admin UI
2. Verify admin user exists and is logged in
3. Check role is set correctly

## Rollback

If import fails or causes issues:

```bash
# Stop PocketBase
# Restore backup
rm -rf pb_data
cp -r pb_data_backup pb_data

# Restart PocketBase
./pocketbase serve
```

## Next Steps

After successful import:

1. ✅ Verify all collections exist
2. ✅ Create admin user
3. ✅ Create app_settings
4. ✅ Test user registration flow
5. ✅ Test advances workflow (User → Admin)
6. ✅ Test check-attendance
7. ✅ Deploy code changes (`git pull`, `npm run build`)

## Support Files

- `MIGRATION.md` - Full migration guide
- `MIGRATION_CHECKLIST.md` - Step-by-step checklist
- `SUMMARY.md` - Completion summary
- `scripts/migration-remove-staff.sql` - SQL verification queries

---

**Schema Version**: v0.38.0-no-staff  
**Last Updated**: 2025-01-XX  
**Status**: Production Ready ✅
