"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  type getMeApiV1UsersMeGetResponse,
  useGetMeApiV1UsersMeGet,
} from "@/api/generated/users/users";

import type { ApiError } from "@/api/mutator";
import { useAuth } from "@/auth/clerk";
import { HeaderBar } from "@/components/layout/header-bar";
import { LiveFeed } from "@/components/layout/live-feed";
import { NavRail } from "@/components/layout/nav-rail";
import { isOnboardingComplete } from "@/lib/onboarding";
import { useMissionControl } from "@/store";

export function DashboardShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isSignedIn } = useAuth();
  const isOnboardingPath = pathname === "/onboarding";
  const { setCurrentUser } = useMissionControl();

  const meQuery = useGetMeApiV1UsersMeGet<
    getMeApiV1UsersMeGetResponse,
    ApiError
  >({
    query: {
      enabled: Boolean(isSignedIn) && !isOnboardingPath,
      retry: false,
      refetchOnMount: "always",
    },
  });

  const profile = meQuery.data?.status === 200 ? meQuery.data.data : null;

  useEffect(() => {
    if (!isSignedIn || isOnboardingPath) return;
    if (!profile) return;

    // Auto-update global store for the user profile so the HeaderBar can use it
    setCurrentUser({
      id: profile.id,
      username: profile.name || "",
      display_name: profile.preferred_name || profile.name || "Operator",
      role: "admin", // Hardcoded for layout purposes as original didn't deeply integrate RBAC in layout
      email: profile.email,
    });

    if (!isOnboardingComplete(profile)) {
      router.replace("/onboarding");
    }
  }, [isOnboardingPath, isSignedIn, profile, router, setCurrentUser]);

  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center animate-pulse">
          <span className="text-primary-foreground font-bold text-sm">OC</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden relative w-full">
      {/* Left: Icon rail navigation (hidden on mobile, shown as bottom bar) */}
      <NavRail />

      {/* Center: Header + Content wrapper */}
      <div className="flex-1 flex flex-col min-w-0">
        <HeaderBar />

        {/* Main Content wrapper */}
        <div className="flex-1 flex overflow-hidden relative z-0 bg-background">
          <main className="flex-1 overflow-auto pb-16 md:pb-0">
            <div aria-live="polite" className="h-full">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
