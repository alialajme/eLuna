import { defineConfig } from "vitest/config";

export default defineConfig({
  // One test file per package; each manipulates process.env per test with
  // save/restore, so keep file-level isolation deterministic.
  test: { fileParallelism: false },
});
