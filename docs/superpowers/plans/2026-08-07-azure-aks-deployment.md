# Azure + AKS (UAE North) Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add infrastructure-as-code to the repo so the three Next.js apps can run on Azure AKS (UAE North) 24/7 — containers, Bicep, Helm, health endpoints, an Azure deploy pipeline, and a runbook. Additive; Vercel configs untouched.

**Architecture:** Each app becomes a standalone Next.js container (built via a turbo-prune multi-stage Dockerfile), pushed to ACR, deployed to AKS by a Helm chart with ingress+TLS, HPA, PDB, and `/api/health` probes. Bicep provisions AKS + ACR + PostgreSQL Flexible Server + Key Vault. Secrets come from Key Vault via the CSI driver; GitHub↔Azure uses OIDC.

**Tech Stack:** Docker (Node 20 alpine), Next.js standalone output, Azure Bicep, Helm, ingress-nginx, cert-manager, GitHub Actions.

---

## Tooling note (verification reality)

`docker`, `az`, `bicep`, `helm`, `kubectl` are **not installed in this dev environment**. Therefore:
- **Task 1 (app code)** is fully verified by the repo CI: `pnpm lint` + `pnpm --filter "@e-luna/*" exec tsc --noEmit`.
- **IaC tasks (Docker/Bicep/Helm/workflow/runbook)** are verified by (a) authoring to the documented Azure/Helm/Bicep schemas, and (b) a lightweight syntax check with `node` for any JSON and, where a YAML parser is available, YAML. The real `docker build` / `helm lint` / `az bicep build` / live deploy are the operator's steps, documented in the runbook.

Every task ends by committing. Commit from the repo root: `/Users/alialajme/Projects/Luna/e-luna`.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/{customer,vendor,admin}/next.config.ts` | Modify | Add `output: "standalone"` |
| `apps/{customer,vendor,admin}/app/api/health/route.ts` | Create | Probe endpoint (200 ok) |
| `docker/Dockerfile` | Create | Parameterized multi-stage build |
| `docker/.dockerignore` | Create | Trim build context |
| `infra/bicep/main.bicep` | Create | Subscription-scope orchestration |
| `infra/bicep/modules/{network,acr,aks,postgres,keyvault}.bicep` | Create | Azure resources |
| `infra/bicep/params/uae-north.bicepparam` | Create | Region + sizing params |
| `infra/helm/luna/Chart.yaml` | Create | Helm chart metadata |
| `infra/helm/luna/values.yaml` | Create | App list, images, hosts, resources |
| `infra/helm/luna/templates/*.yaml` | Create | Deployment/Service/Ingress/HPA/PDB/SecretProviderClass |
| `infra/k8s/cert-manager/cluster-issuer.yaml` | Create | Let's Encrypt issuer |
| `.github/workflows/azure-deploy.yml` | Create | Build+push+deploy pipeline |
| `docs/deployment/azure-aks.md` | Create | Runbook |

---

## Task 1: App containerization prep (standalone output + health endpoint)

**Files:**
- Modify: `apps/customer/next.config.ts`, `apps/vendor/next.config.ts`, `apps/admin/next.config.ts`
- Create: `apps/customer/app/api/health/route.ts`, `apps/vendor/app/api/health/route.ts`, `apps/admin/app/api/health/route.ts`

- [ ] **Step 1: Add `output: "standalone"` to each app's `next.config.ts`**

For all three files, change the config object to (keep the existing `transpilePackages` list exactly):
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@e-luna/ui", "@e-luna/auth", "@e-luna/db", "@e-luna/ai"],
};

export default nextConfig;
```

- [ ] **Step 2: Create the health route in each app**

Same content in all three (`apps/customer/app/api/health/route.ts`, `apps/vendor/app/api/health/route.ts`, `apps/admin/app/api/health/route.ts`):
```ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ status: "ok" }, { status: 200 });
}
```

- [ ] **Step 3: Verify — repo lint + typecheck**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && pnpm lint 2>&1 | tail -4
cd /Users/alialajme/Projects/Luna/e-luna && pnpm --filter "@e-luna/*" exec tsc --noEmit; echo "EXIT: $?"
```
Expected: lint `Tasks: 3 successful, 3 total`; tsc `EXIT: 0`.

- [ ] **Step 4: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add "apps/customer/next.config.ts" "apps/vendor/next.config.ts" "apps/admin/next.config.ts" "apps/customer/app/api/health/route.ts" "apps/vendor/app/api/health/route.ts" "apps/admin/app/api/health/route.ts" && git commit -m "feat(deploy): standalone output + /api/health for container probes"
```

---

## Task 2: Docker build

**Files:**
- Create: `docker/Dockerfile`
- Create: `docker/.dockerignore`

- [ ] **Step 1: Create `docker/Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1

# Which workspace app to build: customer | vendor | admin
ARG APP=customer

# ---- base: pnpm + turbo ----
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat && corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

# ---- prune: isolate the target app's workspace subset ----
FROM base AS pruner
ARG APP
RUN pnpm add -g turbo@2
COPY . .
RUN turbo prune "@e-luna/${APP}" --docker

# ---- installer: install deps + build ----
FROM base AS installer
ARG APP
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
# Prisma client must be generated before the Next.js build (db package)
RUN pnpm --filter "@e-luna/db" exec prisma generate
RUN pnpm --filter "@e-luna/${APP}" build

# ---- runner: minimal runtime with standalone output ----
FROM node:20-alpine AS runner
ARG APP
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Next.js standalone output for a monorepo places the server at apps/<app>/server.js
COPY --from=installer --chown=nextjs:nodejs /app/apps/${APP}/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /app/apps/${APP}/.next/static ./apps/${APP}/.next/static
COPY --from=installer --chown=nextjs:nodejs /app/apps/${APP}/public ./apps/${APP}/public

USER nextjs
EXPOSE 3000
# APP is baked into the start path via a shell so the ARG expands at build time
ENV APP=${APP}
CMD ["sh", "-c", "node apps/${APP}/server.js"]
```

- [ ] **Step 2: Create `docker/.dockerignore`**

```
**/node_modules
**/.next
**/.turbo
**/dist
.git
.github
docs
**/*.md
**/.env*
infra
```

- [ ] **Step 3: Verify — Dockerfile parses / images resolvable (best-effort)**

```bash
command -v docker >/dev/null 2>&1 && echo "docker present — run: docker build --build-arg APP=customer -f docker/Dockerfile ." || echo "docker NOT installed here — build is an operator step (see runbook)"
test -f /Users/alialajme/Projects/Luna/e-luna/docker/Dockerfile && test -f /Users/alialajme/Projects/Luna/e-luna/docker/.dockerignore && echo "files present"
```
Expected: "files present" (and the docker note). No `docker build` is expected to run in this environment.

- [ ] **Step 4: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add docker/Dockerfile docker/.dockerignore && git commit -m "feat(deploy): turbo-prune multi-stage Dockerfile for all three apps"
```

---

## Task 3: Bicep IaC

**Files:**
- Create: `infra/bicep/main.bicep`
- Create: `infra/bicep/modules/network.bicep`, `acr.bicep`, `aks.bicep`, `postgres.bicep`, `keyvault.bicep`
- Create: `infra/bicep/params/uae-north.bicepparam`

- [ ] **Step 1: Create `infra/bicep/main.bicep`**

```bicep
targetScope = 'subscription'

@description('Azure region — UAE North for full AKS + PostgreSQL Flexible Server support')
param location string = 'uaenorth'

@description('Base name prefix for resources')
param prefix string = 'eluna'

@description('PostgreSQL admin login')
param pgAdminUser string = 'lunaadmin'

@description('PostgreSQL admin password')
@secure()
param pgAdminPassword string

var rgName = '${prefix}-rg'
var tags = { project: 'e-luna', managedBy: 'bicep' }

resource rg 'Microsoft.Resources/resourceGroups@2023-07-01' = {
  name: rgName
  location: location
  tags: tags
}

module network 'modules/network.bicep' = {
  scope: rg
  name: 'network'
  params: { prefix: prefix, location: location, tags: tags }
}

module acr 'modules/acr.bicep' = {
  scope: rg
  name: 'acr'
  params: { prefix: prefix, location: location, tags: tags }
}

module aks 'modules/aks.bicep' = {
  scope: rg
  name: 'aks'
  params: {
    prefix: prefix
    location: location
    tags: tags
    nodeSubnetId: network.outputs.nodeSubnetId
    acrId: acr.outputs.acrId
  }
}

module keyvault 'modules/keyvault.bicep' = {
  scope: rg
  name: 'keyvault'
  params: { prefix: prefix, location: location, tags: tags }
}

module postgres 'modules/postgres.bicep' = {
  scope: rg
  name: 'postgres'
  params: {
    prefix: prefix
    location: location
    tags: tags
    delegatedSubnetId: network.outputs.pgSubnetId
    adminUser: pgAdminUser
    adminPassword: pgAdminPassword
  }
}

output acrLoginServer string = acr.outputs.loginServer
output aksName string = aks.outputs.aksName
output keyVaultName string = keyvault.outputs.keyVaultName
output postgresFqdn string = postgres.outputs.fqdn
```

- [ ] **Step 2: Create `infra/bicep/modules/network.bicep`**

```bicep
param prefix string
param location string
param tags object

resource vnet 'Microsoft.Network/virtualNetworks@2023-09-01' = {
  name: '${prefix}-vnet'
  location: location
  tags: tags
  properties: {
    addressSpace: { addressPrefixes: ['10.20.0.0/16'] }
    subnets: [
      {
        name: 'aks-nodes'
        properties: { addressPrefix: '10.20.0.0/20' }
      }
      {
        name: 'postgres'
        properties: {
          addressPrefix: '10.20.16.0/24'
          delegations: [
            {
              name: 'pgDelegation'
              properties: { serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers' }
            }
          ]
        }
      }
    ]
  }
}

output nodeSubnetId string = vnet.properties.subnets[0].id
output pgSubnetId string = vnet.properties.subnets[1].id
output vnetId string = vnet.id
```

- [ ] **Step 3: Create `infra/bicep/modules/acr.bicep`**

```bicep
param prefix string
param location string
param tags object

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: '${prefix}acr'
  location: location
  tags: tags
  sku: { name: 'Standard' }
  properties: { adminUserEnabled: false }
}

output acrId string = acr.id
output loginServer string = acr.properties.loginServer
```

- [ ] **Step 4: Create `infra/bicep/modules/aks.bicep`**

```bicep
param prefix string
param location string
param tags object
param nodeSubnetId string
param acrId string

resource aks 'Microsoft.ContainerService/managedClusters@2024-02-01' = {
  name: '${prefix}-aks'
  location: location
  tags: tags
  identity: { type: 'SystemAssigned' }
  properties: {
    dnsPrefix: '${prefix}-aks'
    enableRBAC: true
    oidcIssuerProfile: { enabled: true }
    securityProfile: {
      workloadIdentity: { enabled: true }
    }
    addonProfiles: {
      azureKeyvaultSecretsProvider: {
        enabled: true
        config: { enableSecretRotation: 'true' }
      }
    }
    agentPoolProfiles: [
      {
        name: 'system'
        mode: 'System'
        count: 2
        vmSize: 'Standard_D2s_v5'
        vnetSubnetID: nodeSubnetId
        availabilityZones: ['1', '2', '3']
        type: 'VirtualMachineScaleSets'
      }
      {
        name: 'user'
        mode: 'User'
        vmSize: 'Standard_D4s_v5'
        vnetSubnetID: nodeSubnetId
        availabilityZones: ['1', '2', '3']
        type: 'VirtualMachineScaleSets'
        enableAutoScaling: true
        minCount: 2
        maxCount: 6
      }
    ]
    networkProfile: {
      networkPlugin: 'azure'
      loadBalancerSku: 'standard'
    }
  }
}

// Grant AKS kubelet identity AcrPull on the registry
resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acrId, aks.id, 'AcrPull')
  scope: resourceGroup()
  properties: {
    // AcrPull built-in role
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
    principalId: aks.properties.identityProfile.kubeletidentity.objectId
    principalType: 'ServicePrincipal'
  }
}

output aksName string = aks.name
output oidcIssuerUrl string = aks.properties.oidcIssuerProfile.issuerURL
```

- [ ] **Step 5: Create `infra/bicep/modules/postgres.bicep`**

```bicep
param prefix string
param location string
param tags object
param delegatedSubnetId string
param adminUser string
@secure()
param adminPassword string

resource pgDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: '${prefix}.private.postgres.database.azure.com'
  location: 'global'
  tags: tags
}

resource pg 'Microsoft.DBforPostgreSQL/flexibleServers@2023-06-01-preview' = {
  name: '${prefix}-pg'
  location: location
  tags: tags
  sku: { name: 'Standard_D2ds_v5', tier: 'GeneralPurpose' }
  properties: {
    version: '16'
    administratorLogin: adminUser
    administratorLoginPassword: adminPassword
    storage: { storageSizeGB: 128 }
    highAvailability: { mode: 'ZoneRedundant' }
    network: {
      delegatedSubnetResourceId: delegatedSubnetId
      privateDnsZoneArmResourceId: pgDnsZone.id
    }
  }
}

resource lunaDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-06-01-preview' = {
  parent: pg
  name: 'luna'
  properties: { charset: 'UTF8', collation: 'en_US.utf8' }
}

output fqdn string = pg.properties.fullyQualifiedDomainName
```

- [ ] **Step 6: Create `infra/bicep/modules/keyvault.bicep`**

```bicep
param prefix string
param location string
param tags object

resource kv 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: '${prefix}-kv'
  location: location
  tags: tags
  properties: {
    sku: { family: 'A', name: 'standard' }
    tenantId: tenant().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
  }
}

output keyVaultName string = kv.name
output keyVaultUri string = kv.properties.vaultUri
```

- [ ] **Step 7: Create `infra/bicep/params/uae-north.bicepparam`**

```bicep
using '../main.bicep'

param location = 'uaenorth'
param prefix = 'eluna'
param pgAdminUser = 'lunaadmin'
// Provide at deploy time: az deployment sub create ... --parameters pgAdminPassword=<secret>
param pgAdminPassword = readEnvironmentVariable('PG_ADMIN_PASSWORD', '')
```

- [ ] **Step 8: Verify — files present + bicep build (best-effort)**

```bash
command -v az >/dev/null 2>&1 && echo "az present — run: az bicep build --file infra/bicep/main.bicep" || echo "az/bicep NOT installed here — bicep build is an operator step"
ls /Users/alialajme/Projects/Luna/e-luna/infra/bicep/main.bicep /Users/alialajme/Projects/Luna/e-luna/infra/bicep/modules/*.bicep /Users/alialajme/Projects/Luna/e-luna/infra/bicep/params/uae-north.bicepparam
```
Expected: all six module/main files + the param file listed.

- [ ] **Step 9: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add infra/bicep && git commit -m "feat(deploy): Bicep IaC — AKS, ACR, PostgreSQL Flexible Server, Key Vault (UAE North)"
```

---

## Task 4: Helm chart

**Files:**
- Create: `infra/helm/luna/Chart.yaml`
- Create: `infra/helm/luna/values.yaml`
- Create: `infra/helm/luna/templates/_helpers.tpl`
- Create: `infra/helm/luna/templates/app.yaml`
- Create: `infra/helm/luna/templates/secretproviderclass.yaml`

- [ ] **Step 1: Create `infra/helm/luna/Chart.yaml`**

```yaml
apiVersion: v2
name: luna
description: e-Luna platform — customer, vendor, admin apps on AKS
type: application
version: 0.1.0
appVersion: "1.0.0"
```

- [ ] **Step 2: Create `infra/helm/luna/values.yaml`**

```yaml
# Global image settings
image:
  registry: elunaacr.azurecr.io
  repository: e-luna
  tag: latest          # overridden by CI with the git SHA
  pullPolicy: IfNotPresent

# Key Vault (Secrets Store CSI) settings
keyVault:
  name: eluna-kv
  tenantId: "00000000-0000-0000-0000-000000000000"   # set per tenant
  userAssignedIdentityClientId: ""                     # workload identity client id

# Secrets to mount as env (name in Key Vault == env var name)
secrets:
  - DATABASE_URL
  - ANTHROPIC_API_KEY
  - NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  - CLERK_SECRET_KEY
  - CLOUDINARY_URL

ingress:
  className: nginx
  clusterIssuer: letsencrypt-prod

# Per-app configuration
apps:
  - name: customer
    host: luna.ae
    replicas: 2
  - name: vendor
    host: sell.luna.ae
    replicas: 2
  - name: admin
    host: ops.luna.ae
    replicas: 2

resources:
  requests:
    cpu: 250m
    memory: 512Mi
  limits:
    cpu: "1"
    memory: 1Gi

autoscaling:
  minReplicas: 2
  maxReplicas: 6
  targetCPUUtilizationPercentage: 70
```

- [ ] **Step 3: Create `infra/helm/luna/templates/_helpers.tpl`**

```yaml
{{- define "luna.image" -}}
{{ .root.Values.image.registry }}/{{ .root.Values.image.repository }}/{{ .app.name }}:{{ .root.Values.image.tag }}
{{- end -}}
```

- [ ] **Step 4: Create `infra/helm/luna/templates/app.yaml`**

Renders Deployment + Service + Ingress + HPA + PDB for each app in `.Values.apps`.
```yaml
{{- range $app := .Values.apps }}
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ $app.name }}
  labels: { app: {{ $app.name }} }
spec:
  replicas: {{ $app.replicas }}
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0
      maxSurge: 1
  selector:
    matchLabels: { app: {{ $app.name }} }
  template:
    metadata:
      labels:
        app: {{ $app.name }}
        azure.workload.identity/use: "true"
    spec:
      containers:
        - name: {{ $app.name }}
          image: {{ include "luna.image" (dict "root" $ "app" $app) }}
          imagePullPolicy: {{ $.Values.image.pullPolicy }}
          ports:
            - containerPort: 3000
          livenessProbe:
            httpGet: { path: /api/health, port: 3000 }
            initialDelaySeconds: 15
            periodSeconds: 20
          readinessProbe:
            httpGet: { path: /api/health, port: 3000 }
            initialDelaySeconds: 5
            periodSeconds: 10
          resources: {{ toYaml $.Values.resources | nindent 12 }}
          volumeMounts:
            - name: secrets-store
              mountPath: /mnt/secrets-store
              readOnly: true
          envFrom:
            - secretRef: { name: {{ $app.name }}-secrets }
      volumes:
        - name: secrets-store
          csi:
            driver: secrets-store.csi.k8s.io
            readOnly: true
            volumeAttributes: { secretProviderClass: luna-spc }
---
apiVersion: v1
kind: Service
metadata:
  name: {{ $app.name }}
spec:
  selector: { app: {{ $app.name }} }
  ports:
    - port: 80
      targetPort: 3000
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ $app.name }}
  annotations:
    cert-manager.io/cluster-issuer: {{ $.Values.ingress.clusterIssuer }}
spec:
  ingressClassName: {{ $.Values.ingress.className }}
  tls:
    - hosts: [{{ $app.host | quote }}]
      secretName: {{ $app.name }}-tls
  rules:
    - host: {{ $app.host | quote }}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: {{ $app.name }}
                port: { number: 80 }
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: {{ $app.name }}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: {{ $app.name }}
  minReplicas: {{ $.Values.autoscaling.minReplicas }}
  maxReplicas: {{ $.Values.autoscaling.maxReplicas }}
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: {{ $.Values.autoscaling.targetCPUUtilizationPercentage }}
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: {{ $app.name }}
spec:
  minAvailable: 1
  selector:
    matchLabels: { app: {{ $app.name }} }
{{- end }}
```

- [ ] **Step 5: Create `infra/helm/luna/templates/secretproviderclass.yaml`**

```yaml
apiVersion: secrets-store.csi.x-k8s.io/v1
kind: SecretProviderClass
metadata:
  name: luna-spc
spec:
  provider: azure
  parameters:
    usePodIdentity: "false"
    useVMManagedIdentity: "false"
    clientID: {{ .Values.keyVault.userAssignedIdentityClientId | quote }}
    keyvaultName: {{ .Values.keyVault.name | quote }}
    tenantId: {{ .Values.keyVault.tenantId | quote }}
    objects: |
      array:
        {{- range .Values.secrets }}
        - |
          objectName: {{ . }}
          objectType: secret
        {{- end }}
  secretObjects:
    {{- range .Values.apps }}
    - secretName: {{ .name }}-secrets
      type: Opaque
      data:
        {{- range $.Values.secrets }}
        - objectName: {{ . }}
          key: {{ . }}
        {{- end }}
    {{- end }}
```

- [ ] **Step 6: Verify — files present + helm lint (best-effort)**

```bash
command -v helm >/dev/null 2>&1 && echo "helm present — run: helm lint infra/helm/luna && helm template infra/helm/luna" || echo "helm NOT installed here — helm lint/template is an operator step"
ls /Users/alialajme/Projects/Luna/e-luna/infra/helm/luna/Chart.yaml /Users/alialajme/Projects/Luna/e-luna/infra/helm/luna/values.yaml /Users/alialajme/Projects/Luna/e-luna/infra/helm/luna/templates/*.tpl /Users/alialajme/Projects/Luna/e-luna/infra/helm/luna/templates/*.yaml
```
Expected: Chart.yaml, values.yaml, `_helpers.tpl`, `app.yaml`, `secretproviderclass.yaml` all listed.

- [ ] **Step 7: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add infra/helm && git commit -m "feat(deploy): Helm chart — 3 apps with ingress/TLS, HPA, PDB, Key Vault CSI"
```

---

## Task 5: cert-manager ClusterIssuer

**Files:**
- Create: `infra/k8s/cert-manager/cluster-issuer.yaml`

- [ ] **Step 1: Create `infra/k8s/cert-manager/cluster-issuer.yaml`**

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: ops@luna.ae
    privateKeySecretRef:
      name: letsencrypt-prod-account-key
    solvers:
      - http01:
          ingress:
            ingressClassName: nginx
---
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-staging
spec:
  acme:
    server: https://acme-staging-v02.api.letsencrypt.org/directory
    email: ops@luna.ae
    privateKeySecretRef:
      name: letsencrypt-staging-account-key
    solvers:
      - http01:
          ingress:
            ingressClassName: nginx
```

- [ ] **Step 2: Verify file present**

```bash
ls /Users/alialajme/Projects/Luna/e-luna/infra/k8s/cert-manager/cluster-issuer.yaml && echo present
```
Expected: `present`.

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add infra/k8s && git commit -m "feat(deploy): cert-manager Let's Encrypt ClusterIssuers (prod + staging)"
```

---

## Task 6: Azure deploy pipeline

**Files:**
- Create: `.github/workflows/azure-deploy.yml`

- [ ] **Step 1: Create `.github/workflows/azure-deploy.yml`**

```yaml
name: Azure Deploy

on:
  workflow_dispatch:
    inputs:
      tag:
        description: "Image tag to deploy (defaults to commit SHA)"
        required: false

permissions:
  id-token: write   # OIDC federation to Azure
  contents: read

env:
  ACR_NAME: elunaacr
  AKS_NAME: eluna-aks
  RESOURCE_GROUP: eluna-rg
  IMAGE_REPO: e-luna

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Resolve image tag
        id: tag
        run: echo "value=${{ github.event.inputs.tag || github.sha }}" >> "$GITHUB_OUTPUT"

      - name: Azure login (OIDC)
        uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

      - name: Build & push images (ACR)
        run: |
          for app in customer vendor admin; do
            az acr build \
              --registry "$ACR_NAME" \
              --image "$IMAGE_REPO/$app:${{ steps.tag.outputs.value }}" \
              --build-arg APP=$app \
              --file docker/Dockerfile .
          done

      - name: Get AKS credentials
        run: az aks get-credentials --resource-group "$RESOURCE_GROUP" --name "$AKS_NAME" --overwrite-existing

      - name: Helm deploy
        run: |
          helm upgrade --install luna infra/helm/luna \
            --namespace luna --create-namespace \
            --set image.tag=${{ steps.tag.outputs.value }} \
            --wait --timeout 10m
```

- [ ] **Step 2: Verify — YAML parses (best-effort) + file present**

```bash
ls /Users/alialajme/Projects/Luna/e-luna/.github/workflows/azure-deploy.yml && echo present
node -e "const fs=require('fs');const s=fs.readFileSync('/Users/alialajme/Projects/Luna/e-luna/.github/workflows/azure-deploy.yml','utf8');if(!s.includes('azure/login@v2'))process.exit(1);console.log('sane')"
```
Expected: `present` then `sane`.

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add .github/workflows/azure-deploy.yml && git commit -m "feat(deploy): Azure deploy pipeline — OIDC, ACR build, Helm upgrade"
```

---

## Task 7: Runbook

**Files:**
- Create: `docs/deployment/azure-aks.md`

- [ ] **Step 1: Create `docs/deployment/azure-aks.md`**

````markdown
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
Create a workload identity + federated credential for the app service account and grant it `Key Vault Secrets User` on the vault; put its client id into `infra/helm/luna/values.yaml` (`keyVault.userAssignedIdentityClientId`) and set `keyVault.tenantId`.

## 4. Database schema
```bash
DATABASE_URL="postgresql://lunaadmin:${PG_ADMIN_PASSWORD}@<postgresFqdn>:5432/luna?sslmode=require" \
  pnpm --filter "@e-luna/db" exec prisma migrate deploy
```

## 5. Configure GitHub → Azure (OIDC)
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
kubectl get pods -n luna                  # ≥2 Ready per app across zones
```

## Rollback
```bash
helm rollback luna            # previous release
# or pin a known-good SHA:
helm upgrade luna infra/helm/luna -n luna --set image.tag=<good-sha>
```

## 24/7 resilience recap
- ≥2 replicas/app across availability zones; PodDisruptionBudget minAvailable 1; HPA 2→6 on CPU.
- Rolling updates with `maxUnavailable: 0`; SHA-tagged images for instant rollback.
- PostgreSQL Flexible Server zone-redundant HA with automatic failover.
- Liveness/readiness probes on `/api/health`.
````

- [ ] **Step 2: Verify file present**

```bash
ls /Users/alialajme/Projects/Luna/e-luna/docs/deployment/azure-aks.md && echo present
```
Expected: `present`.

- [ ] **Step 3: Commit**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git add docs/deployment/azure-aks.md && git commit -m "docs(deploy): Azure AKS deployment runbook"
```

---

## Task 8: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Repo CI still green (app changes didn't break anything)**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && pnpm lint 2>&1 | tail -4
cd /Users/alialajme/Projects/Luna/e-luna && pnpm --filter "@e-luna/*" exec tsc --noEmit; echo "EXIT: $?"
```
Expected: lint `3 successful, 3 total`; tsc `EXIT: 0`.

- [ ] **Step 2: All infra artifacts present**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && ls \
  docker/Dockerfile docker/.dockerignore \
  infra/bicep/main.bicep infra/bicep/modules/aks.bicep infra/bicep/modules/postgres.bicep \
  infra/helm/luna/Chart.yaml infra/helm/luna/templates/app.yaml \
  infra/k8s/cert-manager/cluster-issuer.yaml \
  .github/workflows/azure-deploy.yml docs/deployment/azure-aks.md \
  apps/customer/app/api/health/route.ts
```
Expected: every path listed (no "No such file").

- [ ] **Step 3: Confirm git log**

```bash
cd /Users/alialajme/Projects/Luna/e-luna && git log --oneline -8
```
Expected commits (newest first):
- docs(deploy): Azure AKS deployment runbook
- feat(deploy): Azure deploy pipeline — OIDC, ACR build, Helm upgrade
- feat(deploy): cert-manager Let's Encrypt ClusterIssuers (prod + staging)
- feat(deploy): Helm chart — 3 apps with ingress/TLS, HPA, PDB, Key Vault CSI
- feat(deploy): Bicep IaC — AKS, ACR, PostgreSQL Flexible Server, Key Vault (UAE North)
- feat(deploy): turbo-prune multi-stage Dockerfile for all three apps
- feat(deploy): standalone output + /api/health for container probes

Report the actual SHAs and note that live Azure provisioning/deploy is the operator's next step (runbook).
