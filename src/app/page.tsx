"use client";

export const runtime = "edge";

import { LandingHero } from "@/components/organisms/LandingHero";
import { LandingShell } from "@/components/templates/LandingShell";

export default function Page() {
  return (
    <LandingShell>
      <LandingHero />
    </LandingShell>
  );
}
