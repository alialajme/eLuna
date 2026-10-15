#!/usr/bin/env node
/**
 * Deploy-parity guard (PRODUCTION-HARDENING §27).
 *
 * Fails CI if any `apps/<app>` is missing from the places it must be deployed:
 *   1. the ACR build loop in .github/workflows/azure-deploy.yml
 *   2. the Helm `apps:` list in infra/helm/ayvana/values.yaml
 *   3. its own liveness + readiness health routes
 *
 * This makes "someone added a 5th app and forgot to deploy it" a build failure
 * instead of a silent production gap (which is exactly how the supplier app was
 * left undeployed).
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

// Native apps shipped to the App/Play stores (not Next.js services deployed to
// AKS) are exempt from the deploy-parity guard — they have no ACR image, Helm
// release, or HTTP health probes.
const NOT_DEPLOYED = new Set(["mobile"]);

const apps = readdirSync(join(root, "apps"), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .filter((name) => !NOT_DEPLOYED.has(name));

const deployYml = readFileSync(join(root, ".github/workflows/azure-deploy.yml"), "utf8");
const loopMatch = deployYml.match(/for app in ([^;]+);/);
const deployApps = loopMatch ? loopMatch[1].trim().split(/\s+/) : [];

const valuesYml = readFileSync(join(root, "infra/helm/ayvana/values.yaml"), "utf8");
const helmApps = [...valuesYml.matchAll(/^\s*-\s*name:\s*(\S+)/gm)].map((m) => m[1]);

for (const app of apps) {
  if (!deployApps.includes(app)) {
    errors.push(`apps/${app} is missing from the ACR build loop in azure-deploy.yml`);
  }
  if (!helmApps.includes(app)) {
    errors.push(`apps/${app} is missing from the apps: list in infra/helm/ayvana/values.yaml`);
  }
  for (const probe of ["live", "ready"]) {
    if (!existsSync(join(root, "apps", app, "app/api/health", probe, "route.ts"))) {
      errors.push(`apps/${app} is missing /api/health/${probe} route`);
    }
  }
}

// Background services (not HTTP apps) that must also be built + deployable, or
// they become the same silent production gap. Each must have: a Dockerfile, an
// ACR build referencing it, and a Helm template. (The AI Studio worker consumes
// the generation-job queue — if it's undeployed, jobs enqueue with no consumer.)
const services = [
  {
    name: "studio-worker",
    dockerfile: "docker/Dockerfile.studio-worker",
    acrImage: "studio-worker",
    helmTemplate: "infra/helm/ayvana/templates/studio-worker.yaml",
  },
];

for (const svc of services) {
  if (!existsSync(join(root, svc.dockerfile))) {
    errors.push(`service "${svc.name}" is missing its Dockerfile (${svc.dockerfile})`);
  }
  if (!new RegExp(`/${svc.acrImage}:`).test(deployYml)) {
    errors.push(`service "${svc.name}" is missing an ACR build step in azure-deploy.yml`);
  }
  if (!existsSync(join(root, svc.helmTemplate))) {
    errors.push(`service "${svc.name}" is missing its Helm template (${svc.helmTemplate})`);
  }
}

if (errors.length) {
  console.error("Deploy-parity check FAILED:\n" + errors.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}
console.log(
  `Deploy-parity OK — ${apps.length} apps covered: ${apps.join(", ")}; ` +
    `${services.length} background service(s): ${services.map((s) => s.name).join(", ")}`,
);
