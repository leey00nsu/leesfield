import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { GenerationImageCountSelector } from "./generation-image-count-selector";

function Preview({ initialCount, disabled }: { initialCount: number; disabled: boolean }) {
  const [count, setCount] = useState(initialCount);
  return <GenerationImageCountSelector value={count} disabled={disabled} onChange={setCount} />;
}
const meta = {
  title: "Project Design/Generation/ImageCount",
  component: Preview,
  args: { initialCount: 1, disabled: false },
  decorators: [(Story) => <div className="flex min-h-[32rem] items-end p-8"><Story /></div>],
  parameters: { docs: { description: { component: "모델과 독립적인 호출 횟수. 1·2·4·직접입력(1~100)을 선택합니다. 0/101/소수 입력, Enter 적용, Escape 취소도 확인할 수 있습니다." } } },
} satisfies Meta<typeof Preview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Four: Story = { args: { initialCount: 4 } };
export const CustomFive: Story = { args: { initialCount: 5 } };
export const Disabled: Story = { args: { disabled: true } };
