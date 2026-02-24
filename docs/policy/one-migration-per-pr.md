# Policy: one DB migration per PR

## Rule

If a pull request adds migration files under:

- `drizzle/migrations/`

...then it must add **no more than one** migration file.

Only newly added files count toward the limit. Modified or deleted migration files do not trip this gate.

## Why

- Makes review and rollback simpler — one migration per PR means one clear change to examine or revert.
- Prevents accidental Drizzle multiple-head situations that arise when two migrations branch from the same parent.
- Keeps CI and deploy failures easier to diagnose.

## Common exceptions and guidance

- If you need multiple schema changes, consolidate them into a single migration. Run `make db-generate` once after all schema edits are complete.
- If you ran `make db-generate` multiple times and now have multiple SQL files, delete the extras and regenerate from the final schema state.
- If the changes are genuinely independent, split them into separate PRs.

## CI enforcement

CI runs `scripts/ci/one_migration_per_pr.sh` on pull request events and fails if more than one migration file is added.

The script:
1. Detects newly added files using `git diff --diff-filter=A` between base and head SHA.
2. Filters for files matching `drizzle/migrations/<timestamp>_<slug>.sql`.
3. Fails if the count exceeds 1.

On failure, the script prints the detected migration files and instructions for consolidating them.

## This policy complements, not replaces, the migration integrity gate

The one-migration-per-PR policy is a lightweight guardrail on quantity. CI also runs a migration integrity gate (`make db-migrate`) that validates the migrations apply cleanly against a fresh D1 database. Both checks must pass.
