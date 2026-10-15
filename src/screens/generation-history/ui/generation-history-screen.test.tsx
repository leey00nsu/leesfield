import userEvent from "@testing-library/user-event";
import { fireEvent, screen, within, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GenerationHistoryScreen } from "@/screens/generation-history/ui/generation-history-screen";
import { renderWithIntl } from "@/test-utils/intl";
import { composeCinemaPrompt } from "@/shared/cinema/cinema-prompt";
import { defaultCinemaSettings } from "@/shared/cinema/cinema-contract";
import { getMediaAsset, getAssetProjects, patchAssetMetadata } from "@/features/media-assets/api/media-asset-api";
import type { MediaAssetDto } from "@/shared/media-assets/media-asset-contract";
vi.mock("@/features/media-assets/api/media-asset-api", async original => ({
  ...await original<typeof import("@/features/media-assets/api/media-asset-api")>(),
  getMediaAsset: vi.fn(), getAssetProjects: vi.fn(), patchAssetMetadata: vi.fn(),
}));
const useCinemaHistoryMock = vi.hoisted(() => vi.fn());
vi.mock("@/shared/cinema/use-cinema-history", () => ({ useCinemaHistory: useCinemaHistoryMock }));
beforeEach(() => { useCinemaHistoryMock.mockReturnValue({ data: undefined, error: false, loading: false }); });

const useGenerationHistoryListMock = vi.fn();
const useMonitoringRequestDetailMock = vi.fn();
const routerPushMock = vi.hoisted(() => vi.fn());
const clipboardWriteTextMock = vi.hoisted(() => vi.fn());
const copyToasts = vi.hoisted(() => ({copied: vi.fn(), error: vi.fn(), success: vi.fn()}));
vi.mock("@/shared/ui/app-toast", () => ({appToast: copyToasts}));

vi.mock("@/shared/lib/hooks/use-runtime-model-catalog",()=>({useRuntimeModelCatalog:()=>({items:[{key:"test-model",label:"Test model"}]})}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPushMock,
  }),
}));

vi.mock("@/features/generation-history/hook/use-generation-history-list", () => ({
  useGenerationHistoryList: (...args: unknown[]) => useGenerationHistoryListMock(...args),
}));

vi.mock("@/features/monitoring-dashboard/hook/use-monitoring-dashboard", () => ({
  useMonitoringRequestDetail: (...args: unknown[]) =>
    useMonitoringRequestDetailMock(...args),
}));

const detailFixture = vi.hoisted(() => ({
  id: "history-detail-1",
  type: "image",
  status: "completed",
  prompt: "medium shot editorial result",
  model: "flux2-klein-9b",
  createdAt: "2026-03-10T00:00:00.000Z",
  updatedAt: "2026-03-10T00:00:02.500Z",
  finishedAt: "2026-03-10T00:00:02.500Z",
  durationMs: 2500,
  progress: 100,
  resultUrl: "https://example.com/result.png",
  thumbnailUrl: "https://example.com/thumb.png",
  inputImages: ["https://example.com/input.png"],
  errorMessage: null,
} as const));

vi.mock("@/features/generation-history/ui/history-list", () => ({
  HistoryList: ({
    onSelectItem,
    items,
  }: {
    items: unknown[];
    onSelectItem?: (item: typeof detailFixture) => void;
  }) => (
    <div>
      <span data-testid="history-items-count">{items.length}</span>
      <button
        type="button"
        data-testid="history-list"
        onClick={() => onSelectItem?.((items[0] as typeof detailFixture) ?? detailFixture)}
      >
        open detail
      </button>
    </div>
  ),
}));

describe("GenerationHistoryScreen", () => {
  beforeEach(() => {
    useGenerationHistoryListMock.mockReset();
    useMonitoringRequestDetailMock.mockReset();
    useMonitoringRequestDetailMock.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });
    routerPushMock.mockReset();
    clipboardWriteTextMock.mockReset().mockResolvedValue(undefined);
    copyToasts.copied.mockReset(); copyToasts.error.mockReset();
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: clipboardWriteTextMock,
      },
      configurable: true,
    });
  });

  it("separates model and prompt filters and defaults video autoplay on", async () => {
    useGenerationHistoryListMock.mockReturnValue({items:[],isLoading:false,isFetchingNextPage:false,hasNextPage:false,error:null,sentinelRef:{current:null},removeItem:vi.fn(),retry:vi.fn()});
    const user=userEvent.setup();renderWithIntl(<GenerationHistoryScreen />);
    await user.click(screen.getByRole("button", { name: "필터" }));
    const toggle=screen.getByRole('checkbox',{name:'자동재생'});expect(toggle).toHaveAttribute('aria-checked','true');await user.click(toggle);expect(toggle).toHaveAttribute('aria-checked','false');
    screen.getByRole('combobox',{name:'모델'}).focus();
    await user.keyboard('{ArrowDown}');
    await user.click(await screen.findByRole('option',{name:'Test model'}));
    await user.click(screen.getByRole("button", { name: "검색" }));
    fireEvent.change(screen.getByPlaceholderText('프롬프트 검색…'),{target:{value:'rain'}});
    await waitFor(()=>expect(useGenerationHistoryListMock).toHaveBeenLastCalledWith(expect.objectContaining({query:'',model:'test-model',prompt:'rain'})));
  });

  it("shows an audio filter and requests audio history when selected", () => {
    useGenerationHistoryListMock.mockReturnValue({
      items: [],
      total: 0,
      isLoading: false,
      error: null,
      sentinelRef: { current: null },
      removeItem: vi.fn(),
    });

    renderWithIntl(<GenerationHistoryScreen />);

    expect(screen.queryByText("HISTORY STUDIO")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Results you can reuse." }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("history-items-count")).toHaveTextContent("0");
    expect(screen.queryByRole("button", { name: "히스토리" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Community" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "필터" }));
    const audioFilter = screen.getByRole("button", { name: "오디오" });
    expect(audioFilter).toBeInTheDocument();
    expect(useGenerationHistoryListMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "all",
        sort: "date_desc",
        query: "",
      }),
    );

    fireEvent.click(audioFilter);

    expect(useGenerationHistoryListMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: "audio",
        sort: "date_desc",
        query: "",
      }),
    );
  });

  it("filters visible history by status while keeping the app toolbar controls", () => {
    useGenerationHistoryListMock.mockReturnValue({
      items: [
        detailFixture,
        {
          ...detailFixture,
          id: "history-detail-2",
          status: "failed",
          prompt: "failed result",
        },
      ],
      total: 2,
      hasNextPage: true,
      isLoading: false,
      error: null,
      sentinelRef: { current: null },
      removeItem: vi.fn(),
    });

    renderWithIntl(<GenerationHistoryScreen />);

    expect(screen.queryByPlaceholderText("프롬프트 검색…")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "히스토리 정렬" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "필터" }));
    expect(screen.getByRole("combobox", { name: "히스토리 정렬" })).toBeInTheDocument();
    expect(screen.getByTestId("history-items-count")).toHaveTextContent("2");
    expect(screen.queryByText(/^총\s/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "실패" }));
    expect(useGenerationHistoryListMock).toHaveBeenLastCalledWith(expect.objectContaining({ status: "failed" }));

    fireEvent.click(screen.getAllByRole("button", { name: "전체" })[1]);
    expect(screen.getByTestId("history-items-count")).toHaveTextContent("2");
  });

  it("renders the infinite loading sentinel without decorative pill styles", () => {
    useGenerationHistoryListMock.mockReturnValue({
      items: [
        {
          id: "history-1",
          type: "image",
          status: "completed",
          prompt: "prompt",
          createdAt: "2026-03-10T00:00:00.000Z",
        },
      ],
      total: 2,
      hasNextPage: true,
      isLoading: true,
      error: null,
      sentinelRef: { current: null },
      removeItem: vi.fn(),
    });

    renderWithIntl(<GenerationHistoryScreen />);

    const sentinel = screen.getByTestId("history-infinite-sentinel");
    expect(sentinel).not.toHaveClass("rounded-full");
    expect(sentinel).not.toHaveClass("border");
    expect(sentinel).not.toHaveClass("bg-surface-dark/60");
  });

  it("opens a gallery detail rail from a selected history item", async () => {
    useGenerationHistoryListMock.mockReturnValue({
      items: [detailFixture],
      total: 1,
      isLoading: false,
      error: null,
      sentinelRef: { current: null },
      removeItem: vi.fn(),
    });

    renderWithIntl(<GenerationHistoryScreen />);

    fireEvent.click(screen.getByTestId("history-list"));

    expect(
      screen.getByRole("dialog", { name: "결과 상세" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("history-detail-rail")).toHaveAttribute(
      "data-app-detail-rail",
      "",
    );
    expect(screen.getByRole("tablist", { name: "에셋 상세 정보" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "일반" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(screen.getByRole("tab", { name: "프롬프트" }));
    expect(screen.getByText("medium shot editorial result")).toBeInTheDocument();

    const copyButton = screen.getAllByRole("button", { name: "복사" }).find(button => !button.hasAttribute("disabled"))!;
    fireEvent.click(copyButton);
    expect(clipboardWriteTextMock).toHaveBeenCalledWith(
      "medium shot editorial result",
    );

    await waitFor(() => expect(copyToasts.copied).toHaveBeenCalledWith("복사됨"));
    expect(screen.getAllByRole("button", { name: "복사" }).find(button => !button.hasAttribute("disabled"))!).toBe(copyButton);
    clipboardWriteTextMock.mockRejectedValueOnce(new Error("denied"));
    fireEvent.click(copyButton);
    await waitFor(() => expect(copyToasts.error).toHaveBeenCalledWith("복사하지 못했습니다."));
    expect(screen.getAllByRole("button", { name: "복사" }).find(button => !button.hasAttribute("disabled"))!).toBe(copyButton);

    fireEvent.click(screen.getByRole("tab", { name: "설정" }));
    expect(screen.getByText("모델")).toBeInTheDocument();
    expect(screen.getAllByText("flux2-klein-9b").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("상태")).toBeInTheDocument();
    expect(screen.queryByText("100%")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "메타데이터" }));
    expect(screen.getByText("요청 ID")).toBeInTheDocument();
    expect(screen.getAllByText("history-detail-1").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("요청 시간")).toBeInTheDocument();
    expect(screen.getByText("완료 시간")).toBeInTheDocument();
    expect(screen.getByText("소요 시간")).toBeInTheDocument();
    expect(screen.getByText("2초 소요")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "히스토리" }));
    expect(screen.getByText("입력 이미지")).toBeInTheDocument();
    expect(screen.getByText("결과 이미지")).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: /이미지/ })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "다시 생성" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "다운로드" })).toHaveAttribute(
      "href",
      "/api/history/history-detail-1?type=image&origin=generation",
    );

    expect(screen.queryByRole("button", {name:"비디오로 생성"})).not.toBeInTheDocument();

    expect(screen.queryByRole("button", {name: "편집"})).not.toBeInTheDocument();
    expect(screen.getByRole("button", {name: "기록 숨기기"})).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "업스케일" })).not.toBeInTheDocument();
  });

  it("closes the detail overlay from the preview backdrop but not from media or rail clicks", () => {
    useGenerationHistoryListMock.mockReturnValue({
      items: [detailFixture],
      total: 1,
      isLoading: false,
      error: null,
      sentinelRef: { current: null },
      removeItem: vi.fn(),
    });

    renderWithIntl(<GenerationHistoryScreen />);

    fireEvent.click(screen.getByTestId("history-list"));

    fireEvent.click(screen.getByTestId("history-detail-preview-media"));
    expect(screen.getByRole("dialog", { name: "결과 상세" })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("history-detail-rail"));
    expect(screen.getByRole("dialog", { name: "결과 상세" })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("history-detail-preview-backdrop"));
    expect(
      screen.queryByRole("dialog", { name: "결과 상세" }),
    ).not.toBeInTheDocument();
  });

  it("uses the shared modal and closes on Escape", async () => {
    useGenerationHistoryListMock.mockReturnValue({
      items: [detailFixture],
      total: 1,
      isLoading: false,
      error: null,
      sentinelRef: { current: null },
      removeItem: vi.fn(),
    });
    document.body.style.overflow = "";

    renderWithIntl(<GenerationHistoryScreen />);

    fireEvent.click(screen.getByTestId("history-list"));

    expect(screen.getByRole("dialog", { name: "결과 상세" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", {name:"결과 상세"})).toHaveAttribute("data-app-dialog-content");
    expect(screen.getByRole("button", {name:"닫기"})).not.toHaveClass("rounded-full");

    fireEvent.keyDown(screen.getByRole("dialog", {name:"결과 상세"}), { key: "Escape" });

    expect(
      screen.queryByRole("dialog", { name: "결과 상세" }),
    ).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
  });

  it("hydrates missing rail metadata from the canonical request detail response", () => {
    const staleListItem = {
      ...detailFixture,
      updatedAt: null,
      durationMs: null,
      progress: null,
      resultUrl: null,
      thumbnailUrl: null,
      inputImages: [],
    };
    useGenerationHistoryListMock.mockReturnValue({
      items: [staleListItem],
      total: 1,
      isLoading: false,
      error: null,
      sentinelRef: { current: null },
      removeItem: vi.fn(),
    });
    useMonitoringRequestDetailMock.mockReturnValue({
      data: {
        id: "history-detail-1",
        type: "image",
        status: "completed",
        prompt: "hydrated prompt",
        model: "hydrated-model",
        createdAt: "2026-03-10T00:00:00.000Z",
        updatedAt: "2026-03-10T00:00:02.500Z",
  finishedAt: "2026-03-10T00:00:02.500Z",
        durationMs: 2500,
        progress: 100,
        errorMessage: null,
        warningMessage: "asset warning",
        inputImages: ["https://example.com/detail-input.png"],
        inputAudios: [],
        referenceText: "hydrated reference",
        assets: [
          {
            url: "https://example.com/detail-result.png",
            width: 1024,
            height: 1024,
            durationSec: null,
          },
        ],
      },
      isLoading: false,
      error: null,
    });

    renderWithIntl(<GenerationHistoryScreen />);

    fireEvent.click(screen.getByTestId("history-list"));

    expect(useMonitoringRequestDetailMock).toHaveBeenCalledWith(
      "image",
      "history-detail-1",
      true,
    );
    fireEvent.click(screen.getByRole("tab", { name: "프롬프트" }));
    expect(screen.getByText("hydrated prompt")).toBeInTheDocument();
    expect(screen.getByText("hydrated reference")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "설정" }));
    expect(screen.getAllByText("hydrated-model").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("100%")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "메타데이터" }));
    const finishedAtRow = screen.getByText("완료 시간").parentElement;
    expect(finishedAtRow).toHaveTextContent("2026");
    expect(finishedAtRow).not.toHaveTextContent("-");
    expect(screen.getByText("2초 소요")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "히스토리" }));
    expect(screen.getByText("경고 메시지")).toBeInTheDocument();
    expect(screen.getByText("asset warning")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "다운로드" })).toHaveAttribute(
      "href",
      "/api/history/history-detail-1?type=image&origin=generation",
    );

    expect(screen.queryByRole("button", {name:"비디오로 생성"})).not.toBeInTheDocument();
  });

  it("collapses long prompt text and expands it on request", () => {
    const longPrompt = [
      "A majestic mountain landscape at golden hour with dramatic clouds",
      "a winding river through the valley",
      "a cinematic photorealistic style",
      "precise camera direction",
      "reusable lighting notes",
      "and production-ready composition details.",
    ].join(", ");

    useGenerationHistoryListMock.mockReturnValue({
      items: [{ ...detailFixture, prompt: longPrompt }],
      total: 1,
      isLoading: false,
      error: null,
      sentinelRef: { current: null },
      removeItem: vi.fn(),
    });

    renderWithIntl(<GenerationHistoryScreen />);

    fireEvent.click(screen.getByTestId("history-list"));

    fireEvent.click(screen.getByRole("tab", { name: "프롬프트" }));
    const showMore = screen.getByRole("button", { name: "더 보기" });
    expect(showMore).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(showMore);

    expect(screen.getByRole("button", { name: "접기" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("shows placeholders for missing request detail metadata", () => {
    const pendingFixture = {
      ...detailFixture,
      id: "pending-detail",
      status: "pending",
      updatedAt: null,
      durationMs: null,
      progress: null,
      resultUrl: null,
      thumbnailUrl: null,
      inputImages: [],
    } as const;

    useGenerationHistoryListMock.mockReturnValue({
      items: [pendingFixture],
      total: 1,
      isLoading: false,
      error: null,
      sentinelRef: { current: null },
      removeItem: vi.fn(),
    });

    renderWithIntl(<GenerationHistoryScreen />);

    fireEvent.click(screen.getByTestId("history-list"));

    fireEvent.click(screen.getByRole("tab", { name: "메타데이터" }));
    expect(screen.getAllByText("pending-detail").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("-").length).toBeGreaterThanOrEqual(2);

    fireEvent.click(screen.getByRole("tab", { name: "히스토리" }));
    expect(screen.getByText("입력 파일 없음")).toBeInTheDocument();
    expect(screen.getByText("결과 없음")).toBeInTheDocument();
  });
});

it("keeps loaded cards visible on a subsequent page failure", () => {
  const retry = vi.fn();
  useGenerationHistoryListMock.mockReturnValue({ items: [detailFixture], total: 2, hasNextPage: true, isLoading: false, error: "failed", sentinelRef: { current: null }, removeItem: vi.fn(), retry });
  renderWithIntl(<GenerationHistoryScreen />);
  expect(screen.getByTestId("history-items-count")).toHaveTextContent("1");
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(retry).toHaveBeenCalledOnce();
});
it.each(["failed","pending","completed"])("keeps a disabled download action for %s history without a usable result",async status=>{
 const item={...detailFixture,status,resultUrl:status==="failed"?"https://example.com/stale.png":null,thumbnailUrl:null};
 useGenerationHistoryListMock.mockReturnValue({items:[item],total:1,isLoading:false,sentinelRef:{current:null},removeItem:vi.fn()});
 useMonitoringRequestDetailMock.mockReturnValue({data:null});
 const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
 try {
 renderWithIntl(<GenerationHistoryScreen />);await userEvent.click(screen.getByTestId("history-list"));
 const button=screen.getByRole("button",{name:"다운로드"});
 expect(button).toBeDisabled();expect(screen.queryByRole("link",{name:"다운로드"})).not.toBeInTheDocument();
 await userEvent.click(button);expect(fetcher).not.toHaveBeenCalled();
 }finally{vi.unstubAllGlobals();}
});

it("displays typed text separately from full prompt and moves Cinema settings to settings in the shared editor without recreation", async () => {
  const cinema = composeCinemaPrompt("original authoring text", { ...defaultCinemaSettings(), lighting: "window" }, "image");
  useCinemaHistoryMock.mockReturnValue({ data: { cinema, inputPrompt: "original authoring text", prompt: cinema.finalPrompt, model: detailFixture.model }, loading: false, error: false });
  useGenerationHistoryListMock.mockReturnValue({ items: [detailFixture], total: 1, isLoading: false, sentinelRef: { current: null }, removeItem: vi.fn() });
  useMonitoringRequestDetailMock.mockReturnValue({ data: { ...detailFixture, prompt: cinema.finalPrompt, assets: [], inputAudios: [], referenceText: null } });
  renderWithIntl(<GenerationHistoryScreen />);
  await userEvent.click(screen.getByTestId("history-list"));
  await userEvent.click(screen.getByRole("tab",{name:"프롬프트"}));
  expect(screen.getByText("original authoring text")).toBeInTheDocument();
  expect(screen.getByText(/Cinema direction: Soft natural window light/)).toHaveTextContent("original authoring text");
  expect(screen.getByRole("button",{name:"저장"})).toBeDisabled();
  expect(screen.queryByRole("button",{name:"다시 생성"})).not.toBeInTheDocument();
  expect(routerPushMock).not.toHaveBeenCalled();
  expect(screen.queryByText("최종 프롬프트")).not.toBeInTheDocument();
  expect(screen.getByText("입력 프롬프트")).toBeVisible();
  expect(screen.getAllByRole("button", { name: "복사" })).toHaveLength(2);
  await userEvent.click(screen.getByRole("tab", { name: "설정" }));
  expect(screen.getByText("조명")).toBeVisible();
  await userEvent.click(screen.getByRole("tab", { name: "히스토리" }));
  expect(screen.getByText("출처")).toBeVisible();
  expect(screen.getByText("생성")).toBeVisible();
});

it("edits the result asset through the same form and Save action used by the asset library", async () => {
  const asset: MediaAssetDto = { id: "result-asset", version: 7, displayName: "Original", type: "image", origin: "generation", status: "completed", url: detailFixture.resultUrl, mimeType: "image/png", bytes: "512", width: 100, height: 100, durationMs: null, sourceOperationId: null, createdAt: detailFixture.createdAt, updatedAt: detailFixture.updatedAt };
  vi.mocked(getMediaAsset).mockResolvedValue(asset);
  vi.mocked(getAssetProjects).mockResolvedValue([]);
  vi.mocked(patchAssetMetadata).mockResolvedValue({ ...asset, version: 8, displayName: "Saved from history" });
  useGenerationHistoryListMock.mockReturnValue({ items: [{ ...detailFixture, assetId: asset.id }], isLoading: false, sentinelRef: { current: null }, removeItem: vi.fn() });
  useMonitoringRequestDetailMock.mockReturnValue({ data: null });
  renderWithIntl(<GenerationHistoryScreen />);
  await userEvent.click(screen.getByTestId("history-list"));
  const name = await screen.findByRole("textbox", { name: "이름" });
  expect(screen.getByRole("textbox", { name: "Asset ID" })).toHaveValue(asset.id);
  fireEvent.change(name, { target: { value: "Saved from history" } });
  await userEvent.click(screen.getByRole("tab", { name: "프롬프트" }));
  await userEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(patchAssetMetadata).toHaveBeenCalledWith(asset.id, expect.objectContaining({ expectedVersion: 7, displayName: "Saved from history" })));
  expect(screen.queryByRole("button", { name: "다시 생성" })).not.toBeInTheDocument();
  await screen.findByText("저장했습니다.");
});

it("requires confirmation, preserves detail on cancellation/failure, and removes after success", async () => {
 const removeItem=vi.fn();useGenerationHistoryListMock.mockReturnValue({items:[detailFixture],total:1,isLoading:false,error:null,sentinelRef:{current:null},removeItem});useMonitoringRequestDetailMock.mockReturnValue({data:null});
 const fetchMock=vi.fn().mockResolvedValueOnce(new Response(null,{status:500})).mockResolvedValueOnce(new Response(null,{status:204}));vi.stubGlobal("fetch",fetchMock);
 try {
 renderWithIntl(<GenerationHistoryScreen />);fireEvent.click(screen.getByTestId("history-list"));
 expect(screen.queryByText("flux2-klein-9b")).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"기록 숨기기"}));expect(fetchMock).not.toHaveBeenCalled();
 fireEvent.keyDown(screen.getByRole("alertdialog"),{key:"Escape"});expect(screen.getByRole("dialog",{name:"결과 상세"})).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"기록 숨기기"}));
 fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button",{name:"취소"}));expect(screen.getByRole("dialog",{name:"결과 상세"})).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"기록 숨기기"}));fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button",{name:"기록 숨기기"}));
 await waitFor(()=>expect(fetchMock).toHaveBeenCalledTimes(1));expect(fetchMock).toHaveBeenCalledWith("/api/history/history-detail-1/visibility",expect.objectContaining({method:"PATCH",body:JSON.stringify({type:"image",origin:"generation",hidden:true})}));await waitFor(()=>expect(within(screen.getByRole("alertdialog")).getByRole("button",{name:"기록 숨기기"})).not.toBeDisabled());expect(removeItem).not.toHaveBeenCalled();
 fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button",{name:"기록 숨기기"}));await waitFor(()=>expect(removeItem).toHaveBeenCalledWith(expect.objectContaining(detailFixture)));await waitFor(()=>expect(screen.queryByRole("dialog",{name:"결과 상세"})).not.toBeInTheDocument());
 } finally {vi.unstubAllGlobals();}
});

 it("disables saving without a result file and permits generation detail retry after failure", async () => {
 const retry=vi.fn();
 useGenerationHistoryListMock.mockReturnValue({items:[detailFixture],total:1,isLoading:false,error:null,sentinelRef:{current:null},removeItem:vi.fn()});
 useMonitoringRequestDetailMock.mockReturnValue({data:null,isLoading:false,isError:true,refetch:retry});
 renderWithIntl(<GenerationHistoryScreen />);
 await userEvent.click(screen.getByTestId("history-list"));
 expect(screen.getByRole("button",{name:"저장"})).toBeDisabled();
 await userEvent.click(screen.getByRole("button",{name:"다시 시도"}));
 expect(retry).toHaveBeenCalledOnce();
 });

it.each(["개 대신 고양이로", ""])("shows a readonly preset chip and user text without the empty prompt notice (%s)",async text=>{
  useCinemaHistoryMock.mockReturnValue({data:{cinema:null,inputPrompt:text,prompt:"expanded preset body",model:detailFixture.model,promptPreset:{key:"multi-camera-nine-grid",name:"멀티 카메라 9 그리드",builtinKey:"multi-camera-nine-grid",tokenOffset:0}},loading:false,error:false});
  useGenerationHistoryListMock.mockReturnValue({items:[detailFixture],total:1,isLoading:false,sentinelRef:{current:null},removeItem:vi.fn()});
  useMonitoringRequestDetailMock.mockReturnValue({data:null});
  renderWithIntl(<GenerationHistoryScreen />);
  await userEvent.click(screen.getByTestId("history-list"));
  await userEvent.click(screen.getByRole("tab",{name:"프롬프트"}));
  expect(screen.getByText("멀티 카메라 9 그리드")).toBeVisible();
  if(text) expect(screen.getByText(text)).toBeVisible();
  expect(screen.queryByText("직접 입력한 프롬프트가 없습니다.")).not.toBeInTheDocument();
  expect(screen.getAllByRole("button",{name:"복사"})[0]).toBeEnabled();
  expect(screen.queryByRole("button",{name:/프리셋 제거/})).not.toBeInTheDocument();
});
