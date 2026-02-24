"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import {
  isClerkEnabled,
  SignedIn,
  SignedOut,
  SignInButton,
} from "@/auth/clerk";

import { UserMenu } from "@/components/organisms/UserMenu";

export function LandingShell({ children }: { children: ReactNode }) {
  const clerkEnabled = isClerkEnabled();

  return (
    <div className="landing-enterprise">
      <nav className="landing-nav" aria-label="Primary navigation">
        <div className="nav-container">
          <Link href="/" className="logo-section" aria-label="OpenClaw home">
            <div className="logo-icon" aria-hidden="true">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Center talon */}
                <path
                  d="M12 20 C12 20 11 14 11.5 9 C11.7 7 12 5 12 5 C12 5 12.3 7 12.5 9 C13 14 12 20 12 20Z"
                  fill="currentColor"
                  opacity="0.95"
                />
                {/* Left talon */}
                <path
                  d="M12 20 C12 20 8 15 6.5 10.5 C5.8 8.5 5.5 6.5 6 5 C6 5 7 7 8 9 C9.5 12 12 20 12 20Z"
                  fill="currentColor"
                  opacity="0.85"
                />
                {/* Right talon */}
                <path
                  d="M12 20 C12 20 16 15 17.5 10.5 C18.2 8.5 18.5 6.5 18 5 C18 5 17 7 16 9 C14.5 12 12 20 12 20Z"
                  fill="currentColor"
                  opacity="0.85"
                />
                {/* Palm/grip base */}
                <ellipse
                  cx="12"
                  cy="20"
                  rx="4"
                  ry="1.5"
                  fill="currentColor"
                  opacity="0.6"
                />
              </svg>
            </div>
            <div className="logo-text">
              <div className="logo-name">OpenClaw</div>
              <div className="logo-tagline">Mission Control</div>
            </div>
          </Link>

          <div className="nav-links">
            <Link href="#capabilities">Capabilities</Link>
            <Link href="/boards">Boards</Link>
            <Link href="/activity">Activity</Link>
            <Link href="/gateways">Gateways</Link>
          </div>

          <div className="nav-cta">
            <SignedOut>
              {clerkEnabled ? (
                <>
                  <SignInButton
                    mode="modal"
                    forceRedirectUrl="/onboarding"
                    signUpForceRedirectUrl="/onboarding"
                  >
                    <button type="button" className="btn-secondary">
                      Sign In
                    </button>
                  </SignInButton>
                  <SignInButton
                    mode="modal"
                    forceRedirectUrl="/onboarding"
                    signUpForceRedirectUrl="/onboarding"
                  >
                    <button type="button" className="btn-primary">
                      Start Free Trial
                    </button>
                  </SignInButton>
                </>
              ) : (
                <>
                  <Link href="/boards" className="btn-secondary">
                    Boards
                  </Link>
                  <Link href="/onboarding" className="btn-primary">
                    Get started
                  </Link>
                </>
              )}
            </SignedOut>

            <SignedIn>
              <Link href="/boards/new" className="btn-secondary">
                Create Board
              </Link>
              <Link href="/boards" className="btn-primary">
                Open Boards
              </Link>
              <UserMenu />
            </SignedIn>
          </div>
        </div>
      </nav>

      <main>{children}</main>

      <footer className="landing-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <h3>OpenClaw</h3>
            <p>A calm command center for boards, agents, and approvals.</p>
            <div className="footer-tagline">Realtime Execution Visibility</div>
          </div>

          <div className="footer-column">
            <h4>Product</h4>
            <div className="footer-links">
              <Link href="#capabilities">Capabilities</Link>
              <Link href="/boards">Boards</Link>
              <Link href="/activity">Activity</Link>
              <Link href="/dashboard">Dashboard</Link>
            </div>
          </div>

          <div className="footer-column">
            <h4>Platform</h4>
            <div className="footer-links">
              <Link href="/gateways">Gateways</Link>
              <Link href="/agents">Agents</Link>
              <Link href="/dashboard">Dashboard</Link>
            </div>
          </div>

          <div className="footer-column">
            <h4>Access</h4>
            <div className="footer-links">
              <SignedOut>
                {clerkEnabled ? (
                  <>
                    <SignInButton
                      mode="modal"
                      forceRedirectUrl="/onboarding"
                      signUpForceRedirectUrl="/onboarding"
                    >
                      <button type="button">Sign In</button>
                    </SignInButton>
                    <SignInButton
                      mode="modal"
                      forceRedirectUrl="/onboarding"
                      signUpForceRedirectUrl="/onboarding"
                    >
                      <button type="button">Create Account</button>
                    </SignInButton>
                  </>
                ) : (
                  <Link href="/boards">Boards</Link>
                )}
                <Link href="/onboarding">Onboarding</Link>
              </SignedOut>
              <SignedIn>
                <Link href="/boards">Open Boards</Link>
                <Link href="/boards/new">Create Board</Link>
                <Link href="/dashboard">Dashboard</Link>
              </SignedIn>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <div className="footer-copyright">
            © {new Date().getFullYear()} OpenClaw. All rights reserved.
          </div>
          <div className="footer-bottom-links">
            <Link href="#capabilities">Capabilities</Link>
            <Link href="/boards">Boards</Link>
            <Link href="/activity">Activity</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
