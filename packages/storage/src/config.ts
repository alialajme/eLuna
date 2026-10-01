// Credential gate for object storage. In production this uses a user-assigned
// managed identity (workload identity) rather than an account key, so the
// presence of the account + container name is the signal that Blob is wired.
export const hasAzureBlob = () =>
  !!process.env.AZURE_STORAGE_ACCOUNT && !!process.env.AZURE_STORAGE_CONTAINER;

/**
 * Whether real (non-simulated) storage is available in the current environment.
 * Non-production always "has" storage via the Simulated fallback (local disk /
 * data-URI), so the full pipeline runs keyless in dev. In production, real Blob
 * must be configured — a caller can check this before surfacing uploads.
 */
export function storageAvailable(): boolean {
  return hasAzureBlob() || process.env.NODE_ENV !== "production";
}

/** Local root for SimulatedStorage disk writes (overridable; defaults to OS temp). */
export function simulatedStorageRoot(): string {
  return process.env.AYVANA_STORAGE_LOCAL_DIR || "";
}
