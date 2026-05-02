import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useForm } from "react-hook-form";
import { AppButton } from "@/shared/ui/app-button";
import {
  AppForm,
  AppFormControl,
  AppFormControllerField,
  AppFormItem,
  AppFormLabel,
  AppFormMessage,
} from "@/shared/ui/app-form";
import { AppInput } from "@/shared/ui/app-input";

const meta = {
  title: "Project Design/App/AppForm",
  component: AppFormPreview,
  parameters: { layout: "centered" },
} satisfies Meta<typeof AppFormPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

function AppFormPreview() {
  const form = useForm({ defaultValues: { prompt: "A cinematic house" } });

  return (
    <AppForm {...form}>
      <form className="w-[360px] space-y-4 rounded-2xl border border-white/10 bg-surface-dark p-5">
        <AppFormControllerField
          control={form.control}
          name="prompt"
          render={({ field }) => (
            <AppFormItem>
              <AppFormLabel>Prompt</AppFormLabel>
              <AppFormControl>
                <AppInput {...field} />
              </AppFormControl>
              <AppFormMessage />
            </AppFormItem>
          )}
        />
        <AppButton type="button" size="sm">
          Generate
        </AppButton>
      </form>
    </AppForm>
  );
}

export const Default: Story = {};
