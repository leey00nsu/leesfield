import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ArrowRight, Code2, Sparkles } from "lucide-react";
import { AppCard } from "@/shared/ui/app-card";
import { AppEyebrow, AppHeading } from "@/shared/ui/app-typography";

function EditorialSurfaces() {
  return (
    <div className="min-h-screen bg-background-dark px-6 py-12 text-white sm:px-10">
      <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <AppCard variant="editorial" className="rounded-[1.6rem] p-8">
          <AppEyebrow>EDITORIAL PANEL</AppEyebrow>
          <AppHeading as="h1" size="section" className="mt-6 max-w-3xl">
            Project surfaces, not base primitives.
          </AppHeading>
          <p className="mt-6 max-w-xl text-base leading-7 text-white/64">
            Shared panels keep the leesfield gradient, border, and dark surface
            treatment visible without cataloging raw shadcn components.
          </p>
        </AppCard>

        <section className="grid gap-5">
          <AppCard variant="editorial" className="rounded-[1.25rem] p-6">
            <div className="flex items-center gap-3 text-primary">
              <Sparkles className="h-5 w-5" />
              <span className="font-semibold">Generation</span>
            </div>
            <div className="mt-8 rounded-xl border border-white/10 bg-black/18 p-4">
              <div className="h-24 rounded-lg bg-white/8" />
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="h-12 rounded-lg bg-white/8" />
                <div className="h-12 rounded-lg bg-primary" />
              </div>
            </div>
          </AppCard>

          <AppCard variant="editorial-flat" className="rounded-[1.25rem] p-6">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-3 font-medium">
                <Code2 className="h-5 w-5 text-primary" />
                Docs
              </p>
              <ArrowRight className="h-5 w-5 text-primary" />
            </div>
            <pre className="mt-5 overflow-hidden rounded-lg border border-white/10 bg-black/25 p-4 text-xs leading-6 text-white/68">
{`POST /v2/image/generate
{
  "model": "gpt-image-2",
  "prompt": "cinematic product study"
}`}
            </pre>
          </AppCard>
        </section>
      </div>
    </div>
  );
}

const meta = {
  title: "Project Design/Surfaces/EditorialSurfaces",
  component: EditorialSurfaces,
} satisfies Meta<typeof EditorialSurfaces>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {};
