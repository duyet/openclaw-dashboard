/**
 * Next.js edge middleware for auth and route protection.
 *
 * - Clerk middleware for user auth in clerk mode
 * - Passthrough for public API routes (health, webhook ingest, bootstrap)
 * - Agent token passthrough (handled by route handlers directly)
 *
 * IMPORTANT: process.env.NEXT_PUBLIC_AUTH_MODE is inlined at build time by
 * Next.js webpack. When the value is "local", the clerkMiddleware() branch is
 * never reached, preventing Clerk from initialising without a valid publishable
 * key (which would crash the edge worker on every request).
 */
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Routes that should bypass all authentication (Clerk mode only).
 *
 * API routes here handle their own auth via JWT in Authorization header.
 * They must bypass Clerk middleware so JWT verification can happen in
 * the route handler (see requireActorContext in lib/auth).
 */
const isPublicRoute = createRouteMatcher([
  // Landing page
  "/",
  // Health check endpoints
  "/api/v1/health(.*)",
  "/api/v1/healthz(.*)",
  "/api/v1/readyz(.*)",
  // Auth bootstrap (creates/syncs user record)
  "/api/v1/auth/bootstrap(.*)",
  // Webhook ingest endpoints (authenticated via webhook-specific token)
  "/api/v1/boards/:boardId/webhooks/:webhookId/ingest(.*)",
  // API routes with JWT auth (Authorization header, handled by route handlers)
  "/api/v1/boards(.*)",
  "/api/v1/agents(.*)",
  "/api/v1/gateways(.*)",
  "/api/v1/activities(.*)",
  "/api/v1/agent(.*)",
  "/api/v1/organizations(.*)",
  "/api/v1/skills(.*)",
  "/api/v1/tags(.*)",
  "/api/v1/tasks(.*)",
  "/api/v1/approvals(.*)",
  "/api/v1/board-groups(.*)",
  "/api/v1/board-memory(.*)",
  "/api/v1/board-group-memory(.*)",
  "/api/v1/board-webhooks(.*)",
  "/api/v1/board-onboarding(.*)",
  "/api/v1/custom-fields(.*)",
  "/api/v1/metrics(.*)",
  "/api/v1/souls-directory(.*)",
  "/api/v1/gateway-sessions(.*)",
  // Sign-in / sign-up pages
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

/**
 * Routes that use agent token auth (X-Agent-Token header).
 * These bypass Clerk middleware entirely; auth is handled in the route handler.
 */
function hasAgentToken(request: NextRequest): boolean {
  return request.headers.has("X-Agent-Token");
}

// In local auth mode the entire request is passed through without touching
// Clerk. Using a top-level ternary on the build-time constant means webpack
// can dead-code-eliminate the clerkMiddleware() call, so Clerk never attempts
// to validate the (absent) publishable key when building for local/CI.
//
// The IIFE creates the handler once (not per request) while keeping
// clerkMiddleware() inside the non-local branch so webpack can tree-shake it.
export default process.env.NEXT_PUBLIC_AUTH_MODE === "local"
  ? (_request: NextRequest) => NextResponse.next()
  : (() => {
      const handler = clerkMiddleware(async (auth, request) => {
        if (hasAgentToken(request)) return NextResponse.next();
        if (isPublicRoute(request)) return NextResponse.next();
        await auth.protect();
      });
      // Any error during ?__clerk_handshake processing (e.g. "handshake status
      // without redirect" or "Missing secretKey") becomes a graceful redirect to
      // sign-in instead of crashing with 500.
      return async (request: NextRequest, event: NextFetchEvent) => {
        const isHandshake =
          request.nextUrl.searchParams.has("__clerk_handshake");
        try {
          return await handler(request, event);
        } catch (err) {
          if (isHandshake) {
            return NextResponse.redirect(
              new URL("/sign-in", request.nextUrl.origin)
            );
          }
          throw err;
        }
      };
    })();

export const config = {
  matcher: [
    // Skip Next.js internals and all static files unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
