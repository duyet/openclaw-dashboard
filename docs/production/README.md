# Production notes

## Auth mode configuration

Mission Control supports two authentication modes, controlled by the `NEXT_PUBLIC_AUTH_MODE` build-time variable.

| Mode | Description |
|---|---|
| `local` | Token-based auth with no external service. Suitable for self-hosted deployments. |
| `clerk` | Clerk.dev authentication. Used for multi-user production deployments. |

`NEXT_PUBLIC_AUTH_MODE` is inlined at build time by Next.js webpack. It must be set as an environment variable during the build, not in `wrangler.toml [vars]`.

```bash
NEXT_PUBLIC_AUTH_MODE=local bun run cf:build   # local/self-hosted
NEXT_PUBLIC_AUTH_MODE=clerk bun run cf:build   # Clerk production
```

## Local auth mode

In `local` mode, all requests are authenticated via a shared token stored in `sessionStorage` on the client side.

**Required variable:**

```
LOCAL_AUTH_TOKEN=<token>
```

The token must be at least 50 characters long. Set this in `wrangler.toml [vars]` for deployed environments:

```toml
[vars]
NEXT_PUBLIC_AUTH_MODE = "local"
LOCAL_AUTH_TOKEN = "your-token-at-least-50-characters-long-goes-here"
```

## Clerk auth mode

In `clerk` mode, authentication is handled by Clerk.dev.

**Required variables (set at build time and in wrangler.toml):**

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
```

These must be provided as environment variables during the `bun run cf:build` step. The publishable key is inlined into the client bundle; the secret key is used only by edge runtime handlers.

## Middleware and tree-shaking

The middleware at `src/middleware.ts` uses a top-level ternary on the build-time constant:

```typescript
export default process.env.NEXT_PUBLIC_AUTH_MODE === "local"
  ? (_request) => NextResponse.next()
  : clerkMiddleware(async (auth, request) => { ... });
```

This pattern is intentional. `clerkMiddleware()` validates `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` at module initialisation time. When building in `local` mode, the Clerk publishable key is absent — if the Clerk branch were reached, it would crash the entire edge worker (all routes would return 500).

The ternary on the build-time constant lets webpack dead-code-eliminate the entire Clerk runtime in `local` mode, reducing the worker bundle size from approximately 301 KB to 127 KB.

Do not restructure this pattern without understanding these constraints.

## Health endpoints

The following endpoints are always public (no authentication required) in both auth modes:

| Endpoint | Description |
|---|---|
| `GET /healthz` | Application-level health check |
| `GET /api/v1/healthz` | API health check |
| `GET /api/v1/readyz` | Readiness check (verifies DB connectivity) |

These endpoints can be used by load balancers, monitoring, and uptime checks.

## Cloudflare resource binding IDs

D1 and KV binding IDs in `wrangler.toml` must be real Cloudflare resource IDs. Placeholder values (e.g. `"your-database-id-here"`) will cause the deployment to fail or the edge worker to crash at startup.

Current production binding IDs:

```toml
[[d1_databases]]
binding = "DB"
database_name = "openclaw-mission-control"
database_id = "656eb2a0-00e3-4dac-a384-8b086ae80151"

[[kv_namespaces]]
binding = "KV"
id = "dd84f5cc51dc4ffe90132e03fff9ad20"
preview_id = "43eebe6b333a41a581b0818a0f7ce234"
```

## Queue consumer

The `webhook-delivery` queue consumer is not supported in a Cloudflare Pages project. The queue producer binding can be added to `wrangler.toml`, but the consumer must be deployed as a separate Cloudflare Worker.

The consumer binding is commented out in `wrangler.toml`. Do not add a `[[queues.consumers]]` entry to the Pages `wrangler.toml` — it will fail at deploy time.

## Database migrations in production

Migrations are applied to the remote D1 database using wrangler:

```bash
wrangler d1 migrations apply openclaw-mission-control --remote
```

Run this after deploying a new version that includes schema changes. The migration files are in `drizzle/migrations/` and are applied in timestamp order.

## Node.js built-ins

Edge runtime routes and middleware must not use Node.js built-in modules (`fs`, `path`, `crypto`, etc.). Use the Web Crypto API (`crypto.randomUUID()`, `crypto.subtle`) and Web Platform APIs instead.
