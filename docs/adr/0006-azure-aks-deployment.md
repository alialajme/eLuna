# ADR-0006 — Azure AKS deployment with Key Vault + workload identity

**Status:** Accepted

## Context
Production target is Azure (UAE North for data residency). Need secure secret handling, HA database,
private networking, and repeatable infra.

## Decision
- **Compute:** AKS; one Helm chart renders per-app Deployment/Service/Ingress/HPA/PDB from a
  `values.apps` list (all four apps). Multi-stage non-root Dockerfile; pod/container `securityContext`
  (`runAsNonRoot`, drop ALL caps, no privilege escalation, seccomp RuntimeDefault).
- **Secrets:** Azure Key Vault via the Secrets Store CSI driver + workload identity (no secrets in
  images or the repo). CI deploys via OIDC federation.
- **Data:** PostgreSQL Flexible Server, private, Zone-Redundant HA.
- **Infra as code:** Bicep (AKS, ACR, network, Key Vault, Postgres).
- **Health:** split liveness/readiness probes; readiness checks DB reachability.

## Alternatives
- **Vercel (current dev host):** fine for now; Azure AKS chosen for data residency, private
  networking and Key Vault at production.
- **Secrets as plain K8s Secrets:** rejected in favor of Key Vault CSI + workload identity.

## Consequences
- A CI deploy-parity guard prevents any app being omitted from build/Helm/health.
- Follow-ups (see DISASTER-RECOVERY / PRODUCTION-READINESS): explicit backup retention +
  geo-redundant backup, Front Door/WAF outer layer, container/image scanning, a dedicated migration
  Job (avoid replicas racing `db push`/migrate).
