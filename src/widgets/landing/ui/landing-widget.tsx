import { LandingSpacesSection } from "./landing-spaces-section";
import { Header } from "@/widgets/header/ui/header";
import { LandingHero } from "@/widgets/landing/ui/landing-hero";
import { LandingCoreFeaturesSection } from "@/widgets/landing/ui/landing-core-features-section";
import { LandingReuseSection } from "@/widgets/landing/ui/landing-reuse-section";
import { LandingCtaSection } from "@/widgets/landing/ui/landing-cta-section";
import { LandingFooter } from "@/widgets/landing/ui/landing-footer";

interface LandingWidgetProps {
  isAuthenticated: boolean;
  userEmail: string | null;
}

export function LandingWidget({
  isAuthenticated,
  userEmail,
}: LandingWidgetProps) {
  return (
    <div className="min-h-screen bg-background-dark text-white">
      <Header
        variant="public"
        isAuthenticated={isAuthenticated}
        userEmail={userEmail}
      />

      <main className="flex flex-col">
        <LandingHero isAuthenticated={isAuthenticated} />
        <LandingSpacesSection />
        <LandingCoreFeaturesSection />
        <LandingReuseSection />
        <LandingCtaSection />
      </main>
      <LandingFooter />
    </div>
  );
}
