import { AppRouteHomeAction, AppRouteState } from "@/shared/ui/app-route-state";

export default function NotFound() {
  return (
    <AppRouteState
      eyebrow="404"
      title="This surface is not available."
      description="The page may have moved, or the route is not part of this workspace."
      action={<AppRouteHomeAction label="Go home" />}
    />
  );
}
