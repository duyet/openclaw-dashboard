# Deployment guide

## Target platform

Mission Control is deployed to **Cloudflare Pages** using `@cloudflare/next-on-pages`. The application runs entirely on the Cloudflare edge — no Node.js server, no separate backend.

## Required Cloudflare resources

These must exist in your Cloudflare account before deploying:

| Resource | Type | Purpose |
|---|---|---|
| `openclaw-mission-control` | D1 database | Primary data store (SQLite) |
| `openclaw-mission-control` | KV namespace | Session and cache storage |

The binding IDs in `wrangler.toml` must match real Cloudflare resource IDs. Placeholder values will cause the deploy to fail.

Current provisioned IDs (account `23050adb6c92e313643a29e1ba64c88a`):

- D1 database ID: `656eb2a0-00e3-4dac-a384-8b086ae80151`
- KV production ID: `dd84f5cc51dc4ffe90132e03fff9ad20`
- KV preview ID: `43eebe6b333a41a581b0818a0f7ce234`

## wrangler.toml

```toml
name = "openclaw-mission-control"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

pages_build_output_dir = ".vercel/output/static"

[vars]
NEXT_PUBLIC_AUTH_MODE = "local"
LOCAL_AUTH_TOKEN = "change-me-to-a-secure-token-at-least-50-chars-long-please"

[[d1_databases]]
binding = "DB"
database_name = "openclaw-mission-control"
database_id = "656eb2a0-00e3-4dac-a384-8b086ae80151"

[[kv_namespaces]]
binding = "KV"
id = "dd84f5cc51dc4ffe90132e03fff9ad20"
preview_id = "43eebe6b333a41a581b0818a0f7ce234"
```

## Build

The build command converts the Next.js app into a Cloudflare Pages-compatible worker:

```bash
bun run cf:build
# or
bunx @cloudflare/next-on-pages
```

On success, the build outputs to `.vercel/output/static/`. The key artifact is `.vercel/output/static/_worker.js/index.js`. If that file is missing, all API routes will return 404 in the deployed environment.

## NEXT_PUBLIC_* variables are build-time only

Variables prefixed with `NEXT_PUBLIC_` are **inlined at build time** by Next.js webpack. Setting them in `wrangler.toml [vars]` has no effect — those values are only available to edge runtime code, not to the webpack compiler.

This means `NEXT_PUBLIC_AUTH_MODE` must be set as an environment variable when running `bun run cf:build`, not in `wrangler.toml`:

```bash
NEXT_PUBLIC_AUTH_MODE=local bun run cf:build
```

CI sets this explicitly in the build step (see `.github/workflows/ci.yml`).

## Edge runtime requirements

Every page file that uses dynamic route parameters (`[param]`) must export:

```typescript
export const runtime = "edge";
```

Static pages (no dynamic params) do not need this — they are pre-rendered at build time.

All API route handlers under `src/app/api/v1/` must also export `runtime = "edge"`.

If any dynamic page or API route is missing the runtime export, `next-on-pages` will fail with:
> routes not configured for edge runtime

## Manual deploy

```bash
make deploy
```

This runs `make build` followed by `bunx wrangler pages deploy .vercel/output/static --project-name=openclaw-mission-control`.

## CI/CD pipeline

The GitHub Actions workflow at `.github/workflows/ci.yml` runs three jobs:

### `check` job (runs on every push and PR)

1. Install dependencies with `bun install`
2. Enforce one migration per PR (`scripts/ci/one_migration_per_pr.sh`)
3. Lint (`bun run lint`)
4. Typecheck (`bunx tsc --noEmit`)
5. Unit tests (`bun run test`)
6. Build (`bun run cf:build` with `NEXT_PUBLIC_AUTH_MODE=local`)
7. Docs quality gates (`make docs-check`)
8. Upload coverage artifacts

### `e2e` job (runs after `check`, `continue-on-error: true`)

Starts the Next.js dev server and runs the smoke E2E spec. Marked as non-blocking because full E2E requires Clerk secrets that are not available in CI.

### `deploy` job (runs only on push to `main`, after `check`)

Builds and deploys to Cloudflare Pages using `cloudflare/wrangler-action@v3`.

Required GitHub secrets:
- `CLOUDFLARE_API_TOKEN` — Cloudflare API token with Pages:Edit permission
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID

## Queue (not yet enabled)

The `webhook-delivery` queue binding is commented out in `wrangler.toml`. Queue consumers are not supported in a Pages project — they require a separate Worker. When the queue is needed, create a dedicated Worker in `workers/queue-consumer.ts` and wire the producer binding in `wrangler.toml` separately.

To create the queue:

```bash
npx wrangler queues create webhook-delivery
```
