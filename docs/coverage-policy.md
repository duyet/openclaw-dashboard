# Coverage policy

## How coverage is collected

Coverage is collected via [Vitest](https://vitest.dev/) with the `@vitest/coverage-v8` provider. The `--coverage` flag is set in the `test` script in `package.json`, so coverage runs automatically with every `make test` invocation:

```bash
bun run test
# equivalent to: vitest run --passWithNoTests --coverage
```

Coverage output is written to `coverage/` in the project root.

## Coverage in CI

CI uploads the `coverage/` directory as a GitHub Actions artifact named `coverage` after each `check` job run, regardless of whether the job succeeded or failed. Artifacts are retained for 7 days.

The upload step runs even on test failure (`if: always()`) to allow coverage debugging on failed runs.

## Test file locations

Test files are co-located with the source they test:

```
src/lib/backoff.ts
src/lib/backoff.test.ts

src/lib/display-name.ts
src/lib/display-name.test.ts

src/components/custom-fields/custom-field-form-utils.ts
src/components/custom-fields/custom-field-form-utils.test.ts
```

Vitest discovers all files matching `**/*.test.ts` and `**/*.test.tsx` within `src/`.

## Coverage threshold

No strict per-file or aggregate coverage threshold is currently enforced in CI. The `make test` step fails only if a test fails, not if coverage falls below a percentage.

This policy may be revised as the test suite matures.

## Viewing coverage locally

After running `make test`, open the HTML report:

```bash
open coverage/index.html
# or on Linux:
xdg-open coverage/index.html
```

The report shows line, branch, function, and statement coverage per file.
