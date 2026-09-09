/**
 * Stub file for staff-cache - staff functionality removed
 */

export interface CachedUser {
  id: string;
  full_name?: string;
  username?: string;
  phone?: string;
  cccd?: string;
  employee_code?: string;
}

/**
 * Stub: Returns empty array
 */
export async function getCachedUsers(): Promise<CachedUser[]> {
  return [];
}

/**
 * Stub: Does nothing
 */
export async function clearStaffCache(): Promise<void> {
  // No-op
}

/**
 * Stub: Does nothing
 */
export async function updateCachedUser(userId: string, data: Partial<CachedUser>): Promise<void> {
  // No-op
}
