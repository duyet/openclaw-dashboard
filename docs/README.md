# OpenClaw Mission Control — Documentation

Mission Control is a Next.js application deployed to Cloudflare Pages that provides a web-based control plane for managing OpenClaw agents, boards, tasks, approvals, and gateways. All API logic runs as Next.js Route Handlers at the Cloudflare edge — there is no separate backend service.

## Sections

| Document | What it covers |
|---|---|
| [Development workflow](./03-development.md) | Local setup, database migrations, linting, testing |
| [Deployment guide](./deployment/README.md) | Cloudflare Pages build and deploy pipeline |
| [Production notes](./production/README.md) | Auth configuration, secrets, health endpoints |
| [Testing guide](./testing/README.md) | Unit tests (Vitest), E2E tests (Cypress), coverage |
| [Coverage policy](./coverage-policy.md) | Coverage tooling and CI artifact upload |
| [Troubleshooting](./troubleshooting/README.md) | Common failure modes and fixes |
| [Gateway WebSocket protocol](./openclaw_gateway_ws.md) | JSON-RPC 2.0 protocol used to communicate with gateways |
| [One migration per PR policy](./policy/one-migration-per-pr.md) | Database migration guardrail enforced in CI |
| [OpenClaw baseline configuration](./openclaw_baseline_config.md) | Reference for the OpenClaw CLI config file |
| [Installer platform support](./installer-support.md) | Platform support matrix for the openclaw install script |

## Stack at a glance

- **Framework**: Next.js 15 (App Router)
- **Runtime**: Cloudflare Pages (edge, `@cloudflare/next-on-pages`)
- **Database**: Cloudflare D1 (SQLite) via Drizzle ORM
- **KV store**: Cloudflare KV
- **Auth**: local token mode (default) or Clerk.dev
- **Package manager**: bun
- **Linter/formatter**: Biome

## Repository layout

```
src/
  app/              Next.js App Router pages and layouts
  app/api/v1/       All API route handlers (edge runtime)
  auth/             Auth utilities for local and Clerk modes
  components/       Shared React components
  lib/              Core utilities, DB schema, services
  lib/db/schema.ts  Drizzle ORM schema (single source of truth)
drizzle/
  migrations/       Generated SQL migrations (never hand-edit)
docs/               This documentation
scripts/ci/         CI helper scripts
cypress/e2e/        End-to-end test specs
```
