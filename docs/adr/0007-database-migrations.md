# ADR-0007 — Single-executor database migrations

**Status:** Accepted (mechanism landed; migrate-deploy cutover pending)

## Context
Schema changes have been applied with `prisma db push` (no committed migration history). In a
multi-replica AKS deployment, letting every app replica apply schema on startup would race and can
corrupt/deadlock. `db push` is also not safe for reviewed, reversible production change management.

## Decision
Run schema changes as a **single executor**: a dedicated `migrator` image (`docker/Dockerfile.migrate`)
invoked by a Helm **pre-install/pre-upgrade hook Job** (`templates/migrate-job.yaml`) that runs once,
before the app Deployments roll, with its own Key Vault-sourced `DATABASE_URL`. The Job is
`migration.enabled: false` by default until it is validated against a cluster.

The Job command is a Helm value. It currently runs `prisma db push --skip-generate` (matches today's
mechanism) and flips to `prisma migrate deploy` once a committed migration history exists.

## Alternatives
- **Migrate on app startup:** rejected — replicas race; couples rollout to migration.
- **Manual out-of-band migration:** error-prone, not reproducible.

## Consequences
- No replica races schema changes; migration failure blocks the rollout (hook fails) rather than
  half-migrating live pods.
- **Follow-ups:** (1) generate the initial Prisma migration baseline and switch `migration.command`
  to `migrate deploy`; (2) validate the hook Job + CSI secret ordering in a cluster; (3) then set
  `migration.enabled: true`. Use expand/migrate/contract for breaking changes.
