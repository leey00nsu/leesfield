import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppInput } from "@/shared/ui/app-input";
import {
  AppCheckbox,
  AppFormField,
  AppLabel,
  AppSelect,
  AppTextarea,
} from "@/shared/ui/app-form-control";

type AppFormControlPreviewProps = {
  control: "input" | "select" | "textarea" | "checkbox";
  label: string;
  disabled: boolean;
  error: string;
};

function AppFormControlPreview({
  control,
  label,
  disabled,
  error,
}: AppFormControlPreviewProps) {
  return (
    <div className="w-[32rem] rounded-2xl bg-black p-6 text-white">
      <AppFormField>
        {control === "checkbox" ? (
          <AppCheckbox label={label} disabled={disabled} defaultChecked />
        ) : (
          <>
            <AppLabel htmlFor="app-form-control-playground">{label}</AppLabel>
            {control === "input" ? (
              <AppInput
                id="app-form-control-playground"
                defaultValue="Leesfield Video"
                disabled={disabled}
              />
            ) : control === "select" ? (
              <AppSelect
                id="app-form-control-playground"
                value="video"
                onValueChange={() => undefined}
                ariaLabel={label}
                disabled={disabled}
                options={[
                  { value: "image", label: "Image" },
                  { value: "video", label: "Video" },
                  { value: "audio", label: "Audio" },
                ]}
              />
            ) : (
              <AppTextarea
                id="app-form-control-playground"
                defaultValue={'{\n  "steps": 28\n}'}
                disabled={disabled}
              />
            )}
          </>
        )}
        {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
      </AppFormField>
    </div>
  );
}

const meta = {
  title: "Project Design/App/AppFormControl",
  component: AppFormControlPreview,
  args: {
    control: "input",
    label: "Model name",
    disabled: false,
    error: "",
  },
  argTypes: {
    control: { control: "select", options: ["input", "select", "textarea", "checkbox"] },
    label: { control: "text" },
    disabled: { control: "boolean" },
    error: { control: "text" },
  },
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof AppFormControlPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => <AppFormControlPreview {...args} />,
};

export const Controls: Story = {
  render: () => (
    <div className="w-[32rem] space-y-5 rounded-2xl bg-black p-6 text-white">
      <AppFormField>
        <AppLabel htmlFor="app-form-name">Model name</AppLabel>
        <AppInput id="app-form-name" defaultValue="Leesfield Video" />
      </AppFormField>
      <AppFormField>
        <AppLabel htmlFor="app-form-type">Type</AppLabel>
        <AppSelect
          id="app-form-type"
          value="video"
          onValueChange={() => undefined}
          ariaLabel="Type"
          options={[
            { value: "image", label: "Image" },
            { value: "video", label: "Video" },
            { value: "audio", label: "Audio" },
          ]}
        />
      </AppFormField>
      <AppFormField>
        <AppLabel htmlFor="app-form-json">Configuration</AppLabel>
        <AppTextarea id="app-form-json" defaultValue={'{\n  "steps": 28\n}'} />
      </AppFormField>
      <div className="flex gap-6">
        <AppCheckbox label="Active" defaultChecked />
        <AppCheckbox label="Default" />
      </div>
    </div>
  ),
};
