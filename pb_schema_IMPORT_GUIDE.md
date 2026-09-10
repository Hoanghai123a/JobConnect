# Hướng Dẫn Import Schema PocketBase (No Staff)

## Schema Version: 0.38.0 - No Staff Role

File này chứa schema đã loại bỏ Staff role và các collections liên quan.

## Collections Included (12 collections)

### Core Collections:
1. **users** (auth) - Admin & User only (no Staff)
2. **factories** - Factory management
3. **employment_histories** - Employment records (kept for check-attendance)

### Feature Collections:
4. **advances** - Advance requests (simplified: User → Admin)
5. **complaints** - User complaints
6. **news** - News/announcements
7. **attendance_records** - Daily attendance
8. **app_settings** - App configuration

### Check Attendance/Salary:
9. **check_attendance_batches** - Attendance check batches
10. **check_attendance_items** - Individual attendance records
11. **check_salary_batches** - Salary check batches
12. **check_salary_items** - Individual salary records

### Transport:
13. **transport_routes** - Transport route information

## Collections REMOVED (Not in this schema):
- ❌ staff_action_logs
- ❌ factory_managers
- ❌ recruitment_entities
- ❌ salary_holds
- ❌ cccd_versions

## How to Import

### Method 1: Via PocketBase Admin UI (RECOMMENDED)

1. **Backup existing data**:
   ```bash
   cp -r pb_data pb_data_backup_$(date +%Y%m%d_%H%M%S)
   ```

2. **Stop PocketBase** (if running):
   ```bash
   # Press Ctrl+C in the terminal where PocketBase is running
   ```

3. **Delete old database** (CAREFUL!):
   ```bash
   rm pb_data/data.db
   rm pb_data/data.db-shm
   rm pb_data/data.db-wal
   ```

4. **Start PocketBase**:
   ```bash
   ./pocketbase serve
   ```

5. **Create admin account** (first time):
   - Go to: http://localhost:8090/_/
   - Create new admin account

6. **Import schema**:
   - Settings → Import collections
   - Upload: `pb_schema_v0.38.0_no_staff.json`
   - Click "Review" then "Confirm"

7. **Verify**:
   - Check Collections tab
   - Should see 13 collections
   - No staff_action_logs, factory_managers, etc.

### Method 2: Using PocketBase CLI (Advanced)

If you have existing data and want to migrate:

1. **Export current data**:
   ```bash
   ./pocketbase export --dir=./pb_export
   ```

2. **Stop PocketBase**

3. **Import new schema**:
   ```bash
   ./pocketbase import --collections=pb_schema_v0.38.0_no_staff.json
   ```

4. **Migrate users** (convert staff to user):
   ```sql
   UPDATE users SET role = 'user' WHERE role = 'staff';
   ```

5. **Clean up advances** (remove staff fields - optional):
   - Go to Admin UI
   - Collections → advances → Edit
   - Remove fields: recruiter_id, recruiter_staff, recruiter_partner, recruiter_note

### Method 3: Fresh Start (No existing data)

If you're starting fresh or don't need old data:

1. **Delete pb_data completely**:
   ```bash
   rm -rf pb_data
   ```

2. **Start PocketBase**:
   ```bash
   ./pocketbase serve
   ```

3. **Create admin account**: http://localhost:8090/_/

4. **Import schema**: Settings → Import collections → Upload JSON

5. **Done!** Ready to use

## Post-Import Checklist

- [ ] 13 collections exist
- [ ] No staff-related collections
- [ ] Users collection: only "admin" and "user" roles
- [ ] Advances collection: only "pending", "accepted", "rejected" statuses
- [ ] App builds: `npm run build`
- [ ] App runs: `npm run dev`
- [ ] Login works
- [ ] User can request advance
- [ ] Admin can approve advance

## Initial Data Setup (Optional)

### Create First Admin User
Already done during setup, or via:
```bash
./pocketbase admin create admin@example.com password123
```

### Create App Settings
Via Admin UI → app_settings → New record:
```json
{
  "key": "default",
  "default_advance_limit": 5000000,
  "advance_reporting_enabled": true,
  "allow_advance_after_leave": false,
  "advance_rules": "<p>Quy định ứng lương...</p>"
}
```

### Create Sample Factory
Via Admin UI → factories → New record:
```json
{
  "name": "Nhà máy A",
  "address": "123 Đường ABC, TP.HCM",
  "attendance_cutoff_day": 26,
  "is_active": true
}
```

## Troubleshooting

### "Collection already exists" error
- Delete pb_data/data.db and reimport
- Or manually delete conflicting collections first

### "Auth collection users not found"
- Make sure users collection is created first
- Reimport the entire schema

### "Relation field error"
- Check that related collections exist
- Import order: users → factories → others

### "Role 'staff' not allowed"
- Clean up: `UPDATE users SET role = 'user' WHERE role = 'staff'`
- Schema only allows admin/user

## Schema Differences from Previous Version

### users collection:
- ❌ Removed: role="staff" option
- ✅ Only: role="admin" | role="user"

### advances collection:
- ❌ Removed: recruiter_approved status
- ❌ Removed: recruiter_id, recruiter_staff fields (optional cleanup)
- ✅ Only: status="pending" | "accepted" | "rejected"

### Removed collections:
- ❌ staff_action_logs
- ❌ factory_managers
- ❌ recruitment_entities
- ❌ salary_holds
- ❌ cccd_versions

### Kept collections:
- ✅ employment_histories (for check-attendance)
- ✅ All other feature collections

## Notes

- **Backward compatible**: Old advances records will still work (just ignore recruiter fields)
- **Data loss**: Staff-related collections will be gone forever after import
- **Backup first**: Always backup before importing!
- **Test locally**: Import on test instance first

## Support

If issues occur:
1. Restore from backup: `cp -r pb_data_backup pb_data`
2. Check PocketBase logs: `pb_data/logs/`
3. Verify schema file is valid JSON
4. Re-download schema from repo if corrupted

---

**Schema Version**: 0.38.0 (No Staff)
**Created**: 2024
**Compatible with**: JobConnect v2.0.0+
