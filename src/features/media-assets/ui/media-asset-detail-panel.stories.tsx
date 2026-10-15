import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MediaAssetDetailPanel } from "./media-asset-detail-panel";
import { mediaAssetKeys } from "../hook/use-media-assets";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
import { AppButton } from "@/shared/ui/app-button";
import { Download } from "lucide-react";

const fixture: MediaAssetDto = {
  id: "asset_employee_badge", version: 1, displayName: "EMPLOYEE_BADGE", classification: "prop",
  displayVersion: "v1", description: "인물 촬영에 재사용할 사원증 소품.", managementStatus: "active",
  projectIds: ["film"], starred: false, type: "image", status: "completed", origin: "upload",
  mimeType: "image/png", bytes: "204800", width: 1024, height: 1024, durationMs: null,
  sourceOperationId: null, url: "/storybook-preview.png", createdAt: "2026-10-13T00:00:00Z", updatedAt: "2026-10-13T00:00:00Z",
};
function DetailPreview({ missing = false }: { missing?: boolean }) {
  const [client] = useState(() => {
    const instance = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    instance.setQueryData(mediaAssetKeys.detail(fixture.id), fixture);
    instance.setQueryData(mediaAssetKeys.projects, [{ id: "film", name: "Film project", parentId: null }]);
    return instance;
  });
  return <QueryClientProvider client={client}><div className="h-dvh w-full max-w-[25rem] bg-black text-white">
    <MediaAssetDetailPanel assetId={missing ? null : fixture.id} writable={false} onClose={() => {}}
      notice={missing ? <div role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">생성 실패: 결과 파일을 만들지 못했습니다.</div> : undefined}
      tabs={["prompt", "settings", "metadata", "history"].map((value, index) => ({ value, label: ["프롬프트", "설정", "메타데이터", "히스토리"][index], content: <p className="text-sm text-muted-foreground">이 파일에는 생성 정보가 없습니다.</p> }))}
      actions={<AppButton disabled variant="surface" className="col-span-2 h-11 rounded-xl"><Download className="size-4" />다운로드</AppButton>} />
  </div></QueryClientProvider>;
}
const meta = { title: "Project Design/Assets/SharedDetailPanel", component: DetailPreview } satisfies Meta<typeof DetailPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ReadOnly: Story = {};
export const MissingResult: Story = { args: { missing: true } };
