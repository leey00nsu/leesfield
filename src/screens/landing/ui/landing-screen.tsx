import { LandingWidget } from "@/widgets/landing/ui/landing-widget";

type LandingScreenProps = {
  isAuthenticated: boolean;
  userEmail: string | null;
};

export function LandingScreen({
  isAuthenticated,
  userEmail,
}: LandingScreenProps) {
  return (
    <LandingWidget
      isAuthenticated={isAuthenticated}
      userEmail={userEmail}
    />
  );
}
