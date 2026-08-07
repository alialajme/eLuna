# Deploying e-Luna to Azure AKS (UAE North)

This runbook takes the repo's infra-as-code and stands the platform up on Azure. Vercel remains the default target; this is the Azure path.

## Prerequisites
- Azure subscription with Contributor + User Access Administrator on the target subscription
- `az` CLI (with the `bicep` extension), `kubectl`, `helm` v3 installed locally
- A registered DNS zone for `luna.ae` (and subdomains `sell.` / `ops.`)

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
az aks get-credentials -g eluna-rg -n eluna-aks
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
KV=eluna-kv
az keyvault secret set --vault-name $KV --name DATABASE_URL --value "postgresql://lunaadmin:${PG_ADMIN_PASSWORD}@<postgresFqdn>:5432/luna?sslmode=require"
az keyvault secret set --vault-name $KV --name ANTHROPIC_API_KEY --value "<key>"
az keyvault secret set --vault-name $KV --name NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY --value "<key>"
az keyvault secret set --vault-name $KV --name CLERK_SECRET_KEY --value "<key>"
az keyvault secret set --vault-name $KV --name CLOUDINARY_URL --value "<url>"
```
Create a workload identity + federated credential for the app service account (`luna-workload-identity` in the `luna` namespace) and grant it `Key Vault Secrets User` on the vault; put its client id into `infra/helm/luna/values.yaml` (`keyVault.userAssignedIdentityClientId`) and set `keyVault.tenantId`.

## 4. Database schema
```bash
DATABASE_URL="postgresql://lunaadmin:${PG_ADMIN_PASSWORD}@<postgresFqdn>:5432/luna?sslmode=require" \
  pnpm --filter "@e-luna/db" exec prisma migrate deploy
```

## 5. Configure GitHub -> Azure (OIDC)
Create an app registration with a federated credential for this repo, grant it AcrPush + AKS access, and set repo secrets `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`. Update `values.yaml` `image.registry` to the real `acrLoginServer`.

## 6. Deploy
Trigger the **Azure Deploy** GitHub Action (`workflow_dispatch`), or locally:
```bash
for app in customer vendor admin; do
  az acr build --registry elunaacr --image e-luna/$app:manual --build-arg APP=$app --file docker/Dockerfile .
done
helm upgrade --install luna infra/helm/luna -n luna --create-namespace --set image.tag=manual --wait
```

## 7. DNS + verify 24/7
- Point `luna.ae`, `sell.luna.ae`, `ops.luna.ae` A-records at the ingress-nginx public IP (`kubectl get svc -n ingress-nginx`).
- Smoke test:
```bash
curl -sf https://luna.ae/api/health      # {"status":"ok"}
curl -sf https://sell.luna.ae/api/health
curl -sf https://ops.luna.ae/api/health
kubectl get pods -n luna                  # >=2 Ready per app across zones
```

## Rollback
```bash
helm rollback luna            # previous release
# or pin a known-good SHA:
helm upgrade luna infra/helm/luna -n luna --set image.tag=<good-sha>
```

## 24/7 resilience recap
- >=2 replicas/app across availability zones; PodDisruptionBudget minAvailable 1; HPA 2->6 on CPU.
- Rolling updates with `maxUnavailable: 0`; SHA-tagged images for instant rollback.
- PostgreSQL Flexible Server zone-redundant HA with automatic failover.
- Liveness/readiness probes on `/api/health`.
