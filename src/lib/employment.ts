import { pb } from "./pocketbase";

/**
 * Stub file for employment - most functionality removed
 * Only keeping minimal types and functions for compatibility
 */

export type EmploymentStatus = "working" | "left";

export interface EmploymentHistoryRecord {
  id: string;
  user: string;
  factory?: string;
  employee_code?: string;
  join_date?: string;
  leave_date?: string;
  recruiter_staff?: string;
  recruiter_partner?: string;
  expand?: {
    factory?: {
      id: string;
      name?: string;
      code?: string;
    };
  };
}

/**
 * Stub: Always returns null (no active employment)
 */
export async function findActiveEmploymentByUser(
  userId: string,
): Promise<EmploymentHistoryRecord | null> {
  return null;
}

/**
 * Stub: Does nothing, returns null
 */
export async function createEmploymentHistory(data: any): Promise<EmploymentHistoryRecord | null> {
  // No-op stub
  return null;
}

/**
 * Stub: Returns empty array
 */
export async function fetchEmploymentHistories(
  userIds: string[],
): Promise<EmploymentHistoryRecord[]> {
  return [];
}

/**
 * Stub: Returns empty array
 */
export async function getStaleWorkingEmploymentHistories(): Promise<EmploymentHistoryRecord[]> {
  return [];
}

/**
 * Stub: Just updates user directly without cache
 */
export async function updateUserAndCache(userId: string, data: any) {
  return pb.collection("users").update(userId, data);
}

/**
 * Stub: Does nothing
 */
export async function updateEmploymentHistory(historyId: string, data: any) {
  // No-op stub
  return null;
}

/**
 * Stub: Always returns "left"
 */
export function deriveEmploymentStatus(record: EmploymentHistoryRecord): EmploymentStatus {
  return "left";
}

/**
 * Stub: Returns null
 */
export function getLatestEmploymentHistory(
  histories: EmploymentHistoryRecord[],
): EmploymentHistoryRecord | null {
  return null;
}

/**
 * Stub: Returns null
 */
export function getCurrentEmploymentHistory(
  histories: EmploymentHistoryRecord[],
): EmploymentHistoryRecord | null {
  return null;
}

/**
 * Stub: Returns null
 */
export function getEmploymentHistoryAtDate(
  histories: EmploymentHistoryRecord[],
  date: string,
): EmploymentHistoryRecord | null {
  return null;
}

/**
 * Stub: Always returns false
 */
export function isCurrentlyWorking(employment: EmploymentHistoryRecord): boolean {
  return false;
}
