# e-Luna — Disaster Recovery

Honest statement of **configured** capability vs **planned** targets. Where a target is not yet
backed by configuration it is marked ⬜ so no capability is overstated (per hardening principle §60).

## Current configuration (from `infra/bicep`)
- **Database:** Azure PostgreSQL Flexible Server, PG 16, `Standard_D2ds_v5` (General Purpose),
  128 GB, **High Availability = Zone-Redundant**, private (VNet-integrated, private DNS).
- **Backups:** ⬜ retention/geo-redundancy **not explicitly set in Bicep** → Azure defaults apply
  (7-day point-in-time restore, locally-redundant backup). See action items.
- **Secrets:** Azure Key Vault (soft-delete on by default) accessed via CSI + workload identity.
- **Images:** Azure Container Registry.
- **Infra as code:** Bicep (`main.bicep` + modules) — environment recreatable from source.

## RPO / RTO

| | Target | Backed by config today |
|---|--------|------------------------|
| **RPO** (data loss) | ≤ 5 min | 🟡 PITR ≈ up to 5 min with default WAL PITR; a regional loss would lose data without geo-redundant backup (⬜) |
| **RTO** (time to restore) | ≤ 1 hour (single region) | 🟡 Zone-redundant HA covers a zone failure automatically; full-region rebuild is manual (untested) |

## Scenarios & procedures

### 1. Application pod / node failure
AKS reschedules; PDB keeps ≥1 replica; HPA scales. No action.

### 2. Availability-zone failure
Zone-redundant Postgres HA fails over automatically; AKS reschedules to healthy zones. No data loss.

### 3. Accidental data corruption / bad deploy
1. Roll back the app: `helm rollback luna <REV>` (or redeploy previous image tag).
2. If data is corrupted: restore the DB to a point-in-time before the incident (Azure Portal/CLI PITR
   → new server), repoint `DATABASE_URL` (Key Vault secret), restart pods.

### 4. Full region loss ⬜
Not yet automatically recoverable — requires geo-redundant backup (action item) then: recreate infra
from Bicep in the paired region, restore DB from geo-backup, restore Key Vault, push images to a
regional ACR, deploy Helm.

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
- ⬜ Set explicit `backupRetentionDays` (e.g. 14–35) and `geoRedundantBackup: Enabled` in
  `postgres.bicep`.
- ⬜ Add a dedicated migration Job (avoid replicas racing schema changes) and document forward/rollback.
- ⬜ Perform and document a real restore drill; replace the 🟡 estimates with measured values.
- ⬜ Define a paired-region runbook if cross-region DR is required.
