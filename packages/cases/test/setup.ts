import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(__dirname, "../../db/.env") });
const url = process.env.DATABASE_URL ?? "";
if (url && !/\/ayvana_test(\?|$)/.test(url)) process.env.DATABASE_URL = url.replace(/\/([^/?]+)(\?|$)/, "/ayvana_test$2");
if (!process.env.DATABASE_URL) process.env.DATABASE_URL = "postgresql://postgres:password@localhost:5432/ayvana_test";
process.env.NODE_ENV = "test";
// Provide a placeholder so @ayvana/ai config.ts module-eval does not throw,
// then clear it so classifyCase returns null (keyless-safe no-op path).
process.env.ANTHROPIC_API_KEY ??= "sk-ant-test-placeholder";
