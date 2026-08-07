# Azure + Kubernetes (AKS) Deployment — Design Spec

## Goal

Make the e-Luna platform deployable to **Microsoft Azure on Kubernetes (AKS)** in the **UAE North** region for high-availability, 24/7 operation. Deliverable is **infrastructure-as-code committed to the repo** (Dockerfiles, Bicep, Helm, health endpoints, an Azure deploy pipeline, and a runbook). This is **additive** — the existing Vercel configuration is left intact as an alternative target.

**Boundary:** This environment has no Azure subscription/credentials, so the actual provisioning and "running 24/7" verification are the operator's steps (documented in the runbook). In-repo verification is limited to build + lint + manifest rendering.

---

## Scope

**In scope:** containerize the three Next.js apps (`customer`, `vendor`, `admin`) with `output: "standalone"`; a parameterized multi-stage Dockerfile; a `/api/health` endpoint per app; Bicep modules for AKS + ACR + PostgreSQL Flexible Server + Key Vault + networking (UAE North); a Helm chart deploying all three apps with ingress+TLS, HPA, and PodDisruptionBudget; a GitHub Actions Azure deploy pipeline (OIDC auth, ACR build, Helm upgrade); Key Vault CSI secret flow; a deployment runbook.

**Out of scope:** removing Vercel configs; provisioning live Azure resources; DNS registration; application feature work (AI Agent Mesh etc. are separate phases); database data migration tooling beyond `prisma migrate deploy`; multi-region/DR beyond zone-redundant HA; observability stack beyond health probes (Azure Monitor/Prometheus can be a follow-up).

---

## Target Architecture

```
                         Internet
                            │
                 luna.ae / sell.luna.ae / ops.luna.ae   (DNS → ingress public IP)
                            │  TLS (cert-manager + Let's Encrypt)
                    ┌───────▼────────┐
                    │ ingress-nginx  │   (AKS)
                    └───┬───┬────┬───┘
             ┌──────────┘   │    └───────────┐
        ┌────▼────┐    ┌────▼────┐      ┌─────▼────┐
        │ customer│    │ vendor  │      │  admin   │   Deployments (≥2 replicas,
        │  Deploy │    │  Deploy │      │  Deploy  │   HPA, PDB, multi-zone)
        └────┬────┘    └────┬────┘      └────┬─────┘
             └──────────────┼────────────────┘
                            │ DATABASE_URL (private endpoint)
                    ┌───────▼─────────────────┐
                    │ Azure DB for PostgreSQL  │  Flexible Server, zone-redundant HA
                    └──────────────────────────┘

  Images: ACR  ·  Secrets: Key Vault → pods via CSI driver + workload identity
```

- **Region:** UAE North (full AKS + PostgreSQL Flexible Server availability).
- **Containers:** each Next.js app builds a standalone image (Node 20 runtime), pushed to **ACR**, tagged by git SHA.
- **AKS cluster:** system node pool + autoscaling user node pool; **workload identity** enabled (for Key Vault CSI); OIDC issuer enabled.
- **Ingress + TLS:** ingress-nginx routes the three hostnames; **cert-manager** issues Let's Encrypt certificates.
- **Database:** Azure Database for PostgreSQL Flexible Server, zone-redundant HA, reached over a private endpoint; Prisma uses `DATABASE_URL`.
- **Secrets:** Azure Key Vault; surfaced to pods via the **Secrets Store CSI driver** bound through **AKS workload identity**. No secret values in the repo or in GitHub.
- **24/7 posture:** liveness + readiness probes hitting `/api/health`; `HorizontalPodAutoscaler` per app; `PodDisruptionBudget` (minAvailable: 1); ≥2 replicas across zones so rolling deploys and node/zone failures never fully drop a service.

---

## Repo Artifacts

```
apps/{customer,vendor,admin}/
  next.config.ts            — MODIFY: add `output: "standalone"`
  app/api/health/route.ts   — CREATE: GET → 200 { status: "ok" }
docker/
  Dockerfile                — parameterized multi-stage (ARG APP)
  .dockerignore
infra/
  bicep/
    main.bicep
    modules/{network,acr,aks,postgres,keyvault}.bicep
    params/uae-north.bicepparam
  helm/luna/
    Chart.yaml
    values.yaml
    templates/{deployment,service,ingress,hpa,pdb,_helpers}.yaml
  k8s/
    cert-manager/cluster-issuer.yaml
.github/workflows/
  azure-deploy.yml
docs/deployment/
  azure-aks.md              — runbook
```

### `next.config.ts` change (all three apps)
Add `output: "standalone"` alongside the existing `transpilePackages`:
```ts
const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@e-luna/ui", "@e-luna/auth", "@e-luna/db", "@e-luna/ai"],
};
```

### Health endpoint (`app/api/health/route.ts`, all three apps)
```ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ status: "ok" }, { status: 200 });
}
```
Kept dependency-free (no DB call) so a transient DB blip doesn't cause pods to be killed by the liveness probe. (A deeper `/api/health/ready` that pings the DB may be added for the *readiness* probe as a follow-up.)

### Docker (`docker/Dockerfile`)
Multi-stage, monorepo-aware via Turbo prune:
1. **prune stage** (`node:20-alpine` + turbo): `turbo prune --scope=@e-luna/${APP} --docker` → produces `/out/json` (lockfile subset) and `/out/full` (source subset).
2. **install/build stage**: copy pruned `json`, `pnpm install --frozen-lockfile`, copy pruned `full`, `pnpm --filter @e-luna/${APP} build` (runs `prisma generate` via the db package if needed + `next build`).
3. **runtime stage** (`node:20-alpine`, non-root user): copy `.next/standalone`, `.next/static`, and `public`; `EXPOSE 3000`; `CMD ["node", "apps/${APP}/server.js"]`. (App port normalized to 3000 in-container; the host port differences are dev-only.)

`ARG APP` selects the app; the pipeline builds three images.

### Bicep modules
- **network.bicep** — VNet + subnets (AKS nodes, PostgreSQL private endpoint).
- **acr.bicep** — ACR (Standard), admin user disabled; AKS granted `AcrPull` via managed identity.
- **aks.bicep** — AKS: system pool + autoscaling user pool (min/max nodes), `oidcIssuerProfile` + `workloadIdentity` enabled, `azureKeyvaultSecretsProvider` add-on on, availability zones [1,2,3].
- **postgres.bicep** — PostgreSQL Flexible Server, zone-redundant HA, private DNS zone + private endpoint, `luna` database created.
- **keyvault.bicep** — Key Vault (RBAC mode); secret placeholders documented (values set out-of-band).
- **params/uae-north.bicepparam** — `location = 'uaenorth'`, sizes, node counts.

### Helm chart (`infra/helm/luna`)
`values.yaml` lists the three apps with `{ name, host, image, replicas, resources }`. Templates loop over apps to render, per app: `Deployment` (with liveness `/api/health`, readiness `/api/health`, Key Vault CSI volume + `SecretProviderClass` ref, resource requests/limits), `Service` (ClusterIP :80→:3000), `Ingress` (host + TLS secret), `HorizontalPodAutoscaler` (CPU target), `PodDisruptionBudget` (minAvailable: 1). A `SecretProviderClass` maps Key Vault secrets → mounted env.

### cert-manager `ClusterIssuer`
Let's Encrypt (production + staging) ACME issuer using the ingress-nginx HTTP-01 solver.

---

## CI/CD (`.github/workflows/azure-deploy.yml`)

Trigger: `workflow_dispatch` + push to `main` (after existing lint/typecheck CI).
1. `azure/login@v2` via **OIDC** federated credentials (secrets: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` — IDs, not passwords).
2. For each app: `az acr build --registry <acr> --image e-luna/<app>:${{ github.sha }} --build-arg APP=<app> -f docker/Dockerfile .` (builds server-side in ACR).
3. `az aks get-credentials`, then `helm upgrade --install luna infra/helm/luna --set images.tag=${{ github.sha }}`. Rolling update honors readiness probes + PDB → zero downtime.

Infra provisioning is a **separate, one-time/manual step** (documented), not run on each app deploy:
```
az deployment sub create --location uaenorth --template-file infra/bicep/main.bicep --parameters infra/bicep/params/uae-north.bicepparam
```

**Secrets flow:** values live only in Key Vault (operator populates: Clerk publishable/secret keys, `DATABASE_URL`, `ANTHROPIC_API_KEY`, Cloudinary, Stripe/Tabby/Tamara). Pods read them via the CSI driver + workload identity. GitHub↔Azure uses OIDC federation — no long-lived cloud keys anywhere.

---

## Error Handling & Resilience (24/7)

- **Probes:** liveness + readiness on `/api/health`; a failed readiness pulls a pod out of rotation without killing it.
- **PodDisruptionBudget** `minAvailable: 1` per app — node drains/upgrades can't take a service fully offline.
- **≥2 replicas across availability zones** — survives a node or zone failure.
- **HPA** scales on CPU to absorb load spikes.
- **PostgreSQL zone-redundant HA** — automatic failover to standby.
- **Rolling deploys** with `maxUnavailable: 0` so a bad image never removes healthy pods before the new ones are ready.
- **Image immutability** — SHA-tagged images enable instant `helm rollback`.

---

## Testing / Verification

No unit-test suite (consistent with the repo). Verification splits by environment:

**In-repo (I run where tooling exists):**
- `docker build --build-arg APP=<app> -f docker/Dockerfile .` succeeds and the image starts and answers `/api/health`.
- `helm lint infra/helm/luna` and `helm template infra/helm/luna` render valid manifests (optionally `kubeconform`).
- `az bicep build --file infra/bicep/main.bicep` compiles (if the Azure CLI/Bicep is available); otherwise the Bicep is written to Microsoft's documented schema.
- Existing repo CI stays green after the `next.config` + health-route additions (`pnpm lint`, `pnpm --filter "@e-luna/*" exec tsc --noEmit`).

**Operator (documented in `docs/deployment/azure-aks.md`):**
- Provision via Bicep → populate Key Vault → run deploy pipeline → point DNS at the ingress IP → `curl https://luna.ae/api/health` (and the vendor/admin hosts) returns `200 {"status":"ok"}` → confirm ≥2 healthy pods per app. Only then is the service genuinely running 24/7.

---

## Decisions Log (for this spec)

| Decision | Choice | Reason |
|----------|--------|--------|
| Cloud + orchestrator | Azure AKS, UAE North | User requirement; UAE North has full AKS + PostgreSQL Flexible Server |
| IaC tool | Bicep | Azure-native, no state backend, aligns with Azure Landing Zones; region-agnostic |
| Container output | Next.js `output: "standalone"` | Small runtime images, no dev deps at runtime |
| Monorepo Docker | `turbo prune --docker` per app | Isolated, cache-friendly image contexts |
| Ingress/TLS | ingress-nginx + cert-manager (Let's Encrypt) | Portable, well-supported on AKS |
| Secrets | Key Vault + CSI driver + workload identity | No secrets in repo/GitHub; Azure-native |
| CI auth | GitHub OIDC federation | No long-lived cloud credentials |
| Vercel | Kept (additive) | Non-destructive; Azure is an added target |
