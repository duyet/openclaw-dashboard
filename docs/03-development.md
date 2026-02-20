# Development workflow

## Migration integrity gate (CI)

CI enforces a migration integrity gate to prevent merge-time schema breakages.

### What it validates

- Drizzle migrations apply cleanly against a fresh Cloudflare D1 (SQLite) database
- The migration graph is consistent — no missing or duplicate migration files
- On migration-relevant PRs, CI also checks that schema changes in `src/lib/db/schema.ts` are accompanied by new migration files

If any of these checks fails, CI fails and the PR is blocked.

### Local reproduction

From repo root:

```bash
make db-migrate
```

This applies all pending Drizzle migrations to the local D1 database.

### Database migration workflow

1. Edit `src/lib/db/schema.ts` with your schema changes
2. Generate the migration file:
   ```bash
   make db-generate
   ```
3. Apply the migration locally:
   ```bash
   make db-migrate
   ```
4. Commit **both** the updated schema and the generated migration file in `drizzle/migrations/`

> **Never hand-edit files in `drizzle/migrations/`** — always use `make db-generate` to regenerate them from the schema.
