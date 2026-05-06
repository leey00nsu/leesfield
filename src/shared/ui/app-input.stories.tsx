import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppInput } from "@/shared/ui/app-input";
import { AppSearchField } from "@/shared/ui/app-filter-toolbar";

const meta = {
  title: "Project Design/App/AppInput",
  component: AppInput,
  args: {
    defaultValue: "Leesfield Video",
    placeholder: "Enter value...",
    surface: "default",
    inputSize: "md",
    disabled: false,
    "aria-label": "Input",
  },
  argTypes: {
    defaultValue: { control: "text" },
    placeholder: { control: "text" },
    surface: {
      control: "select",
      options: ["default", "toolbar", "auth", "transparent"],
    },
    inputSize: { control: "select", options: ["md", "lg"] },
    disabled: { control: "boolean" },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof AppInput>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <div className="w-[320px] rounded-2xl border border-white/10 bg-surface-dark p-5">
      <AppInput {...args} />
    </div>
  ),
};

export const InputAndSearch: Story = {
  render: () => (
    <div className="grid w-[360px] gap-4 rounded-2xl border border-white/10 bg-surface-dark p-5">
      <AppInput aria-label="Model name" defaultValue="Leesfield Video" />
      <AppInput
        aria-label="Toolbar input"
        surface="toolbar"
        inputSize="lg"
        defaultValue="Production API key"
      />
      <AppInput
        aria-label="Auth input"
        surface="auth"
        inputSize="lg"
        defaultValue="creator@leesfield.local"
      />
      <AppSearchField
        aria-label="Search"
        placeholder="Search by prompt, model, or tags..."
      />
      <div className="w-60">
        <AppSearchField
          aria-label="Narrow search"
          placeholder="Search endpoints..."
        />
      </div>
    </div>
  ),
};
