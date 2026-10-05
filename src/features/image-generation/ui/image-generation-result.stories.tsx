import { useState } from "react";
import { AppButton } from "@/shared/ui/app-button";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ImageGenerationState } from "../hook/use-image-generation";
import { storybookImage } from "@/test-utils/fixtures/storybook-media";
import { ImageGenerationResult } from "./image-generation-result";

const images = (count: number) => Array.from({ length: count }, () => ({ url: storybookImage.url }));
const completed = (count: number): ImageGenerationState => ({
  status: "completed", progress: 100,
  batch: { total: count, finished: count, failed: 0 },
  result: { images: images(count) },
});
const meta = {
  title: "Project Design/Generation/ImageResults",
  component: ImageGenerationResult,
  args: { embedded: true, state: completed(1) },
  decorators: [(Story) => <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-8"><Story /></div>],
  parameters: { docs: { description: { component: "실제 이미지 생성 폼과 같은 결과 UI입니다. 2장 이상은 3×3, 페이지당9장과 아래 페이지네이션으로 표시합니다. 고정된 샘플 상태이며 API를 호출하지 않습니다. 장수는 같은 조건의 독립 호출 횟수입니다. embedded를 끄면 별도 이미지 생성 화면의 레이아웃을 확인할 수 있습니다." } } },
} satisfies Meta<typeof ImageGenerationResult>;
export default meta;
type Story = StoryObj<typeof meta>;

export const OneImage: Story = {};
export const TwoImages: Story = { args: { state: completed(2) } };
export const FourImages: Story = { args: { state: completed(4) } };
export const CustomFiveImages: Story = { args: { state: completed(5) } };
export const Queued: Story = { args: { state: { status: "pending", progress: 0, batch: { total: 4, finished: 0, failed: 0 } } } };
export const Uploading: Story = { args: { state: { status: "uploading", progress: 0, batch: { total: 4, finished: 0, failed: 0 } } } };
export const Generating: Story = { args: { state: { status: "processing", progress: 15, batch: { total: 4, finished: 0, failed: 0 } } } };
export const PartiallyCompleted: Story = { args: { state: { status: "processing", progress: 60, batch: { total: 4, finished: 2, failed: 0 }, result: { images: images(2) } } } };
export const PartialFailure: Story = { args: { state: { status: "completed", progress: 100, batch: { total: 4, finished: 4, failed: 1 }, result: { images: images(3) }, errorMessage: "4회 중 1회 생성에 실패했습니다. 성공한 결과는 유지됩니다." } } };
export const AllFailed: Story = { args: { state: { status: "failed", progress: 100, batch: { total: 4, finished: 4, failed: 4 }, errorMessage: "모든 생성 요청이 실패했습니다." } } };

export const NineImages: Story = { args: { state: completed(9) } };
export const TenImages: Story = { args: { state: completed(10) } };
export const EighteenImages: Story = { args: { state: completed(18) } };
export const TwentyImages: Story = { args: { state: completed(20) } };
export const HundredImages: Story = { args: { state: completed(100) } };

function GrowingResultsPreview() {
  const [count, setCount] = useState(10);
  return <>
    <ImageGenerationResult embedded state={completed(count)} />
    <div className="flex flex-wrap gap-2">
      <AppButton variant="surface" onClick={() => setCount(value => value + 9)}>샘플 결과 9장 추가</AppButton>
      <AppButton variant="surface" onClick={() => setCount(0)}>새 생성 / 초기화</AppButton>
    </div>
  </>;
}
export const GrowingResults: Story = { render: () => <GrowingResultsPreview /> };
