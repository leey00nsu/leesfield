import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppEyebrow, AppHeading } from "@/shared/ui/app-typography";

type AppTypographyPreviewProps = {
  eyebrow: string;
  title: string;
  as: "h1" | "h2" | "h3";
  size: "hero" | "section" | "studio" | "compact";
  align: "left" | "center";
};

function AppTypographyPreview({
  eyebrow,
  title,
  as,
  size,
  align,
}: AppTypographyPreviewProps) {
  return (
    <div className={align === "center" ? "max-w-5xl text-center" : "max-w-5xl"}>
      <AppEyebrow>{eyebrow}</AppEyebrow>
      <AppHeading as={as} size={size} className="mt-4">
        {title}
      </AppHeading>
    </div>
  );
}

const meta = {
  title: "Project Design/App/AppTypography",
  component: AppTypographyPreview,
  args: {
    eyebrow: "IMAGE STUDIO",
    title: "Create images with control.",
    as: "h1",
    size: "studio",
    align: "left",
  },
  argTypes: {
    eyebrow: { control: "text" },
    title: { control: "text" },
    as: { control: "select", options: ["h1", "h2", "h3"] },
    size: {
      control: "select",
      options: ["hero", "section", "studio", "compact"],
    },
    align: { control: "select", options: ["left", "center"] },
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background-dark p-8 text-white">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AppTypographyPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => <AppTypographyPreview {...args} />,
};

export const Headings: Story = {
  render: () => (
    <div className="max-w-5xl space-y-8">
      <div>
        <AppEyebrow>IMAGE STUDIO</AppEyebrow>
        <AppHeading as="h1" size="studio" className="mt-4">
          Create images with control.
        </AppHeading>
      </div>
      <AppHeading as="h2" size="section">
        Project section heading.
      </AppHeading>
      <AppHeading as="h3" size="compact">
        Compact card heading.
      </AppHeading>
    </div>
  ),
};
