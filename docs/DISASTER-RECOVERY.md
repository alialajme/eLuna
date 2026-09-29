# e-Luna — Disaster Recovery

Honest statement of **configured** capability vs **planned** targets. Where a target is not yet
backed by configuration it is marked ⬜ so no capability is overstated (per hardening principle §60).

## Current configuration (from `infra/bicep`)
- **Database:** Azure PostgreSQL Flexible Server, PG 16, `Standard_D2ds_v5` (General Purpose),
  128 GB, **High Availability = Zone-Redundant**, private (VNet-integrated, private DNS).
- **Backups:** ✅ **35-day point-in-time restore + geo-redundant backup** now set explicitly in
  `postgres.bicep` (`backup.backupRetentionDays: 35`, `geoRedundantBackup: Enabled`). Applies on the
  next `az deployment` of the Postgres module.
- **Secrets:** Azure Key Vault (soft-delete on by default) accessed via CSI + workload identity.
- **Images:** Azure Container Registry.
- **Infra as code:** Bicep (`main.bicep` + modules) — environment recreatable from source.

## RPO / RTO

| | Target | Backed by config today |
|---|--------|------------------------|
| **RPO** (data loss) | ≤ 5 min | ✅ PITR ≈ up to 5 min; regional loss now covered by geo-redundant backup |
| **RTO** (time to restore) | ≤ 1 hour (single region) | 🟡 Zone-redundant HA covers a zone failure automatically; full-region rebuild is scripted-via-Bicep but still manual (drill outstanding) |

## Scenarios & procedures

### 1. Application pod / node failure
AKS reschedules; PDB keeps ≥1 replica; HPA scales. No action.

### 2. Availability-zone failure
Zone-redundant Postgres HA fails over automatically; AKS reschedules to healthy zones. No data loss.

### 3. Accidental data corruption / bad deploy
1. Roll back the app: `helm rollback luna <REV>` (or redeploy previous image tag).
2. If data is corrupted: restore the DB to a point-in-time before the incident (Azure Portal/CLI PITR
   → new server), repoint `DATABASE_URL` (Key Vault secret), restart pods.

### 4. Full region loss
Geo-redundant backup is now enabled. Recovery: recreate infra from Bicep in the paired region,
geo-restore the DB, restore Key Vault, push images to a regional ACR, deploy Helm. The paired-region
runbook + a live drill remain outstanding (action items).

### 5. Key Vault secret loss
Recover soft-deleted secrets/vault within the retention window (Azure default). Rotate any exposed
secret and update the Key Vault entry (apps read via CSI, no redeploy of images needed).

### 6. ACR loss
Re-run the CI image build (`azure-deploy.yml`) to repopulate; images are reproducible from source +
`pnpm-lock`.

## Restore drill (must be exercised before go-live)
1. Provision a scratch Postgres via Bicep.
2. PITR-restore a recent backup into it.
3. Point a staging deploy at it, run readiness (`/api/health/ready`) and a smoke checkout.
4. Record actual RTO/RPO observed and update the table above.

## Action items (to meet the stated targets)
- ✅ Set explicit `backupRetentionDays` (35) and `geoRedundantBackup: Enabled` in `postgres.bicep`.
- 🟡 Dedicated migration Job added (Helm pre-upgrade hook, single executor — ADR-0007); enable +
  validate against a cluster and cut over to `migrate deploy` with a committed migration history.
- ⬜ Perform and document a real restore drill; replace the 🟡 estimates with measured values.
- ⬜ Define a paired-region runbook if cross-region DR is required.
