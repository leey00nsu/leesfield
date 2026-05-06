import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Sparkles } from "lucide-react";
import { AppButton } from "@/shared/ui/app-button";
import { AppPromptField } from "@/shared/ui/app-prompt-surface";

type AppPromptSurfacePreviewProps = {
  surface: "default" | "hero";
  prompt: string;
  meta: string;
  disabled: boolean;
  footer: boolean;
};

function AppPromptSurfacePreview({
  surface,
  prompt,
  meta,
  disabled,
  footer,
}: AppPromptSurfacePreviewProps) {
  return (
    <AppPromptField
      ariaLabel="Prompt field"
      surface={surface}
      promptMeta={meta}
      textarea={
        <textarea
          aria-label="Prompt"
          disabled={disabled}
          className="min-h-28 w-full resize-none border-0 bg-transparent px-5 py-5 text-sm text-white outline-none placeholder:text-white/45 disabled:opacity-45"
          placeholder="Describe the result you want..."
          defaultValue={prompt}
        />
      }
      footerLeft={footer ? <span className="text-xs text-white/48">GPT Image 2</span> : null}
      footerRight={
        footer ? (
          <AppButton size="lg" disabled={disabled}>
            Generate
            <Sparkles className="h-4 w-4" />
          </AppButton>
        ) : null
      }
    />
  );
}

const meta = {
  title: "Project Design/App/AppPromptSurface",
  component: AppPromptSurfacePreview,
  args: {
    surface: "default",
    prompt: "",
    meta: "0자",
    disabled: false,
    footer: true,
  },
  argTypes: {
    surface: { control: "select", options: ["default", "hero"] },
    prompt: { control: "text" },
    meta: { control: "text" },
    disabled: { control: "boolean" },
    footer: { control: "boolean" },
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background-dark p-8 text-white">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AppPromptSurfacePreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => <AppPromptSurfacePreview {...args} />,
};

export const Field: Story = {
  args: {
    surface: "default",
    prompt: "",
    meta: "0자",
    disabled: false,
    footer: true,
  },
};

export const HeroField: Story = {
  args: {
    surface: "hero",
    prompt: "",
    meta: "0자",
    disabled: false,
    footer: true,
  },
};
