import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { LandingCoreFeaturesSection } from "@/widgets/landing/ui/landing-core-features-section";
import { LandingCtaSection } from "@/widgets/landing/ui/landing-cta-section";
import { LandingReuseSection } from "@/widgets/landing/ui/landing-reuse-section";
import { LandingTechLogoCloudSection } from "@/widgets/landing/ui/landing-tech-logo-cloud-section";

function LandingSectionsPreview() {
  return (
    <div className="min-h-screen bg-background text-white">
      <LandingCoreFeaturesSection />
      <LandingReuseSection />
      <LandingTechLogoCloudSection />
      <LandingCtaSection />
    </div>
  );
}

const meta = {
  title: "Project Design/Landing/Sections",
  component: LandingSectionsPreview,
} satisfies Meta<typeof LandingSectionsPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const AllSections: Story = {};

export const Workflow: Story = {
  render: () => (
    <div className="min-h-screen bg-background text-white">
      <LandingCoreFeaturesSection />
    </div>
  ),
};

export const Reuse: Story = {
  render: () => (
    <div className="min-h-screen bg-background text-white">
      <LandingReuseSection />
    </div>
  ),
};

export const Cta: Story = {
  render: () => (
    <div className="min-h-screen bg-background text-white">
      <LandingCtaSection />
    </div>
  ),
};
