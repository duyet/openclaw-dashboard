# OpenClaw Mission Control

Centralized operations and governance platform for AI agents — built on Next.js 15 and Cloudflare's edge runtime.

[![CI](https://github.com/duyet/openclaw-dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/duyet/openclaw-dashboard/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Deployed on Cloudflare Pages](https://img.shields.io/badge/Deployed%20on-Cloudflare%20Pages-F38020?logo=cloudflare)](https://openclaw-mission-control-cqu.pages.dev)

**Live:** https://openclaw-mission-control-cqu.pages.dev

---

## Overview

Mission Control gives operators a single interface for work orchestration, AI agent lifecycle management, approval-driven governance, gateway connectivity, and API-backed automation across multi-tenant organizations.

The system is designed around the constraint that AI agents and openclaw gateways may run on private networks (e.g. behind Tailscale) that are unreachable from the Cloudflare edge. Gateway connectivity checks are therefore performed client-side: the browser opens a WebSocket connection directly to the gateway using WebSocket RPC.

There is no separate backend service. All API logic lives in Next.js Route Handlers under `src/app/api/v1/` and runs on the Cloudflare edge.

---

## Features

| Area | Capabilities |
|------|-------------|
| Dashboard | Aggregate metrics, system health indicators |
| Board management | Boards, board groups, tasks (Kanban), approvals, webhooks, custom fields |
| Project board | Kanban view with per-column task management |
| Agent management | Provision, monitor, and decommission AI agents; heartbeat tracking; board lead designation |
| Gateway management | Register openclaw gateways; client-side WebSocket connectivity check via WebSocket RPC |
| Skills marketplace | Browse, install, and manage skills and skill packs per gateway |
| Approval workflows | Confidence-scored approval queue with rubric breakdowns; approve/reject from the UI |
| Activity feed | Immutable audit trail of agent and task events across boards |
| Organization management | Multi-tenant orgs, member roles, per-board access control, invite tokens |
| Tags | Color-coded tag taxonomy scoped to organizations, applied to tasks |
| Onboarding chat | Guided goal-setting chat that creates a board from a structured conversation |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, edge runtime) |
| Language | TypeScript 5 |
| Hosting | Cloudflare Pages |
| Database | Cloudflare D1 (SQLite) via Drizzle ORM |
| Cache / KV | Cloudflare KV |
| Auth | Clerk (production) or local bearer token (self-hosted) |
| Styling | Tailwind CSS + Radix UI primitives |
| Data fetching | TanStack React Query v5 |
| Tables | TanStack React Table v8 |
| Charts | Recharts |
| Forms / validation | Zod |
| Linting / formatting | Biome v2 |
| Unit tests | Vitest + Testing Library |
| E2E tests | Cypress |
| Package manager | bun |

---

## Quick Start

```bash
git clone https://github.com/duyet/openclaw-dashboard.git
cd openclaw-dashboard
bun install
cp .env.example .env.local
# Edit .env.local — at minimum set NEXT_PUBLIC_AUTH_MODE and LOCAL_AUTH_TOKEN
make dev
```

Open http://localhost:3000.

For local development with real Cloudflare D1 and KV bindings, provision the resources first (see [Cloudflare Resources](#cloudflare-resources)) and then use:

```bash
make cf-dev
```

---

## Environment Variables

Copy `.env.example` to `.env.local` and configure the values for your chosen auth mode and deployment target.

### Auth

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_AUTH_MODE` | Yes | `local` or `clerk` — controls which auth strategy is used |
| `LOCAL_AUTH_TOKEN` | Local mode | Shared bearer token; must be at least 50 characters |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk mode | Clerk publishable key |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | Clerk mode | Post sign-in redirect (e.g. `/boards`) |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_OUT_URL` | Clerk mode | Post sign-out redirect (e.g. `/`) |
| `CLERK_SECRET_KEY` | Clerk mode | Clerk secret key (server-side only) |

### Cloudflare

| Variable | Required | Description |
|----------|----------|-------------|
| `CLOUDFLARE_ACCOUNT_ID` | Deployment | Your Cloudflare account ID |
| `CLOUDFLARE_DATABASE_ID` | Deployment | D1 database ID from `wrangler.toml` |
| `CLOUDFLARE_D1_TOKEN` | Deployment | API token for D1 access |

> `NEXT_PUBLIC_*` variables are inlined at **build time** by Next.js webpack. Setting them in `wrangler.toml [vars]` has no effect on these variables. They must be present in the environment when `bun run cf:build` runs.

---

## Auth Modes

### Local (default, recommended for self-hosted)

No external auth service is required. All requests are authenticated with a single shared bearer token stored in `sessionStorage`.

```env
NEXT_PUBLIC_AUTH_MODE=local
LOCAL_AUTH_TOKEN=your-token-must-be-at-least-fifty-characters-long-here
```

The token must be at least 50 characters. The middleware passes all requests through without Clerk, which eliminates the Clerk SDK entirely from the edge bundle (~174 KB saved).

### Clerk (production multi-tenant)

User authentication is delegated to [Clerk.dev](https://clerk.dev). Users sign in through Clerk's hosted UI and are provisioned into organizations on first login.

```env
NEXT_PUBLIC_AUTH_MODE=clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/boards
NEXT_PUBLIC_CLERK_AFTER_SIGN_OUT_URL=/
CLERK_SECRET_KEY=sk_live_...
```

---

## Development Commands

| Command | Description |
|---------|-------------|
| `make dev` | Next.js dev server on port 3000 |
| `make cf-dev` | Cloudflare Pages dev server with real D1/KV bindings via Wrangler |
| `make build` | Build for Cloudflare Pages (`bunx @cloudflare/next-on-pages`) |
| `make format` | Format all files (Biome) |
| `make format-check` | Check formatting without writing changes |
| `make lint` | Lint only — no writes |
| `make fix` | Auto-fix lint issues and format in one pass |
| `make typecheck` | TypeScript type check (no emit) |
| `make test` | Unit tests with coverage (Vitest) |
| `make e2e` | End-to-end tests (Cypress) |
| `make check` | Full quality gate: lint + typecheck + test + build |
| `make db-generate` | Generate Drizzle migration from schema changes |
| `make db-migrate` | Apply pending migrations to local D1 |
| `make deploy` | Build and deploy to Cloudflare Pages |
| `make docs-lint` | Lint markdown files |
| `make docs-link-check` | Check for broken relative links in docs |
| `make docs-check` | Run all docs quality gates |

> Always use `bun` and the `make` targets above. Do not use `npm`, `yarn`, or `pnpm`.

---

## Database

The database is **Cloudflare D1** (SQLite) managed via **Drizzle ORM**.

- Schema: `src/lib/db/schema.ts` — 29 tables
- Migrations: `drizzle/migrations/` — never hand-edit these files

### Schema overview

| Table group | Tables |
|-------------|--------|
| Identity | `organizations`, `users`, `organization_members`, `organization_invites` |
| Access control | `organization_board_access`, `organization_invite_board_access` |
| Boards | `boards`, `board_groups`, `board_memory`, `board_group_memory`, `board_onboarding_sessions` |
| Agents | `agents` |
| Tasks | `tasks`, `task_dependencies`, `task_fingerprints` |
| Approvals | `approvals`, `approval_task_links` |
| Webhooks | `board_webhooks`, `board_webhook_payloads` |
| Activity | `activity_events` |
| Tags | `tags`, `tag_assignments` |
| Custom fields | `task_custom_field_definitions`, `task_custom_field_values`, `board_task_custom_fields` |
| Skills | `marketplace_skills`, `skill_packs`, `gateway_installed_skills` |
| Gateways | `gateways` |

### Migration workflow

```bash
# 1. Edit src/lib/db/schema.ts
# 2. Generate the migration
make db-generate
# 3. Apply to local D1
make db-migrate
# 4. Commit both schema and migration files
git add src/lib/db/schema.ts drizzle/migrations/
```

Only one migration per pull request is enforced by CI.

---

## API Routes

All API logic is implemented as Next.js Route Handlers in `src/app/api/v1/`. Every route exports `export const runtime = "edge"`.

| Prefix | Resource |
|--------|----------|
| `/api/v1/activity` | Activity feed / audit events |
| `/api/v1/agents` | AI agent lifecycle |
| `/api/v1/approvals` | Approval queue |
| `/api/v1/auth` | Authentication (token exchange, session) |
| `/api/v1/board-groups` | Board group CRUD |
| `/api/v1/boards` | Board CRUD and configuration |
| `/api/v1/custom-fields` | Custom field definitions and values |
| `/api/v1/gateways` | Gateway registration and management |
| `/api/v1/health` | Application health (authenticated) |
| `/api/v1/healthz` | Shallow health check (unauthenticated) |
| `/api/v1/metrics` | Aggregate metrics for the dashboard |
| `/api/v1/organizations` | Organization and membership management |
| `/api/v1/readyz` | Readiness probe |
| `/api/v1/skill-packs` | Skill pack CRUD |
| `/api/v1/skills` | Marketplace skill CRUD |
| `/api/v1/souls` | Agent soul/identity templates |
| `/api/v1/tags` | Tag CRUD |
| `/api/v1/users` | User profile management |
| `/healthz` | Top-level health check (edge, unauthenticated) |

---

## Cloudflare Resources

Before running `make cf-dev` or deploying, provision these resources in your Cloudflare account:

```bash
# Create D1 database
bunx wrangler d1 create openclaw-mc
# Paste the database_id into wrangler.toml [[ d1_databases ]]

# Create KV namespace (production)
bunx wrangler kv namespace create KV
# Paste the id into wrangler.toml [[ kv_namespaces ]] binding = "KV"

# Create KV namespace (preview)
bunx wrangler kv namespace create KV --preview
# Paste the preview_id into wrangler.toml
```

After creating resources, update `wrangler.toml` with the returned IDs, then apply migrations:

```bash
make db-migrate
```

---

## Gateway Integration

OpenClaw gateways expose a **WebSocket RPC** endpoint over WebSocket. Mission Control communicates with gateways to:

- Check connectivity status
- List installed skills
- Dispatch agent provisioning and control commands

Because gateways may run on internal networks (e.g. Tailscale) that are unreachable from the Cloudflare edge, connectivity checks are performed **client-side**: the user's browser opens a WebSocket connection directly to the gateway URL configured in the database. This means no proxy or tunnel is required for the gateway to be usable from Mission Control.

The gateway URL and optional bearer token are stored per-gateway record in the `gateways` table and scoped to an organization.

---

## Project Structure

```
src/
  app/
    api/v1/          # All API Route Handlers (edge runtime)
    dashboard/       # Dashboard page
    boards/          # Board list and detail pages
    project-board/   # Kanban board view
    agents/          # Agent management pages
    gateways/        # Gateway management pages
    skills/          # Skills marketplace pages
    activity/        # Activity feed page
    organization/    # Organization settings, members, invites
    settings/        # User and system settings
    onboarding/      # Onboarding chat flow
    sign-in/         # Authentication pages
  auth/
    clerk/           # Clerk-specific auth helpers
  lib/
    db/
      schema.ts      # Drizzle ORM schema (single source of truth)
    api/             # Typed API client helpers
  components/        # Shared UI components
drizzle/
  migrations/        # Auto-generated migration files (do not hand-edit)
docs/                # Extended architecture and operations guides
cypress/             # Cypress E2E tests
```

---

## CI/CD

CI runs on GitHub Actions on every push and pull request.

### Jobs

| Job | Trigger | Steps |
|-----|---------|-------|
| `check` | All pushes and PRs | Lint, typecheck, unit tests, Cloudflare build, docs quality gates |
| `e2e` | After `check` | Cypress smoke tests (`continue-on-error: true` — full E2E requires Clerk secrets) |
| `deploy` | Push to `main` only | Cloudflare Pages deployment via Wrangler |

### Required secrets

#### GitHub Actions secrets (repository settings)

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Pages:Edit permission |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key — inlined at build time by webpack |

Set these at **https://github.com/duyet/openclaw-dashboard/settings/secrets/actions** or via CLI:

```bash
gh secret set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY -b "pk_test_..."
```

#### Cloudflare Pages secrets (runtime)

| Secret | Description |
|--------|-------------|
| `CLERK_SECRET_KEY` | Clerk secret key — read by edge API routes for JWT verification |

Set via wrangler CLI or the Cloudflare dashboard:

```bash
npx wrangler pages secret put CLERK_SECRET_KEY --project-name=openclaw-mission-control
# Paste your sk_test_... or sk_live_... key when prompted
```

Or via dashboard: **Cloudflare > Pages > openclaw-mission-control > Settings > Environment Variables > Production > Add variable** (encrypted).

> **Why the split?** `NEXT_PUBLIC_*` vars are inlined by webpack at build time — they must be in the CI environment when `cf:build` runs. `CLERK_SECRET_KEY` is a server-only runtime secret read by API routes via `process.env` — it belongs in Cloudflare Pages secrets, not in the build.

### One migration per PR

CI enforces that each pull request introduces at most one migration file. The check runs `scripts/ci/one_migration_per_pr.sh` and fails the build if more than one new migration is detected.

---

## Deployment

Deployment targets **Cloudflare Pages** using `@cloudflare/next-on-pages`.

```bash
make deploy
```

This runs `bunx @cloudflare/next-on-pages` to produce `.vercel/output/static/` and then deploys via `bunx wrangler pages deploy`. D1, KV, and any Queue bindings must be provisioned and referenced in `wrangler.toml` before deploying.

The deployed auth mode is controlled by the `NEXT_PUBLIC_AUTH_MODE` environment variable baked in at build time. The CI deploy job builds with `NEXT_PUBLIC_AUTH_MODE=clerk` and injects `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` from GitHub secrets. The `CLERK_SECRET_KEY` runtime secret must be set separately in Cloudflare Pages (see [Required secrets](#required-secrets)).

---

## Linting and Formatting

This project uses **Biome** (not ESLint or Prettier).

```bash
make fix        # auto-fix lint + format (recommended before committing)
make lint       # lint only
make format     # format only
make typecheck  # TypeScript check
```

Do not run `eslint` or `prettier` — they are not installed.

---

## Contributing

1. Fork the repository and create a branch from `main`.
2. Follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages (`feat:`, `fix:`, `chore:`, etc.).
3. Run `make check` before opening a pull request.
4. Keep migrations to one per PR.

---

## License

MIT — see [`LICENSE`](./LICENSE).
