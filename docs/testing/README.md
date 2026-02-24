# Testing guide

## Unit tests — Vitest

Unit tests run with [Vitest](https://vitest.dev/).

```bash
make test
# or
bun run test
```

This runs `vitest run --passWithNoTests --coverage`. Coverage output is written to `coverage/` in v8 format.

### Test file locations

Test files are co-located with the source they test, using the naming convention `*.test.ts` or `*.test.tsx`. For example:

```
src/lib/backoff.ts
src/lib/backoff.test.ts

src/lib/display-name.ts
src/lib/display-name.test.ts
```

Vitest automatically discovers all `*.test.ts` / `*.test.tsx` files in `src/`.

### Watch mode

```bash
bun run test:watch
# or
bunx vitest
```

### Coverage

Coverage is collected automatically when running `make test` (the `--coverage` flag is set in the `package.json` script). Coverage artifacts are uploaded by CI and retained for 7 days.

To view coverage locally, open `coverage/index.html` in a browser after running `make test`.

See [Coverage policy](../coverage-policy.md) for details on thresholds and enforcement.

### React fake timer tests

When testing React components that use `useEffect` with fake timers, add an async flush after advancing timers before making assertions on call counts:

```typescript
import { act } from "@testing-library/react";

// After advancing fake timers:
await act(async () => { await Promise.resolve(); });
// Now check call counts — effect cleanups have been flushed.
```

Skipping this flush causes intermittent failures in CI due to pending effect cleanups not having run before assertions execute.

## End-to-end tests — Cypress

E2E tests run with [Cypress](https://www.cypress.io/).

```bash
make e2e
# or
bun run e2e
```

### Spec file locations

Cypress specs live in `cypress/e2e/`:

```
cypress/e2e/activity_smoke.cy.ts     # Smoke test — runs in CI (local auth)
cypress/e2e/activity_feed.cy.ts      # Activity feed tests
cypress/e2e/organizations.cy.ts      # Organization management
cypress/e2e/clerk_login.cy.ts        # Clerk login flow (requires Clerk secrets)
```

### Interactive runner

```bash
bun run e2e:open
# or
bunx cypress open
```

### E2E in CI

CI runs Cypress with `NEXT_PUBLIC_AUTH_MODE=local`. Only the smoke spec (`activity_smoke.cy.ts`) is executed because the other specs require Clerk credentials.

The `e2e` job in CI is marked `continue-on-error: true` — failures are reported but do not block merges. Full E2E validation requires Clerk secrets.

### Cypress artifacts

On failure, CI uploads screenshots and videos to the `cypress-artifacts` artifact (retained 7 days).

## What to test

### Unit test (Vitest)
- Pure functions and utility logic in `src/lib/`
- Business logic in service modules
- React component rendering with `@testing-library/react`
- Edge cases and error paths

### E2E test (Cypress)
- Critical user-facing flows (board creation, task management, auth)
- Regression scenarios for previously reported bugs
- UI behaviour that is difficult to exercise with unit tests

## Vitest configuration

Vitest is configured in `vitest.config.ts` (or in `package.json` if no separate config file exists). Tests run in a jsdom environment for React component tests. Import alias `@/` is resolved to `src/`.
