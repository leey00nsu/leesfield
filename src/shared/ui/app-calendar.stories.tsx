import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { AppCalendar, AppDatePicker } from "@/shared/ui/app-calendar";

const meta = {
  title: "Project Design/App/AppCalendar",
  component: AppCalendar,
  parameters: { layout: "centered" },
} satisfies Meta<typeof AppCalendar>;

export default meta;

type Story = StoryObj<typeof meta>;

function DatePickerStory() {
  const [date, setDate] = useState(new Date(2026, 4, 5));

  return (
    <div className="w-[320px] rounded-[1.6rem] border border-white/10 bg-surface-dark p-5">
      <AppDatePicker aria-label="Start date" value={date} onChange={setDate} />
    </div>
  );
}

export const Calendar: Story = {
  render: () => (
    <div className="rounded-[1.6rem] border border-white/10 bg-[#0b0d0e] p-3">
      <AppCalendar mode="single" selected={new Date(2026, 4, 5)} />
    </div>
  ),
};

export const DatePicker: Story = {
  render: () => <DatePickerStory />,
};
