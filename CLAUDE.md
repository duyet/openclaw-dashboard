# OpenClaw Mission Control — AI Context

## Architecture

- No separate backend. All API logic lives in `src/app/api/v1/` as Next.js Route Handlers.
- Deployed to Cloudflare Pages with edge runtime. Do not use Node.js built-ins in API routes or middleware.
- Path alias: `@/` maps to `src/`.
- Gateway connectivity checks happen client-side (browser WebSocket), NOT through API routes, because gateways may be on internal Tailscale networks unreachable from the CF edge.

## Package Manager

Always use `bun`. Never use `npm`, `yarn`, or `pnpm`.

## Database

- Cloudflare D1 (SQLite) via Drizzle ORM.
- Schema: `src/lib/db/schema.ts` (29 tables).
- Migrations: `drizzle/migrations/` — never hand-edit migration files.
- Workflow: edit schema → `make db-generate` → `make db-migrate` → commit both schema and migration.

## Authentication

Dual-mode auth controlled by `NEXT_PUBLIC_AUTH_MODE`:
- `local` — token-based (min 50 chars), stored in `sessionStorage`. No external service.
- `clerk` — [Clerk.dev](https://clerk.dev) for production multi-tenant auth.

Clerk-specific code lives in `src/auth/clerk/`. Abstraction layer in `src/auth/clerk.tsx` wraps all Clerk hooks/components so they degrade gracefully in local mode.

### Middleware (CRITICAL — do NOT change the pattern)

Top-level ternary on a build-time constant to tree-shake Clerk in local mode:

```typescript
export default process.env.NEXT_PUBLIC_AUTH_MODE === "local"
  ? (_request) => NextResponse.next()
  : clerkMiddleware(async (auth, request) => { ... });
```

`clerkMiddleware()` validates `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` at module init. If absent, it crashes the entire edge worker. The ternary lets webpack eliminate the Clerk runtime when not needed.

### Environment variable rules

- `NEXT_PUBLIC_*` vars are inlined at **BUILD TIME** by webpack. Setting them in `wrangler.toml [vars]` has no effect.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` → must be present when `bun run cf:build` runs (GitHub secret, injected in CI).
- `CLERK_SECRET_KEY` → runtime-only, read by API routes via `process.env`. Set as a **Cloudflare Pages secret** (not in wrangler.toml, not in CI build env).

### Secrets setup

| Secret | Where to set | Type | Why |
|--------|-------------|------|-----|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | **GitHub Actions secret** | Build-time | Inlined by webpack during `cf:build` |
| `CLERK_SECRET_KEY` | **Cloudflare Pages secret** | Runtime | Read by edge API routes for JWT verification |
| `CLOUDFLARE_API_TOKEN` | **GitHub Actions secret** | CI | Wrangler deploy permission |
| `CLOUDFLARE_ACCOUNT_ID` | **GitHub Actions secret** | CI | Wrangler deploy target |

### Clerk integration patterns

- Uses `clerkMiddleware()` from `@clerk/nextjs/server` (NOT deprecated `authMiddleware()`).
- Server-side JWT verification via `verifyToken()` with dynamic import to prevent init crashes.
- Client-side token: `window.Clerk.session.getToken()` in `src/api/mutator.ts`.
- Public routes: `/`, `/sign-in(.*)`, `/sign-up(.*)`, health checks, webhook ingest.

## Common Commands

| Command | What it does |
|---------|-------------|
| `make dev` | Next.js dev server (port 3000) |
| `make cf-dev` | Cloudflare Pages dev with real bindings |
| `make lint` | Biome lint |
| `make fix` | Biome auto-fix lint + format |
| `make format` | Biome format (write) |
| `bun fmt` | Biome format --write . |
| `bun fix` | Biome check --write . |
| `make typecheck` | TypeScript check (no emit) |
| `make test` | Vitest unit tests |
| `make e2e` | Cypress E2E |
| `make check` | lint + typecheck + test + build |
| `make db-generate` | Generate Drizzle migration from schema changes |
| `make db-migrate` | Apply migrations to local D1 |
| `make deploy` | Build + deploy to Cloudflare Pages |

## Commit Style

Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.

## Linter / Formatter

Biome (not ESLint / Prettier). Config: `biome.json`.

- `bun fmt` — format all files
- `bun fix` — fix lint issues + format in one pass
- `bun lint` — lint only (no writes)

ESLint and Prettier have been removed from the project.

## Gateway Integration

- Gateways use OpenClaw WebSocket RPC over WebSocket. Client: `src/lib/services/gateway-rpc.ts`.
- Gateway status checks are client-side (browser WebSocket in `src/lib/gateway-form.ts`).
- API routes that interact with saved gateways perform WebSocket RPC from the edge worker.
- `GatewayConfig: { url: string, token: string | null }`

## Cloudflare Pages Specifics

- Dynamic pages with `[param]`: must have `export const runtime = "edge"`.
- Static pages (no params): do NOT need `runtime` export — pre-rendered at build time.
- API routes: all need `export const runtime = "edge"`.
- Pages with `"use client"`: directive FIRST, then `runtime` export.
- Build: `bunx @cloudflare/next-on-pages`.

## Project Structure

```
src/app/                        — pages and API routes
src/app/api/v1/                 — all API endpoints
src/lib/                        — shared utilities, auth, db, services
src/lib/db/schema.ts            — Drizzle schema (29 tables)
src/lib/services/gateway-rpc.ts — WebSocket JSON-RPC client
src/components/                 — React components (atoms, molecules, organisms, ui)
```

## What NOT To Do

- Do not create a separate backend service — use Route Handlers in `src/app/api/v1/`.
- Do not use `npm`, `yarn`, or `pnpm` — always `bun`.
- Do not use Node.js built-ins (`fs`, `crypto`, `path`) in edge routes or middleware.
- Do not hand-edit files in `drizzle/migrations/` — always use `make db-generate`.
- Do not use `any` in TypeScript without a `// TODO: type this` comment.
- Do not add `console.log` in production code — use structured logging.
- Do not run `eslint` or `prettier` — use `bun fix` / `bun fmt` instead.
