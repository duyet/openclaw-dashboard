/**
 * Next.js edge middleware for auth and route protection.
 *
 * - Clerk middleware for user auth in clerk mode
 * - Passthrough for public API routes (health, webhook ingest, bootstrap)
 * - Agent token passthrough (handled by route handlers directly)
 */
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Routes that should bypass all authentication.
 */
const isPublicRoute = createRouteMatcher([
  // Health check endpoints
  '/api/v1/health(.*)',
  '/api/v1/healthz(.*)',
  '/api/v1/readyz(.*)',
  // Auth bootstrap (creates/syncs user record)
  '/api/v1/auth/bootstrap(.*)',
  // Webhook ingest endpoints (authenticated via webhook-specific token)
  '/api/v1/boards/:boardId/webhooks/:webhookId/ingest(.*)',
  // Sign-in page
  '/sign-in(.*)',
]);

/**
 * Routes that use agent token auth (X-Agent-Token header).
 * These bypass Clerk middleware entirely; auth is handled in the route handler.
 */
function hasAgentToken(request: NextRequest): boolean {
  return request.headers.has('X-Agent-Token');
}

/**
 * Check if we are in local auth mode.
 */
function isLocalAuthMode(): boolean {
  return process.env.NEXT_PUBLIC_AUTH_MODE === 'local';
}

export default clerkMiddleware(async (auth, request) => {
  // Agent token requests bypass Clerk entirely
  if (hasAgentToken(request)) {
    return NextResponse.next();
  }

  // Public routes pass through
  if (isPublicRoute(request)) {
    return NextResponse.next();
  }

  // In local auth mode, skip Clerk protection
  if (isLocalAuthMode()) {
    return NextResponse.next();
  }

  // Protect all other routes with Clerk
  await auth.protect();
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
