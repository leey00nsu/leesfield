import { Header } from "@/widgets/header/ui/header";
import { LandingHero } from "@/widgets/landing/ui/landing-hero";
import { LandingFeaturesSection } from "@/widgets/landing/ui/landing-features-section";
import { LandingCtaSection } from "@/widgets/landing/ui/landing-cta-section";

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
        <LandingHero />
        <section className="pb-20">
          <div className="flex w-full flex-col gap-16">
            <LandingFeaturesSection />
            <LandingCtaSection />
          </div>
        </section>
      </main>
    </div>
  );
}
