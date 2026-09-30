# AYVANA — Production-Hardening Merge Runbook

How to land the 10 hardening PRs safely. Both stacks branch off `main` and, per `git merge-tree`,
**merge with zero conflicts** — including the two files touched by both stacks
(`.github/workflows/azure-deploy.yml`, `infra/helm/ayvana/values.yaml`; changes are on disjoint
lines/sections). Verify again at merge time, but no manual resolution is expected.

## The two stacks

**Code stack** (substance — merge first):

| Order | PR | Branch | Scope |
|:-----:|----|--------|-------|
| 1 | #1 | `hardening/p0-financial-correctness` | inventory/wallet/COD/money |
| 2 | #2 | `hardening/security` | authz audit, audit log, headers, rate limit, supplier deploy, health |
| 3 | #3 | `hardening/observability` | structured logging + correlation IDs |
| 4 | #4 | `hardening/reliability` | error model, resilience, outbox |
| 5 | #8 | `hardening/redis-waf` | Redis rate limiter + Front Door/WAF |

**Docs + infra stack** (merge second):

| Order | PR | Branch | Scope |
|:-----:|----|--------|-------|
| 1 | #5 | `hardening/docs` | architecture, ADRs, threat model, DR, readiness, final review |
| 2 | #6 | `hardening/ci-security` | CodeQL + Trivy workflow |
| 3 | #7 | `hardening/dr-migrations` | Postgres backups + migration Job |
| 4 | #9 | `hardening/docs-sync` | readiness/review sync for #8 |
| 5 | #10 | `hardening/test-plan` | Phase 7 test plan |

(#11 is this runbook — mergeable any time, independent.)

Each PR's base is the previous branch in its stack. **GitHub auto-retargets a child PR to `main` when
its base PR merges** (with branch deletion), so you always merge the current bottom PR against `main`.

## Pre-merge checklist
- [ ] CI green on the bottom PR of the stack you're about to merge.
- [ ] You are ready to apply an **additive** DB schema change on deploy (new tables/enums —
      `WalletTransaction`, `LedgerEntry`, `AuditLog`, `OutboxEvent`; nullable columns). Non-destructive.
- [ ] The **demo shim** stays local: it is stashed on your `main` working tree as `stash@{0}`
      ("demo-shim …"). It is NOT in any PR — do not commit it. Restore locally later with
      `git stash pop` if you want the keyless demo back.

## Merge sequence

### Step A — code stack (bottom-up)
```bash
gh pr merge 1 --merge --delete-branch   # → main auto-retargets #2
gh pr merge 2 --merge --delete-branch   # → retargets #3
gh pr merge 3 --merge --delete-branch   # → retargets #4
gh pr merge 4 --merge --delete-branch   # → retargets #8
gh pr merge 8 --merge --delete-branch
```
After each merge, wait for CI on the newly-retargeted PR to go green before the next.

### Step B — verify `main` after the code stack
```bash
git checkout main && git pull
pnpm install --frozen-lockfile
pnpm --filter @ayvana/db db:generate
pnpm --filter "@ayvana/*" exec tsc --noEmit          # expect: 0
pnpm lint                                             # expect: clean (pre-existing <img> warns only)
node scripts/check-deploy-parity.mjs                  # expect: 4/4 apps
# tests need a Postgres; CI runs them, or locally against ayvana_test:
pnpm --filter @ayvana/db --filter @ayvana/auth --filter @ayvana/observability test
```

### Step C — docs + infra stack (bottom-up)
```bash
gh pr merge 5 --merge --delete-branch
gh pr merge 6 --merge --delete-branch
gh pr merge 7 --merge --delete-branch
gh pr merge 9 --merge --delete-branch
gh pr merge 10 --merge --delete-branch
```
The overlapping files (`azure-deploy.yml`, `values.yaml`) merge cleanly (verified). If GitHub ever
reports a conflict, it's a trivial additive one — the app-build loop / apps list from #2 plus the
migrator step / migration section from #7; keep both.

> Merge style: `--merge` preserves the per-PR commit detail. `--squash` is equally fine (one commit
> per PR) if you prefer a flatter history. Avoid rebasing the stacks — it invalidates the verified
> merge-tree.

## Post-merge operational steps (deploy time)
1. **Apply schema** to each environment before/at rollout. Preferred: enable the single-executor
   migration Job (ADR-0007) — set `migration.enabled: true` after validating it in a cluster; it runs
   as a pre-upgrade hook. Interim: `pnpm --filter @ayvana/db exec prisma db push` against the target
   `DATABASE_URL` (additive, safe).
2. **Triage the first security scan.** CodeQL + Trivy (`security.yml`) run on push to `main` — review
   the Security tab and remediate CRITICAL/HIGH.
3. **Enable opt-in infra after cluster validation:**
   - Migration Job: `migration.enabled=true` (needs the migrator image built — the deploy workflow
     builds it).
   - Front Door/WAF: deploy Bicep with `deployFrontDoor=true ingressHostName=<ingress FQDN>` as a
     second step once the ingress LoadBalancer exists.
   - Redis rate limiting: provision Azure Cache for Redis, add `REDIS_URL` to Key Vault; the AI
     endpoints switch to it automatically (in-memory fallback until then).
4. **DR:** the next Postgres deploy applies 35-day PITR + geo-redundant backup. Run a restore drill
   (see `DISASTER-RECOVERY.md`) and record measured RPO/RTO.

## Rollback
- **A PR after merge:** `gh pr revert <num>` (or revert the merge commit) — all changes are additive
  and revertible; new tables can be left in place (unused) or dropped separately.
- **A bad rollout (not code):** `helm rollback ayvana <REV>` / redeploy the previous image tag. Schema
  additions are backward-compatible, so an app rollback does not require a DB rollback.

## Done when
- Both stacks merged to `main`; CI green on `main`; deploy-parity 4/4.
- Schema applied to target environments; first security-scan run triaged.
- Opt-in infra (migration Job / Front Door / Redis) enabled + validated per environment.
