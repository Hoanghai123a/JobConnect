import type { StorageAdapter } from "./storageAdapter";
import { LocalStorageAdapter } from "./localStorageAdapter";
import { PocketBaseAdapter } from "./pocketBaseAdapter";
import { pb } from "@/lib/pocketbase";

// TEMPORARY FIX: Force offline mode until PocketBase collections are setup
// Remove this after running: docs/pocketbase/PRODUCTION_DEPLOYMENT.md Step 1
export const FORCE_OFFLINE_MODE = true;

/**
 * Storage factory with mode detection
 * Returns appropriate adapter based on authentication status
 */
export function getStorageAdapter(): StorageAdapter {
  if (FORCE_OFFLINE_MODE) {
    console.warn("🎮 [Farm Game] Using OFFLINE mode (localStorage) - PocketBase not configured");
    return new LocalStorageAdapter();
  }

  const isAuthenticated = pb.authStore.isValid;

  if (isAuthenticated) {
    return new PocketBaseAdapter();
  } else {
    return new LocalStorageAdapter();
  }
}

/**
 * Check if user is in offline mode
 */
export function isOfflineMode(): boolean {
  return !pb.authStore.isValid;
}
