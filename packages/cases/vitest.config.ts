import { defineConfig } from "vitest/config";
export default defineConfig({ test: { setupFiles: ["./test/setup.ts"], fileParallelism: false, hookTimeout: 30_000, testTimeout: 30_000 } });
