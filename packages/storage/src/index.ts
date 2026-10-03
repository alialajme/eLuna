export type {
  StorageGateway,
  StoragePrefix,
  SignedUploadParams,
  SignedUploadResult,
  PutParams,
  PutResult,
  SignedReadParams,
  SignedReadResult,
} from "./gateway";
export { buildKey, prefixOf } from "./gateway";
export { SimulatedStorage } from "./simulated";
export { AzureBlobStorage } from "./azure-blob";
export { getStorage, __resetStorage } from "./factory";
export { hasAzureBlob, storageAvailable, simulatedStorageRoot } from "./config";
