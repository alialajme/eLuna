# ADR-0007 — Single-executor database migrations

**Status:** Accepted (baseline landed + migrate-deploy cutover done; cluster validation + `enabled:true` pending)

## Context
Schema changes had been applied with `prisma db push` (no committed migration history). In a
multi-replica AKS deployment, letting every app replica apply schema on startup would race and can
corrupt/deadlock. `db push` is also not safe for reviewed, reversible production change management.

## Decision
Run schema changes as a **single executor**: a dedicated `migrator` image (`docker/Dockerfile.migrate`)
invoked by a Helm **pre-install/pre-upgrade hook Job** (`templates/migrate-job.yaml`) that runs once,
before the app Deployments roll, with its own Key Vault-sourced `DATABASE_URL`. The Job is
`migration.enabled: false` by default until it is validated against a cluster.

**Hybrid workflow (decided 2026-11-03):** keep `prisma db push` for **local dev** (fast iteration,
no migration churn); use a committed **migration history** for **staging/production** deploys. The
Job command (`.Values.migration.command`) and the migrator image default now run
`prisma migrate deploy`.

## Baseline
`prisma/migrations/0_init/migration.sql` is the initial baseline — the full current schema generated
offline with `prisma migrate diff --from-empty --to-schema-datamodel` (54 tables, 42 enums, **zero
DROP** — pure CREATE, non-destructive). Validated locally: `migrate deploy` onto an empty DB yields a
schema with **no drift** vs. the datamodel; and an existing db-push DB adopts it via
`migrate resolve --applied 0_init` → status "up to date" → `migrate deploy` is a no-op.

## Runbook
- **Fresh database:** `migrate deploy` creates everything from `0_init`. No extra step.
- **Existing db-push database (dev `eluna`, or a db-pushed staging/prod):** baseline it ONCE before the
  first deploy — `DATABASE_URL=… pnpm --filter @ayvana/db exec prisma migrate resolve --applied 0_init`.
  This records the baseline as applied **without** re-running its SQL, so nothing is dropped/recreated.
- **Local dev:** keep `pnpm db:push`. Migrations are a deploy concern, not a dev-loop concern.
- **Adding a future migration (when the schema changes):** generate it from the committed history, review
  the SQL, and commit it —
  `pnpm --filter @ayvana/db exec prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/<N>_<name>/migration.sql`.
  Use expand/migrate/contract for breaking changes.

## Alternatives
- **Migrate on app startup:** rejected — replicas race; couples rollout to migration.
- **Manual out-of-band migration:** error-prone, not reproducible.
- **Abandon db push entirely (migrate dev for every change):** rejected — the dev loop stays on
  `db push` per the hybrid decision; migrations are generated at deploy-prep time.

## Consequences
- No replica races schema changes; migration failure blocks the rollout (hook fails) rather than
  half-migrating live pods.
- The migration history can drift ahead of/behind the schema between deploys (dev keeps db-pushing); the
  deploy-prep step above reconciles it. (No hard CI drift-guard — it would fight the db-push dev loop.)
- **Remaining follow-ups (need a cluster — unavailable in this env):** (1) run the one-time
  `resolve --applied 0_init` on the real prod DB; (2) validate the hook Job + CSI secret ordering in a
  cluster; (3) set `migration.enabled: true`.
