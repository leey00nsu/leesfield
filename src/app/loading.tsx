import { AppRouteState } from "@/shared/ui/app-route-state";

export default function Loading() {
  return (
    <AppRouteState
      eyebrow="Loading"
      title="Preparing your workspace."
      description="The studio surface is loading with your latest project context."
    />
  );
}
