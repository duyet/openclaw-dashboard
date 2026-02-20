# OpenClaw Mission Control

Centralized operations and governance platform for AI agents — built on Next.js 15 and Cloudflare's edge runtime.

[![CI](https://github.com/abhi1693/openclaw-mission-control/actions/workflows/ci.yml/badge.svg)](https://github.com/abhi1693/openclaw-mission-control/actions/workflows/ci.yml)

## Overview

Mission Control gives operators a single interface for work orchestration, agent and gateway management, approval-driven governance, and API-backed automation across teams and organizations.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Runtime / Hosting | Cloudflare Pages |
| Database | Cloudflare D1 (SQLite) via Drizzle ORM |
| Cache / KV | Cloudflare KV |
| Background Jobs | Cloudflare Queues |
| Auth | Clerk (production) or local bearer token (self-hosted) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Unit Tests | Vitest |
| E2E Tests | Cypress |

## Quick Start

```bash
git clone https://github.com/abhi1693/openclaw-mission-control.git
cd openclaw-mission-control
bun install
cp .env.example .env.local
# Configure .env.local (see Environment Variables section below)
# Provision Cloudflare resources (D1 database, KV namespace, Queue — see wrangler.toml)
make dev
```

## Environment Variables

Copy `.env.example` to `.env.local` and fill in the values for your chosen auth mode.

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_AUTH_MODE` | Yes | Auth mode: `local` or `clerk` |
| `LOCAL_AUTH_TOKEN` | Local mode | Shared bearer token (min 32 chars) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk mode | Clerk publishable key |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | Clerk mode | Redirect URL after sign-in |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_OUT_URL` | Clerk mode | Redirect URL after sign-out |
| `CLERK_SECRET_KEY` | Clerk mode | Clerk secret key (server-side) |
| `CLOUDFLARE_ACCOUNT_ID` | Deployment | Your Cloudflare account ID |
| `CLOUDFLARE_DATABASE_ID` | Deployment | D1 database ID from `wrangler.toml` |
| `CLOUDFLARE_D1_TOKEN` | Deployment | API token for D1 access |

## Auth Modes

### Local (default for self-hosted)

Set `NEXT_PUBLIC_AUTH_MODE=local` and provide a `LOCAL_AUTH_TOKEN` (at least 32 characters). All requests are authenticated via a shared bearer token — no external service required.

```env
NEXT_PUBLIC_AUTH_MODE=local
LOCAL_AUTH_TOKEN=change-me-at-least-32-chars-long-please
```

### Clerk

Set `NEXT_PUBLIC_AUTH_MODE=clerk` and supply your Clerk project credentials. Users sign in through Clerk's hosted UI.

```env
NEXT_PUBLIC_AUTH_MODE=clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/boards
NEXT_PUBLIC_CLERK_AFTER_SIGN_OUT_URL=/
CLERK_SECRET_KEY=sk_...
```

## Development Commands

| Command | Description |
|---------|-------------|
| `make dev` | Next.js dev server |
| `make cf-dev` | Cloudflare Pages dev server (with D1/KV/Queue bindings via Wrangler) |
| `make build` | Build for Cloudflare Pages |
| `make lint` | Run ESLint |
| `make typecheck` | TypeScript type check |
| `make test` | Unit tests (Vitest) |
| `make e2e` | E2E tests (Cypress) |
| `make check` | Run all checks (lint + typecheck + test) |
| `make db-generate` | Generate a Drizzle migration from schema changes |
| `make db-migrate` | Apply pending migrations to the local D1 database |
| `make deploy` | Build and deploy to Cloudflare Pages |

## Deployment

Deployment targets Cloudflare Pages. Ensure your Cloudflare account and Pages project are configured in `wrangler.toml`, then run:

```bash
make deploy
```

This builds the project and publishes it via Wrangler. Cloudflare D1, KV, and Queue bindings must be provisioned and referenced in `wrangler.toml` before deploying.

## Documentation

Extended guides for architecture, database migrations, Cloudflare resource setup, and production configuration are in [`/docs`](./docs/).

## License

MIT — see [`LICENSE`](./LICENSE).
