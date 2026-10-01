import type { StorageGateway } from "./gateway";
import { SimulatedStorage } from "./simulated";
import { AzureBlobStorage } from "./azure-blob";
import { hasAzureBlob } from "./config";

// Module-level singleton so SimulatedStorage's in-memory map (its keyless
// fallback when disk is unavailable) persists across calls within a process.
let singleton: StorageGateway | null = null;

/**
 * Resolve the active storage gateway. Never throws. Unconfigured → SimulatedStorage
 * (local disk / data-URI), so the feature builds and runs keyless. Real Blob is
 * only used when hasAzureBlob() is true (defense-in-depth alongside the server-side
 * storageAvailable() gate).
 */
export function getStorage(): StorageGateway {
  if (singleton) return singleton;
  singleton = hasAzureBlob() ? new AzureBlobStorage() : new SimulatedStorage();
  return singleton;
}

/** Testing hook: reset the process singleton. */
export function __resetStorage(): void {
  singleton = null;
}
