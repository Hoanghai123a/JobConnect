import type { StorageAdapter } from "./storageAdapter";
import { LocalStorageAdapter } from "./localStorageAdapter";
import { PocketBaseAdapter } from "./pocketBaseAdapter";
import { pb } from "@/lib/pocketbase";

/**
 * Storage factory with mode detection
 * Returns appropriate adapter based on authentication status
 */
export function getStorageAdapter(): StorageAdapter {
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
