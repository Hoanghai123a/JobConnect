# Migration: Remove Staff Role and Recruitment Workflow

## Overview

This migration removes all Staff-related functionality from JobConnect, simplifying the system to only Admin and User roles.

## Pre-Migration Checklist

- [ ] **BACKUP FIRST!** Copy `pb_data/` folder
- [ ] Build succeeds: `npm run build`
- [ ] No TypeScript errors
- [ ] All tests pass (if any)

## What Gets Deleted

### Collections (5 total)
1. ✅ **staff_action_logs** - Staff activity logs
2. ✅ **factory_managers** - Staff-to-factory assignments
3. ✅ **recruitment_entities** - Recruitment partners (main_houses)
4. ✅ **salary_holds** - Salary hold requests (Staff → Admin approval)
5. ✅ **cccd_versions** - CCCD history managed by Staff

### What Gets Kept
- ✅ **employment_histories** - Still needed for check-attendance functionality
- ✅ **advances** - Simplified: User → Admin (removed Staff approval step)
- ✅ **users** - Role field restricted to "admin" | "user"
- ✅ All other collections unchanged

## Migration Steps

### Step 1: Verify Code Changes

```bash
# Build to confirm no errors
npm run build

# Lint
npm run lint
```

### Step 2: Access PocketBase Admin

1. Open: http://localhost:8090/_/
2. Login with admin credentials
3. Go to **Collections** tab

### Step 3: Delete Collections (via Admin UI)

For each collection, click "..." → "Delete":

1. **staff_action_logs**
2. **factory_managers**  
3. **recruitment_entities**
4. **salary_holds**
5. **cccd_versions**

⚠️ **IMPORTANT**: Delete via Admin UI, NOT raw SQL!
PocketBase handles relations, indexes, and metadata cleanup automatically.

### Step 4: Update Users with Staff Role

Go to: Collections → **users** → "..." → "Edit collection"

Option A: Convert staff to users (RECOMMENDED)
```sql
UPDATE users SET role = 'user' WHERE role = 'staff';
```

Option B: Delete staff users (CAREFUL!)
```sql
DELETE FROM users WHERE role = 'staff';
```

Run via Admin UI: Settings → Backups → Console

### Step 5: Clean Up Advances Collection (Optional)

Go to: Collections → **advances** → "..." → "Edit collection"

Remove these fields (no longer used):
- `recruiter_id`
- `recruiter_staff`
- `recruiter_partner`
- `recruiter_note`

### Step 6: Verify Migration

Run these queries in Admin Console:

```sql
-- Should return 0 rows (collections deleted)
SELECT name FROM _collections
WHERE name IN (
  'staff_action_logs',
  'factory_managers',
  'recruitment_entities',
  'salary_holds',
  'cccd_versions'
);

-- Should only show: admin, user (no staff)
SELECT role, COUNT(*) FROM users GROUP BY role;

-- Check advances (staff fields should be empty or removed)
SELECT COUNT(*) as total,
  COUNT(CASE WHEN recruiter_id != '' THEN 1 END) as has_recruiter
FROM advances;
```

## Post-Migration Testing

### User Flow Test
1. Login as User
2. ✅ Check attendance → Should work
3. ✅ Check salary → Should work (uses employment_histories)
4. ✅ Request advance → Goes directly to Admin (no Staff step)
5. ✅ Submit complaint → Should work
6. ✅ View news, transport, notebook → Should work

### Admin Flow Test
1. Login as Admin
2. ✅ View all advances → Should show pending/accepted/rejected
3. ✅ Approve/reject advance → Should work (direct, no Staff)
4. ✅ Manage users → Should only show admin/user roles
5. ✅ View complaints → Should work
6. ✅ Settings → Should work

### UI Verification
- [ ] Dashboard: No Staff/Workers tiles
- [ ] Bottom Nav: No /staff/* links
- [ ] Advances page: No "Người tuyển duyệt" step
- [ ] No 404 errors on any page
- [ ] No console errors

## Rollback Plan

If something goes wrong:

1. **Stop the app**: Kill the Node process
2. **Restore PocketBase**:
   ```bash
   rm -rf pb_data
   cp -r pb_data_backup pb_data
   ```
3. **Restore code**:
   ```bash
   git checkout main
   npm run build
   ```
4. **Restart**: `npm run dev`

## Files Changed

### Deleted (~40 files)
- `src/routes/_authenticated/staff.tsx` + all sub-routes
- `src/components/staff/*` - All Staff components
- `src/components/employment/*` - Employment management components
- `src/components/cccd/*` - CCCD management components
- `src/components/workforce/*` - Recruitment components
- `src/lib/staff-*.ts` - All Staff logic files

### Modified (~10 files)
- `src/lib/advances.ts` - Removed recruiter_approved status
- `src/routes/_authenticated/advances.tsx` - Simplified workflow
- `src/components/dashboard/FinanceDashboard.tsx` - Updated status chart
- `src/lib/auth.tsx` - Removed Staff sync calls
- `src/routes/_authenticated.tsx` - Removed Staff guards

### Created Stubs (~8 files)
- `src/lib/employment.ts` - Stub for check-attendance
- `src/lib/staff-permissions.ts` - Empty workspace stubs
- `src/lib/staff-log.ts` - No-op logging stubs
- `src/lib/pocketbase-utils.ts` - Utility functions
- `src/components/ui/BankPicker.tsx` - New component

## Support

If you encounter issues:

1. Check build errors: `npm run build`
2. Check browser console for errors
3. Check PocketBase logs: `pb_data/logs/`
4. Verify migration SQL ran correctly
5. Restore from backup if needed

## Completion Checklist

- [ ] Code changes committed
- [ ] Build succeeds
- [ ] Lint passes
- [ ] PocketBase collections deleted
- [ ] Staff users converted/deleted
- [ ] User flow tested
- [ ] Admin flow tested
- [ ] UI verified (no broken links/404s)
- [ ] Documentation updated (PROJECT_MAP.md)
- [ ] Migration script saved for reference

---

**Migration Date**: _________________

**Performed By**: _________________

**Backup Location**: _________________

**Notes**:
