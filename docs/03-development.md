# Development workflow

## Prerequisites

- **bun** >= 1.3 — the only supported package manager for this project
- **Node.js** >= 18 — required by some tooling (wrangler, drizzle-kit)
- **wrangler** — installed as a dev dependency via bun; no global install needed
- A Cloudflare account with the D1 database and KV namespace already provisioned (needed for `make cf-dev`; not required for `make dev`)

## Local setup

```bash
git clone https://github.com/duyet/openclaw-dashboard
cd openclaw-dashboard
bun install
cp .env.example .env.local   # set NEXT_PUBLIC_AUTH_MODE and other vars
make dev                     # starts Next.js dev server on port 3000
```

`make dev` runs a standard Next.js dev server. It does not use real Cloudflare bindings — the D1 and KV bindings are not available. This mode is suitable for UI development.

## Cloudflare Pages dev with real bindings

```bash
make cf-dev
```

This runs `wrangler pages dev .vercel/output/static --d1 DB --kv KV` against a pre-built output directory. It gives you real D1 and KV bindings from your local Cloudflare account.

You must run `make build` (or `bun run cf:build`) before `make cf-dev` to produce the `.vercel/output/static` directory.

```bash
bun run cf:build   # build for Cloudflare Pages
make cf-dev        # serve with real D1 + KV bindings
```

## Environment variables

Copy `.env.example` to `.env.local` and set at minimum:

```
NEXT_PUBLIC_AUTH_MODE=local
LOCAL_AUTH_TOKEN=<token of at least 50 characters>
```

See [Production notes](./production/README.md) for the full environment variable reference.

## Database migration workflow

The schema is the single source of truth. Never hand-edit files in `drizzle/migrations/`.

1. Edit `src/lib/db/schema.ts` with your schema changes.
2. Generate the migration file:
   ```bash
   make db-generate
   ```
   This runs `drizzle-kit generate` and writes a new SQL file to `drizzle/migrations/`.
3. Apply the migration to your local D1 database:
   ```bash
   make db-migrate
   ```
   This runs `wrangler d1 migrations apply openclaw-mc --local`.
4. Commit both the updated schema (`src/lib/db/schema.ts`) and the generated migration file (`drizzle/migrations/<timestamp>_<slug>.sql`).

CI enforces that a pull request adds at most one migration file. See [One migration per PR](./policy/one-migration-per-pr.md).

## Linting and formatting

The project uses [Biome](https://biomejs.dev/) for both linting and formatting. ESLint and Prettier are not used.

| Command | What it does |
|---|---|
| `bun fmt` | Format all files (writes in place) |
| `bun fix` | Fix lint issues and format in one pass |
| `bun lint` | Lint only (no writes) |
| `make lint` | Same as `bun lint` |
| `make fix` | Same as `bun fix` |
| `make format` | Same as `bun fmt` |

Biome config lives in `biome.json`.

## Running tests

### Unit tests (Vitest)

```bash
make test
# or
bun run test
```

Runs all `*.test.ts` / `*.test.tsx` files with Vitest. Test files are co-located with the source they test. Coverage is collected automatically (`--coverage` flag) and written to `coverage/`.

### End-to-end tests (Cypress)

```bash
make e2e
# or
bun run e2e
```

Cypress specs live in `cypress/e2e/`. E2E tests were written targeting Clerk auth mode. In CI, only the smoke spec (`activity_smoke.cy.ts`) runs because CI uses `NEXT_PUBLIC_AUTH_MODE=local`.

To open the interactive Cypress test runner:

```bash
bun run e2e:open
```

## Running all checks

```bash
make check
```

This runs lint, typecheck, unit tests, and the Cloudflare Pages build in sequence. This mirrors what CI runs on every pull request.

## TypeScript

```bash
make typecheck
# or
bunx tsc -p tsconfig.json --noEmit
```

## Common commands reference

| Command | What it does |
|---|---|
| `make dev` | Next.js dev server on port 3000 |
| `make cf-dev` | Cloudflare Pages dev with real D1/KV bindings |
| `make build` | Build for Cloudflare Pages |
| `make lint` | Biome lint |
| `make fix` | Biome auto-fix lint + format |
| `make format` | Biome format (write) |
| `make typecheck` | TypeScript type check (no emit) |
| `make test` | Vitest unit tests |
| `make e2e` | Cypress E2E tests |
| `make check` | lint + typecheck + test + build |
| `make db-generate` | Generate Drizzle migration from schema changes |
| `make db-migrate` | Apply migrations to local D1 |
| `make deploy` | Build and deploy to Cloudflare Pages |
