import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { AppCalendar, AppDatePicker } from "@/shared/ui/app-calendar";

type AppCalendarPreviewProps = {
  mode: "calendar" | "date-picker";
  disabled: boolean;
  selectedDay: number;
};

function AppCalendarPreview({
  mode,
  disabled,
  selectedDay,
}: AppCalendarPreviewProps) {
  const [dateSelection, setDateSelection] = useState<{
    date: Date;
    selectedDay: number;
  } | null>(null);
  const date =
    dateSelection?.selectedDay === selectedDay
      ? dateSelection.date
      : new Date(2026, 3, selectedDay);
  const setDate = (nextDate: Date | undefined) => {
    if (nextDate) {
      setDateSelection({ date: nextDate, selectedDay });
    }
  };

  if (mode === "date-picker") {
    return (
      <div className="w-[320px] rounded-[1.6rem] border border-white/10 bg-surface-dark p-5">
        <AppDatePicker
          aria-label="Start date"
          value={date}
          onChange={setDate}
          disabled={disabled}
        />
      </div>
    );
  }

  return (
    <div className="rounded-[1.6rem] border border-white/10 bg-[#0b0d0e] p-3">
      <AppCalendar
        mode="single"
        selected={date}
        onSelect={setDate}
        disabled={disabled}
      />
    </div>
  );
}

const meta = {
  title: "Project Design/App/AppCalendar",
  component: AppCalendarPreview,
  args: {
    mode: "calendar",
    selectedDay: 29,
    disabled: false,
  },
  argTypes: {
    mode: { control: "select", options: ["calendar", "date-picker"] },
    selectedDay: { control: { type: "number", min: 1, max: 30, step: 1 } },
    disabled: { control: "boolean" },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof AppCalendarPreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const DatePicker: Story = {
  args: {
    mode: "date-picker",
  },
};
