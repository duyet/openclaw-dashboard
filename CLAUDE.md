# OpenClaw Mission Control — AI Context

## Architecture

- **No separate backend.** All API logic lives in `src/app/api/v1/` as Next.js Route Handlers.
- Deployed to **Cloudflare Pages** with edge runtime. Do not use Node.js built-ins (fs, path, etc.) in API routes or middleware.
- Path alias: `@/` maps to `src/`.

## Package Manager

Always use **bun**. Never use `npm`, `yarn`, or `pnpm`.

```bash
bun install          # install deps
bun run <script>     # run package.json script
bunx <tool>          # run binary
```

## Database

- **Cloudflare D1** (SQLite) via **Drizzle ORM**
- Schema: `src/lib/db/schema.ts`
- Migrations: `drizzle/migrations/` — **never hand-edit migration files**
- Workflow: edit schema → `make db-generate` → `make db-migrate` → commit both schema and migration

## Authentication

Dual-mode auth controlled by `NEXT_PUBLIC_AUTH_MODE`:
- `local` — token-based, no external service (for dev/self-hosted)
- `clerk` — Clerk.dev (for production)

Always check `NEXT_PUBLIC_AUTH_MODE` before using Clerk APIs. Clerk-specific code lives in `src/auth/clerk/`.

## Common Commands

| Command | What it does |
|---------|-------------|
| `make dev` | Next.js dev server (port 3000) |
| `make cf-dev` | Cloudflare Pages dev with real bindings |
| `make lint` | ESLint |
| `make typecheck` | TypeScript check (no emit) |
| `make test` | Vitest unit tests |
| `make e2e` | Cypress E2E |
| `make check` | lint + typecheck + test + build |
| `make db-generate` | Generate Drizzle migration from schema changes |
| `make db-migrate` | Apply migrations to local D1 |
| `make deploy` | Build + deploy to Cloudflare Pages |

## Commit Style

Use [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` new feature
- `fix:` bug fix
- `chore:` maintenance
- `docs:` documentation
- `refactor:` refactoring without behavior change
- `test:` tests only

## What NOT To Do

- Do not create a separate backend service — use Route Handlers in `src/app/api/v1/`
- Do not use `npm`, `yarn`, or `pnpm` — always `bun`
- Do not use Node.js built-ins (`fs`, `crypto`, `path`) in edge routes or middleware
- Do not hand-edit files in `drizzle/migrations/` — always use `make db-generate`
- Do not use `any` in TypeScript without a `// TODO: type this` comment
- Do not add `console.log` in production code — use structured logging
