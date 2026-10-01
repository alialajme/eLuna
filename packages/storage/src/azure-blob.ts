import type {
  StorageGateway,
  SignedUploadParams,
  SignedUploadResult,
  PutParams,
  PutResult,
  SignedReadParams,
  SignedReadResult,
  StoragePrefix,
} from "./gateway";
import { buildKey } from "./gateway";

// Representative scaffold for Azure Blob Storage (UAE North), behind the repo's
// credential-gated pattern. Author-complete but config-gated: only instantiated
// by the factory when hasAzureBlob() is true. It NEVER fakes success — every
// method returns a `failed` result until an operator wires the SDK.
//
// Activation (see docs/ai-studio/phase-1-implementation.md):
//   - AZURE_STORAGE_ACCOUNT, AZURE_STORAGE_CONTAINER (+ workload identity in prod,
//     or AZURE_STORAGE_SAS / connection string in dev)
//   - add `@azure/storage-blob` + `@azure/identity` as deps of this package
//   - map StoragePrefix → container/prefix; generate user-delegation SAS for
//     signedUpload/getSignedUrl; set a lifecycle rule to expire the `temp` prefix.
export class AzureBlobStorage implements StorageGateway {
  private readonly account = process.env.AZURE_STORAGE_ACCOUNT ?? "";
  private readonly container = process.env.AZURE_STORAGE_CONTAINER ?? "";

  private notWired(): { status: "failed"; error: string } {
    return { status: "failed", error: "AzureBlobStorage not implemented (operator activation required)" };
  }

  async signedUpload(_params: SignedUploadParams): Promise<SignedUploadResult> {
    // TODO(operator): generate a user-delegation SAS write URL for
    //   `${this.container}/${buildKey(_params.prefix, _params.key)}` with a short
    //   TTL + content-type + content-length guard (maxBytes), and return it.
    void buildKey;
    void this.account;
    void this.container;
    return this.notWired();
  }

  async put(_params: PutParams): Promise<PutResult> {
    // TODO(operator): BlockBlobClient.uploadData(body, { blobHTTPHeaders }).
    return this.notWired();
  }

  async getSignedUrl(_params: SignedReadParams): Promise<SignedReadResult> {
    // TODO(operator): generate a short-TTL read SAS for the key.
    return this.notWired();
  }

  async delete(_key: string): Promise<void> {
    // TODO(operator): BlobClient.deleteIfExists(). No-op until wired.
  }

  async purgePrefix(_prefix: StoragePrefix, _olderThanMs: number): Promise<number> {
    // TODO(operator): prefer a Blob lifecycle rule over an app-side sweep.
    return 0;
  }
}
