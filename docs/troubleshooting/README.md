# Troubleshooting

## "routes not configured for edge runtime"

**Symptom:** `bunx @cloudflare/next-on-pages` fails with a message like:
> Error: The following pages/routes are not configured for the edge runtime: ...

**Cause:** A page file with dynamic route parameters (`[param]`) or an API route handler is missing the edge runtime export.

**Fix:** Add the following export to the affected file:

```typescript
export const runtime = "edge";
```

Rules:
- All files under `src/app/api/v1/` must have `export const runtime = "edge"`.
- All page files with dynamic segments (e.g. `src/app/boards/[boardId]/page.tsx`) must have `export const runtime = "edge"`.
- Static pages with no dynamic params do not need this export — they are pre-rendered at build time.
- Files with `"use client"` must put the directive first, then the runtime export.

## All API routes return 404 after deploy

**Symptom:** The deployed site loads but every `/api/v1/...` request returns 404.

**Cause:** The build output is missing `_worker.js`. This happens when `bun run cf:build` did not complete successfully or was not run before deploying.

**Fix:**
1. Check that `bun run cf:build` completes without errors.
2. Verify that `.vercel/output/static/_worker.js/index.js` exists after the build.
3. Re-run the deploy only after a successful build.

If the build fails silently, run it with verbose output:

```bash
bunx @cloudflare/next-on-pages
```

Check for any warnings about routes not being compiled for the edge runtime (see above).

## Clerk crashes in local auth mode

**Symptom:** All requests return 500 after deployment. The error in the worker logs is about `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` being missing or invalid.

**Cause:** The middleware at `src/middleware.ts` is not using the top-level ternary pattern, allowing `clerkMiddleware()` to be initialised even when `NEXT_PUBLIC_AUTH_MODE=local`.

**Fix:** The middleware must follow this exact pattern:

```typescript
export default process.env.NEXT_PUBLIC_AUTH_MODE === "local"
  ? (_request: NextRequest) => NextResponse.next()
  : clerkMiddleware(async (auth, request) => { ... });
```

The ternary on the build-time constant allows webpack to dead-code-eliminate the Clerk branch when building in local mode. Do not move the Clerk import or the ternary inside a function body — the dead-code elimination only works at the top level.

## Top-level await in next.config.ts breaks the build

**Symptom:** The build fails with a CJS module error related to `await` at the top level of `next.config.ts`.

**Cause:** `next.config.ts` is loaded as CommonJS, which does not support top-level `await`.

**Fix:** Wrap async initialisation in a void IIFE:

```typescript
// Wrong:
const data = await fetchSomething();

// Correct:
void (async () => {
  const data = await fetchSomething();
})();
```

## bun install fails in sandboxed environments

**Symptom:** `bun install` exits with `AccessDenied` or a network error in a sandbox or CI environment.

**Cause:** Some sandboxed environments (including Claude Code's execution environment) block bun's registry access.

**Fix:** Use `npm install` as a fallback for dependency installation in those environments. The lockfile and scripts still use bun for everything else.

## Queue binding errors at deploy time

**Symptom:** Deploy fails with an error about an unsupported queue consumer binding.

**Cause:** A `[[queues.consumers]]` block was added to the Pages `wrangler.toml`. Queue consumers are not supported in Cloudflare Pages projects.

**Fix:** Remove the `[[queues.consumers]]` block from `wrangler.toml`. The queue producer binding (`[[queues.producers]]`) can stay, but the consumer must be deployed as a separate Cloudflare Worker.

## Migration gate fails in CI

**Symptom:** The "Enforce one migration per PR" CI step fails with:
> Migration gate FAILED: this PR adds N migration files; policy allows at most 1.

**Fix:** Consolidate your schema changes into a single migration. If you accidentally ran `make db-generate` multiple times, delete all but one of the generated SQL files in `drizzle/migrations/` and regenerate:

```bash
# Remove the extra migration files, then:
make db-generate
```

If the changes are truly independent, split them into separate PRs.

See [One migration per PR](../policy/one-migration-per-pr.md) for the full policy.

## Local D1 state is stale or broken

**Symptom:** API calls fail locally with SQLite schema errors or missing table errors.

**Fix:** Re-apply all migrations from scratch:

```bash
make db-migrate
```

If the local D1 state is badly corrupted, delete the local D1 database file (usually in `.wrangler/state/`) and run `make db-migrate` again.

## TypeScript errors in edge route handlers

**Symptom:** TypeScript reports errors about Cloudflare-specific types (e.g. `D1Database`, `KVNamespace`) not being found.

**Fix:** These types come from `@cloudflare/workers-types`. Ensure the package is installed and that `tsconfig.json` includes the types:

```json
{
  "compilerOptions": {
    "types": ["@cloudflare/workers-types"]
  }
}
```
