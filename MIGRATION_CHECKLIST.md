# Quick Migration Checklist

## ✅ Pre-Migration (DONE)
- [x] Code changes complete
- [x] Build succeeds (`npm run build`)
- [x] Lint passes (0 errors)
- [x] Stub files created
- [x] Migration scripts created
- [x] Documentation written

## ⏳ Database Migration (TODO)

### Step 1: Backup
```bash
# Create backup of PocketBase data
cp -r pb_data pb_data_backup_$(date +%Y%m%d_%H%M%S)
```
- [ ] Backup created
- [ ] Backup verified (folder exists and has files)

### Step 2: Open PocketBase Admin
- [ ] Navigate to: http://localhost:8090/_/
- [ ] Login successful
- [ ] Go to Collections tab

### Step 3: Delete Collections (one by one)
In Collections tab, for each collection click "..." → "Delete":

- [ ] `staff_action_logs` deleted
- [ ] `factory_managers` deleted
- [ ] `recruitment_entities` deleted
- [ ] `salary_holds` deleted
- [ ] `cccd_versions` deleted

### Step 4: Update Users
Settings → Backups → Console, run:
```sql
UPDATE users SET role = 'user' WHERE role = 'staff';
```
- [ ] SQL executed
- [ ] Check result: `SELECT role, COUNT(*) FROM users GROUP BY role;`
- [ ] Should only show: admin, user

### Step 5: Verify
Run in Console:
```sql
-- Should return 0 rows
SELECT name FROM _collections 
WHERE name IN ('staff_action_logs', 'factory_managers', 
               'recruitment_entities', 'salary_holds', 'cccd_versions');
```
- [ ] Verification query returns 0 rows

## ⏳ Testing (TODO)

### User Flow
- [ ] Login as regular user
- [ ] View dashboard (no Staff tiles)
- [ ] Check attendance works
- [ ] Check salary works (finds employee_code)
- [ ] Request advance → goes to Admin pending
- [ ] Submit complaint works

### Admin Flow
- [ ] Login as admin
- [ ] View advances pending list
- [ ] Approve an advance → works
- [ ] Reject an advance → works
- [ ] View users → only admin/user roles
- [ ] No Staff management sections visible

### UI Check
- [ ] No console errors in browser DevTools
- [ ] No broken navigation links
- [ ] No 404 errors on any page
- [ ] Bottom nav works correctly
- [ ] Dashboard tiles all functional

## 🔧 If Something Breaks

### Rollback Steps
```bash
# 1. Stop the app
# 2. Restore PocketBase
rm -rf pb_data
cp -r pb_data_backup pb_data

# 3. Restore code (if needed)
git checkout main
npm run build

# 4. Restart
npm run dev
```

## ✅ Post-Migration

- [ ] Update PROJECT_MAP.md
- [ ] Commit changes: `git commit -m "feat: remove Staff role and simplify workflow"`
- [ ] Tag release: `git tag v2.0.0-no-staff`
- [ ] Document in changelog

---

**Estimated Time**: 15-30 minutes
**Difficulty**: Medium (manual steps required)
**Risk**: Medium (backup required, data loss possible)

**Ready to proceed?** Start with Step 1: Backup
