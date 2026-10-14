/// <reference path="../pb_data/types.d.ts" />

/**
 * Leaderboard Validation Hook
 *
 * Enforces:
 * 1. User không thể self-update is_internal và employee_code
 * 2. total_hours được computed automatically (hc_hours + tc_hours)
 * 3. Cho phép employee_code trùng giữa các nhà máy
 */

// Block user từ self-updating is_internal và employee_code
onRecordBeforeUpdateRequest((e) => {
  if (e.collection.name !== 'users') return;

  const authRecord = e.httpContext.get('authRecord');
  if (!authRecord) return;

  // Admin được phép update bất kỳ field nào
  if (authRecord.get('role') === 'admin') return;

  // User đang update chính mình
  if (authRecord.id === e.record.id) {
    // Force giữ nguyên is_internal và employee_code từ bản gốc
    const original = e.record.originalCopy();
    e.record.set('is_internal', original.get('is_internal'));
    e.record.set('employee_code', original.get('employee_code'));
  } else {
    // User không được update record của người khác
    throw new ForbiddenError('Bạn không có quyền cập nhật người dùng khác');
  }
}, 'users');

// Compute total_hours automatically khi create internal_staff_hours
onRecordBeforeCreateRequest((e) => {
  if (e.collection.name !== 'internal_staff_hours') return;
  computeTotalHours(e.record);
}, 'internal_staff_hours');

// Compute total_hours automatically khi update internal_staff_hours
onRecordBeforeUpdateRequest((e) => {
  if (e.collection.name !== 'internal_staff_hours') return;
  computeTotalHours(e.record);
}, 'internal_staff_hours');

/**
 * Tính total_hours = hc_hours + tc_hours
 * Client không được phép set total_hours trực tiếp
 */
function computeTotalHours(record) {
  const hcHours = record.get('hc_hours') || 0;
  const tcHours = record.get('tc_hours') || 0;
  record.set('total_hours', hcHours + tcHours);
}

/**
 * Normalize employee code: trim, uppercase, remove special chars
 */
function normalizeEmployeeCode(code) {
  if (!code) return '';
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}
