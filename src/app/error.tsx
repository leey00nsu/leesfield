"use client";

import { AppRouteHomeAction, AppRouteState } from "@/shared/ui/app-route-state";
import { AppButton } from "@/shared/ui/app-button";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AppRouteState
      eyebrow="Error"
      title="Something interrupted the studio."
      description="Try loading the page again, or return to the landing page and restart from there."
      action={
        <div className="flex flex-wrap justify-center gap-3">
          <AppButton type="button" className="rounded-full px-7" onClick={reset}>
            Try again
          </AppButton>
          <AppRouteHomeAction label="Go home" />
        </div>
      }
    />
  );
}
