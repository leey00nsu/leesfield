import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/shared/i18n/messages/en.json";
import LandingSpacesCanvas from "./landing-spaces-canvas";

const meta = {
  title: "Widgets/Landing/Spaces canvas",
  component: LandingSpacesCanvas,
  decorators: [(Story) => <div style={{ width: "100%", height: 760 }}><Story /></div>],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof LandingSpacesCanvas>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Korean: Story = {};
export const English: Story = {
  render: () => <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC"><LandingSpacesCanvas /></NextIntlClientProvider>,
};
export const Narrow: Story = {
  decorators: [(Story) => <div style={{ width: 390, height: 470, maxWidth: "100%" }}><Story /></div>],
};
