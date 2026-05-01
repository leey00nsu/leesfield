import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  AppCheckbox,
  AppFormField,
  AppInput,
  AppLabel,
  AppSelectNative,
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
        <AppSelectNative id="app-form-type" defaultValue="video">
          <option value="image">Image</option>
          <option value="video">Video</option>
          <option value="audio">Audio</option>
        </AppSelectNative>
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
