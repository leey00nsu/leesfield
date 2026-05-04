import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AppInput } from "@/shared/ui/app-input";
import {
  AppCheckbox,
  AppFormField,
  AppLabel,
  AppSelect,
  AppTextarea,
} from "@/shared/ui/app-form-control";

const meta = {
  title: "Project Design/App/AppFormControl",
  component: AppInput,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof AppInput>;

export default meta;

type Story = StoryObj<typeof meta>;

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
      <AppFormField>
        <AppLabel htmlFor="app-form-profile">Profile bio</AppLabel>
        <AppTextarea
          id="app-form-profile"
          surface="profile"
          defaultValue="A compact project form surface."
        />
      </AppFormField>
      <div className="flex gap-6">
        <AppCheckbox label="Active" defaultChecked />
        <AppCheckbox label="Default" />
      </div>
    </div>
  ),
};
