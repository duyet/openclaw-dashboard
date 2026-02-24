# Browser Automation Test — OpenClaw Dashboard

AI-driven browser test loop: navigate the app, capture errors, fix bugs, repeat.

## Setup

- Dev server: `http://localhost:3000` (start with `make dev` if not running)
- Auth: Clerk test mode — email `jane+clerk_test@example.com`, OTP `424242`
- Auth mode: check `NEXT_PUBLIC_AUTH_MODE` in `.env.local` (default: `clerk`)

## Test Flow

Execute all phases in order. After each phase, check console for errors before proceeding.

### Phase 0 — Preflight

1. Confirm dev server is running: `curl -s http://localhost:3000/api/v1/healthz`
   - If not running, start it: `bun run dev` (background)
   - Wait up to 30s for server to be ready
2. Call `mcp__claude-in-chrome__tabs_context_mcp` to get current tab state
3. Create a new tab with `mcp__claude-in-chrome__tabs_create_mcp`

### Phase 1 — Landing Page

1. Navigate to `http://localhost:3000`
2. Take snapshot with `mcp__claude-in-chrome__browser_snapshot` (NOT screenshot)
3. Read console messages with `mcp__claude-in-chrome__read_console_messages`
4. Verify: hero text visible, "Sign in" or CTA button present
5. Log any console errors

### Phase 2 — Sign In (Clerk Test Flow)

1. Navigate to `http://localhost:3000/sign-in`
2. Wait for Clerk `<SignIn>` component to render (look for email input)
3. Take snapshot to confirm form is visible
4. Fill email: `jane+clerk_test@example.com`
5. Click Continue / Submit
6. Wait for OTP screen
7. Fill OTP: `424242`
8. Wait for redirect to `/boards` or `/activity`
9. Confirm signed in: user avatar or signed-in state visible
10. Capture any auth errors from console

### Phase 3 — Boards Page

1. Navigate to `http://localhost:3000/boards`
2. Snapshot + console check
3. Verify: page title "Boards" visible, table or empty state renders without crash
4. If boards exist: check table columns, sorting controls
5. Click "Create board" if visible → verify form loads

### Phase 4 — Gateways Page

1. Navigate to `http://localhost:3000/gateways`
2. Snapshot + console check
3. Verify: page loads, empty state or list renders
4. Click "New gateway" if visible → check form

### Phase 5 — Activity Feed

1. Navigate to `http://localhost:3000/activity`
2. Snapshot + console check
3. Verify: "Live feed" heading visible, no crash

### Phase 6 — Settings Page

1. Navigate to `http://localhost:3000/settings`
2. Snapshot + console check
3. Verify: settings sections render

### Phase 7 — Navigation & Layout

1. Check sidebar navigation links all resolve (no 404s)
2. Test responsive: resize window to 375px wide, snapshot, resize back
3. Check for any broken links or missing assets

### Phase 8 — Network Requests

1. Call `mcp__claude-in-chrome__read_network_requests` to get API call log
2. Look for: 4xx/5xx responses, CORS errors, missing endpoints
3. Document all failing API calls

## Bug Reporting

For each bug found, create a bug entry:

```
BUG #N — [severity: critical/major/minor]
Page: <url>
Issue: <what's wrong>
Console error: <exact error if any>
Steps to reproduce: <what I did>
```

Severity guide:
- **critical**: app crash, auth broken, data loss risk
- **major**: feature not working, error message shown to user
- **minor**: visual glitch, wrong text, minor UX issue

## Auto-Fix Protocol

For each bug:
1. Read the relevant source file(s)
2. Identify root cause
3. Fix using Edit tool
4. Re-navigate to verify fix in browser
5. Run `bun fix` to lint after all edits
6. Run `bun run typecheck` to verify types

Do NOT fix:
- Issues requiring backend changes not in this repo
- Auth/Clerk config issues
- Database schema changes (use `make db-generate`)

## Completion

After all phases:
1. Run `bun fix && bun run typecheck`
2. Summary report:
   - Pages tested: N
   - Bugs found: N (N critical, N major, N minor)
   - Bugs fixed: N
   - Console errors: list
   - API failures: list
3. Suggest follow-up tasks for unfixed bugs
