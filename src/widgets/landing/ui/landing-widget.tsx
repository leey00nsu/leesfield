import { Header } from "@/widgets/header/ui/header";
import { LandingHero } from "@/widgets/landing/ui/landing-hero";
import { LandingFeaturesSection } from "@/widgets/landing/ui/landing-features-section";
import { LandingShowcaseSection } from "@/widgets/landing/ui/landing-showcase-section";
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
        <section className="px-6 pb-20 pt-12 sm:px-10">
          <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-16">
            <LandingFeaturesSection />
            <LandingShowcaseSection />
            <LandingCtaSection />
          </div>
        </section>
      </main>
    </div>
  );
}
