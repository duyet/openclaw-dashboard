import { Lock } from "lucide-react";
import { SignInButton } from "@/auth/clerk";
import { isLocalAuthMode } from "@/auth/localAuth";

import { BrandMark } from "@/components/atoms/BrandMark";
import { LocalAuthLogin } from "@/components/organisms/LocalAuthLogin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type SignedOutPanelProps = {
  message: string;
  forceRedirectUrl: string;
  signUpForceRedirectUrl?: string;
  mode?: "modal" | "redirect";
  buttonLabel?: string;
  buttonTestId?: string;
};

export function SignedOutPanel({
  message,
  forceRedirectUrl,
  signUpForceRedirectUrl,
  mode = "modal",
  buttonLabel = "Sign in",
  buttonTestId,
}: SignedOutPanelProps) {
  if (isLocalAuthMode()) {
    return (
      <div className="fixed inset-0 z-50">
        <LocalAuthLogin />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex min-h-screen items-center justify-center overflow-auto bg-app px-4 py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-28 -left-24 h-72 w-72 rounded-full bg-[color:var(--accent-soft)] blur-3xl" />
        <div className="absolute -right-28 -bottom-24 h-80 w-80 rounded-full bg-[rgba(14,165,233,0.12)] blur-3xl" />
      </div>

      <Card className="relative w-full max-w-md animate-fade-in-up">
        <CardHeader className="space-y-5 border-b border-[color:var(--border)] pb-5">
          <div className="flex items-center justify-between">
            <BrandMark />
            <div className="rounded-xl bg-[color:var(--accent-soft)] p-2 text-[color:var(--accent)]">
              <Lock className="h-5 w-5" />
            </div>
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-strong">
              Welcome back
            </h1>
            <p className="text-sm text-muted">{message}</p>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          <SignInButton
            mode={mode}
            forceRedirectUrl={forceRedirectUrl}
            signUpForceRedirectUrl={signUpForceRedirectUrl}
          >
            <Button className="w-full" size="lg" data-testid={buttonTestId}>
              {buttonLabel}
            </Button>
          </SignInButton>
        </CardContent>
      </Card>
    </div>
  );
}
