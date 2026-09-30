# Deploying AYVANA to Azure AKS (UAE North)

This runbook takes the repo's infra-as-code and stands the platform up on Azure. Vercel remains the default target; this is the Azure path.

## Prerequisites
- Azure subscription with Contributor + User Access Administrator on the target subscription
- `az` CLI (with the `bicep` extension), `kubectl`, `helm` v3 installed locally
- A registered DNS zone for `ayvana.ae` (and subdomains `sell.` / `ops.`)

## 1. Provision infrastructure (one-time)
```bash
export PG_ADMIN_PASSWORD='<strong-password>'
az deployment sub create \
  --location uaenorth \
  --template-file infra/bicep/main.bicep \
  --parameters infra/bicep/params/uae-north.bicepparam \
  --parameters pgAdminPassword="$PG_ADMIN_PASSWORD"
```
Capture the outputs: `acrLoginServer`, `aksName`, `keyVaultName`, `postgresFqdn`.

## 2. Cluster add-ons (one-time)
```bash
az aks get-credentials -g ayvana-rg -n ayvana-aks
# ingress-nginx
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm install ingress-nginx ingress-nginx/ingress-nginx -n ingress-nginx --create-namespace
# cert-manager
helm repo add jetstack https://charts.jetstack.io
helm install cert-manager jetstack/cert-manager -n cert-manager --create-namespace --set crds.enabled=true
kubectl apply -f infra/k8s/cert-manager/cluster-issuer.yaml
```

## 3. Populate secrets (Key Vault)
```bash
KV=ayvana-kv
az keyvault secret set --vault-name $KV --name DATABASE_URL --value "postgresql://ayvanaadmin:${PG_ADMIN_PASSWORD}@<postgresFqdn>:5432/ayvana?sslmode=require"
az keyvault secret set --vault-name $KV --name ANTHROPIC_API_KEY --value "<key>"
az keyvault secret set --vault-name $KV --name NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY --value "<key>"
az keyvault secret set --vault-name $KV --name CLERK_SECRET_KEY --value "<key>"
az keyvault secret set --vault-name $KV --name CLOUDINARY_URL --value "<url>"
```
Create a workload identity + federated credential for the app service account (`ayvana-workload-identity` in the `ayvana` namespace) and grant it `Key Vault Secrets User` on the vault; put its client id into `infra/helm/ayvana/values.yaml` (`keyVault.userAssignedIdentityClientId`) and set `keyVault.tenantId`.

## 4. Database schema
```bash
DATABASE_URL="postgresql://ayvanaadmin:${PG_ADMIN_PASSWORD}@<postgresFqdn>:5432/ayvana?sslmode=require" \
  pnpm --filter "@ayvana/db" exec prisma migrate deploy
```

## 5. Configure GitHub -> Azure (OIDC)
Create an app registration with a federated credential for this repo, grant it AcrPush + AKS access, and set repo secrets `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`. Update `values.yaml` `image.registry` to the real `acrLoginServer`.

## Build-time environment contract
`next build` evaluates route modules while prerendering, so these must be present
**at build time** (not just runtime), or the build fails:

| Var | Why the build needs it |
|-----|------------------------|
| `ANTHROPIC_API_KEY` | The AI config throws at import; AI API routes are evaluated during "collect page data". |
| `DATABASE_URL` | Prisma client initialization. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Statically-prerendered pages (e.g. customer `/`) mount the Clerk provider, which requires a publishable key "in production". Inlined into the client bundle. |
| `CLERK_SECRET_KEY` | Clerk server initialization. |

CI's **Production build** job (`.github/workflows/ci.yml`) supplies dummy,
presence-only values so every PR is gated on a real `turbo build`. The Docker
image build (`docker/Dockerfile` → `next build`) needs the same values available
during the image build; supply non-secret placeholders as build args/env for the
`NEXT_PUBLIC_*` value (it is baked into the client bundle) and inject real secrets
at runtime from Key Vault.

## 6. Deploy
Trigger the **Azure Deploy** GitHub Action (`workflow_dispatch`), or locally:
```bash
for app in customer vendor admin; do
  az acr build --registry ayvanaacr --image e-ayvana/$app:manual --build-arg APP=$app --file docker/Dockerfile .
done
helm upgrade --install ayvana infra/helm/ayvana -n ayvana --create-namespace --set image.tag=manual --wait
```

## 7. DNS + verify 24/7
- Point `ayvana.ae`, `sell.ayvana.ae`, `ops.ayvana.ae` A-records at the ingress-nginx public IP (`kubectl get svc -n ingress-nginx`).
- Smoke test:
```bash
curl -sf https://ayvana.ae/api/health      # {"status":"ok"}
curl -sf https://sell.ayvana.ae/api/health
curl -sf https://ops.ayvana.ae/api/health
kubectl get pods -n ayvana                  # >=2 Ready per app across zones
```

## Rollback
```bash
helm rollback ayvana            # previous release
# or pin a known-good SHA:
helm upgrade ayvana infra/helm/ayvana -n ayvana --set image.tag=<good-sha>
```

## 24/7 resilience recap
- >=2 replicas/app across availability zones; PodDisruptionBudget minAvailable 1; HPA 2->6 on CPU.
- Rolling updates with `maxUnavailable: 0`; SHA-tagged images for instant rollback.
- PostgreSQL Flexible Server zone-redundant HA with automatic failover.
- Liveness/readiness probes on `/api/health`.
