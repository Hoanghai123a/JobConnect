/**
 * Stub file for staff-permissions - staff functionality removed
 */

export interface StaffWorkspace {
  factories: string[];
  canManageAllFactories: boolean;
}

/**
 * Stub: Returns empty workspace
 */
export async function fetchStaffWorkspace(staffUserId: string): Promise<StaffWorkspace> {
  return {
    factories: [],
    canManageAllFactories: false,
  };
}

/**
 * Stub: Returns empty workspace
 */
export async function fetchCachedStaffWorkspace(staffUserId: string): Promise<StaffWorkspace> {
  return {
    factories: [],
    canManageAllFactories: false,
  };
}

/**
 * Stub: Returns empty workspace
 */
export async function fetchStaffWorkerWorkspace(
  staffUserId: string,
  workerUserId: string,
): Promise<StaffWorkspace> {
  return {
    factories: [],
    canManageAllFactories: false,
  };
}

/**
 * Stub: Always returns false
 */
export function canStaffManageFactory(workspace: StaffWorkspace, factoryId: string): boolean {
  return false;
}
