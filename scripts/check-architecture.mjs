#!/usr/bin/env node
/**
 * Architecture fitness guard (PRODUCTION-HARDENING — modular-monolith boundaries).
 *
 * Fails CI if a change erodes the layering the monorepo depends on. Asserts:
 *   1. ONE Prisma client — `new PrismaClient()` lives only in `packages/db`
 *      (apps/packages must import the shared `@ayvana/db` client, so the
 *      connection pool isn't fragmented across the codebase).
 *   2. NO app imports another app — apps are deployment-isolated; shared code
 *      must live in a `@ayvana/*` package, never be reached across app roots.
 *   3. `@ayvana/db` stays foundational — it may depend only on `@ayvana/config`,
 *      never "up" into feature packages (prevents dependency cycles through the
 *      shared data layer).
 *
 * This turns "someone wired a second Prisma client / imported across apps /
 * made db depend on a feature package" into a build failure instead of a slow
 * architectural rot.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

const SKIP_DIRS = new Set(["node_modules", ".next", ".turbo", ".expo", "dist", "coverage", ".git"]);
const CODE_EXT = /\.(ts|tsx|mjs|cjs|js|jsx)$/;

/** Recursively collect source files under a dir, skipping build/vendor output. */
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name), out);
    } else if (CODE_EXT.test(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

/** Extract module specifiers from `import ... from "x"`, `require("x")`, `import("x")`. */
function importSpecifiers(src) {
  const specs = [];
  const re =
    /(?:import\b[^;]*?\bfrom\s*|import\s*|require\s*\(\s*|import\s*\(\s*)["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(src)) !== null) specs.push(m[1]);
  return specs;
}

// ── Check 1 + 2: scan app source ──────────────────────────────────────────
const appsDir = join(root, "apps");
const apps = existsSync(appsDir)
  ? readdirSync(appsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : [];

for (const app of apps) {
  const appRoot = join(appsDir, app);
  for (const file of walk(appRoot)) {
    const src = readFileSync(file, "utf8");

    // (1) no rogue Prisma client in an app
    if (/\bnew\s+PrismaClient\s*\(/.test(src)) {
      errors.push(
        `[one-prisma-client] ${relative(root, file)} constructs \`new PrismaClient()\`; import the shared client from @ayvana/db instead.`,
      );
    }

    // (2) no cross-app import (bare "apps/<other>/…" or a relative path that
    // resolves into a different app directory)
    for (const spec of importSpecifiers(src)) {
      let targetApp = null;
      const bare = spec.match(/(?:^|\/)apps\/([^/]+)\//);
      if (bare) {
        targetApp = bare[1];
      } else if (spec.startsWith(".")) {
        const resolved = resolve(dirname(file), spec);
        const rel = relative(appsDir, resolved);
        if (!rel.startsWith("..")) targetApp = rel.split(/[/\\]/)[0];
      }
      if (targetApp && targetApp !== app && apps.includes(targetApp)) {
        errors.push(
          `[no-cross-app-import] ${relative(root, file)} imports "${spec}" from app "${targetApp}". Move shared code into a @ayvana/* package.`,
        );
      }
    }
  }
}

// ── Check 3: @ayvana/db stays foundational ──────────────────────────────────
const dbPkgPath = join(root, "packages", "db", "package.json");
if (existsSync(dbPkgPath)) {
  const dbPkg = JSON.parse(readFileSync(dbPkgPath, "utf8"));
  const allDeps = { ...(dbPkg.dependencies ?? {}), ...(dbPkg.devDependencies ?? {}) };
  const ALLOWED_INTERNAL = new Set(["@ayvana/config"]);
  for (const dep of Object.keys(allDeps)) {
    if (dep.startsWith("@ayvana/") && !ALLOWED_INTERNAL.has(dep)) {
      errors.push(
        `[db-stays-foundational] @ayvana/db depends on "${dep}". The shared data layer may only depend on @ayvana/config, never on feature packages (prevents cycles).`,
      );
    }
  }
}

// ── Report ──────────────────────────────────────────────────────────────────
if (errors.length > 0) {
  console.error(`\nArchitecture fitness check FAILED (${errors.length} issue(s)):\n`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error("");
  process.exit(1);
}
console.log(`Architecture fitness check passed (${apps.length} apps scanned).`);
