import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect } from "react";
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

type AppFormPreviewProps = {
  prompt: string;
  label: string;
  buttonText: string;
  disabled: boolean;
};

const meta = {
  title: "Project Design/App/AppForm",
  component: AppFormPreview,
  args: {
    prompt: "A cinematic house",
    label: "Prompt",
    buttonText: "Generate",
    disabled: false,
  },
  argTypes: {
    prompt: { control: "text" },
    label: { control: "text" },
    buttonText: { control: "text" },
    disabled: { control: "boolean" },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof AppFormPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

function AppFormPreview({
  prompt,
  label,
  buttonText,
  disabled,
}: AppFormPreviewProps) {
  const form = useForm({ defaultValues: { prompt } });

  useEffect(() => {
    form.reset({ prompt });
  }, [form, prompt]);

  return (
    <AppForm {...form}>
      <form className="w-[360px] space-y-4 rounded-2xl border border-white/10 bg-surface-dark p-5">
        <AppFormControllerField
          control={form.control}
          name="prompt"
          render={({ field }) => (
            <AppFormItem>
              <AppFormLabel>{label}</AppFormLabel>
              <AppFormControl>
                <AppInput {...field} disabled={disabled} />
              </AppFormControl>
              <AppFormMessage />
            </AppFormItem>
          )}
        />
        <AppButton type="button" size="sm" disabled={disabled}>
          {buttonText}
        </AppButton>
      </form>
    </AppForm>
  );
}

export const Default: Story = {};
