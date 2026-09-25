-- Migration: Remove Staff-related collections
-- Run this in PocketBase Admin UI > Collections > Delete
-- Or directly on SQLite database

-- BACKUP FIRST!
-- Make a copy of pb_data/data.db before running this

-- ============================================================
-- Step 1: List collections to check (informational query)
-- ============================================================

SELECT
  id,
  name,
  (SELECT COUNT(*) FROM json_each(schema) WHERE json_extract(value, '$.name') = 'user') as has_user_field
FROM _collections
WHERE name IN (
  'staff_action_logs',
  'factory_managers',
  'recruitment_entities',
  'salary_holds',
  'cccd_versions'
)
ORDER BY name;

-- ============================================================
-- Step 2: Check record counts before deletion
-- ============================================================

-- staff_action_logs
SELECT 'staff_action_logs' as collection, COUNT(*) as count FROM staff_action_logs;

-- factory_managers
SELECT 'factory_managers' as collection, COUNT(*) as count FROM factory_managers;

-- recruitment_entities (main_houses)
SELECT 'recruitment_entities' as collection, COUNT(*) as count FROM recruitment_entities;

-- salary_holds
SELECT 'salary_holds' as collection, COUNT(*) as count FROM salary_holds;

-- cccd_versions
SELECT 'cccd_versions' as collection, COUNT(*) as count FROM cccd_versions;

-- ============================================================
-- Step 3: DELETE Collections (via PocketBase Admin UI)
-- ============================================================

-- IMPORTANT: Do this via PocketBase Admin UI, not raw SQL!
--
-- 1. Go to http://localhost:8090/_/
-- 2. Login as admin
-- 3. Go to Collections
-- 4. For each collection below, click "..." -> Delete:
--    - staff_action_logs
--    - factory_managers
--    - recruitment_entities
--    - salary_holds
--    - cccd_versions
--
-- PocketBase will automatically:
-- - Drop the table
-- - Remove from _collections
-- - Clean up relations
-- - Update indexes

-- ============================================================
-- Step 4: Clean up users with staff role (OPTIONAL)
-- ============================================================

-- Option A: Convert staff users to regular users
UPDATE users
SET role = 'user'
WHERE role = 'staff';

-- Option B: Delete staff users (CAREFUL!)
-- DELETE FROM users WHERE role = 'staff';

-- Check remaining users by role
SELECT role, COUNT(*) as count
FROM users
GROUP BY role
ORDER BY role;

-- ============================================================
-- Step 5: Clean up advances collection (remove staff fields)
-- ============================================================

-- These fields can be removed from advances schema via Admin UI:
-- - recruiter_id
-- - recruiter_staff
-- - recruiter_partner
-- - recruiter_note
--
-- Go to: Collections -> advances -> Edit -> Remove these fields

-- Check advances with staff-related data
SELECT
  COUNT(*) as total,
  COUNT(CASE WHEN recruiter_id != '' THEN 1 END) as has_recruiter_id,
  COUNT(CASE WHEN recruiter_staff != '' THEN 1 END) as has_recruiter_staff
FROM advances;

-- ============================================================
-- Verification queries
-- ============================================================

-- Check that collections are deleted
SELECT name FROM _collections
WHERE name IN (
  'staff_action_logs',
  'factory_managers',
  'recruitment_entities',
  'salary_holds',
  'cccd_versions'
);
-- Should return 0 rows

-- Check remaining collections
SELECT name, system
FROM _collections
ORDER BY system DESC, name;

-- Check user roles
SELECT role, COUNT(*)
FROM users
GROUP BY role;
-- Should only show: admin, user (no staff)

-- ============================================================
-- NOTES
-- ============================================================
--
-- DO NOT DELETE via raw SQL! Use PocketBase Admin UI!
--
-- Why: PocketBase manages relations, indexes, and metadata
-- that raw SQL DELETE won't clean up properly.
--
-- Manual deletion via Admin UI:
-- 1. Ensures proper cleanup of all dependencies
-- 2. Updates internal metadata correctly
-- 3. Removes indexes and relations safely
-- 4. Creates automatic backup points
--
-- Collections kept:
-- - employment_histories: Still needed for check-attendance
-- - advances: Simplified workflow (removed staff approval step)
-- - complaints, news, attendance_records: Unchanged
