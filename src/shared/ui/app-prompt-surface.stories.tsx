import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Sparkles } from "lucide-react";
import { AppButton } from "@/shared/ui/app-button";
import { AppPromptField } from "@/shared/ui/app-prompt-surface";

const meta = {
  title: "Project Design/App/AppPromptSurface",
  component: AppPromptField,
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background-dark p-8 text-white">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AppPromptField>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Field: Story = {
  args: {
    ariaLabel: "Prompt field",
    textarea: (
      <textarea
        aria-label="Prompt"
        className="min-h-28 w-full resize-none border-0 bg-transparent px-5 py-5 text-sm text-white outline-none placeholder:text-white/45"
        placeholder="Describe the result you want..."
      />
    ),
    footerLeft: <span className="text-xs text-white/48">GPT Image 2</span>,
    footerRight: (
      <AppButton size="lg">
        Generate
        <Sparkles className="h-4 w-4" />
      </AppButton>
    ),
  },
};

export const HeroField: Story = {
  args: {
    ...Field.args,
    ariaLabel: "Hero prompt field",
    surface: "hero",
  },
};
