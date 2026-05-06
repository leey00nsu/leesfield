import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HistoryList } from "@/features/generation-history/ui/history-list";
import { renderWithIntl } from "@/test-utils/intl";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock("@/features/monitoring-dashboard/hook/use-monitoring-dashboard", () => ({
  useMonitoringRequestDetail: () => ({
    data: null,
    isLoading: false,
    error: null,
  }),
}));

const originalMatchMedia = window.matchMedia;

function mockMatchMedia({
  isMdUp,
  isXlUp,
}: {
  isMdUp: boolean;
  isXlUp: boolean;
}) {
  window.matchMedia = vi.fn((query: string) => {
    const matches =
      query === "(min-width: 1280px)"
        ? isXlUp
        : query === "(min-width: 768px)"
          ? isMdUp
          : false;

    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
  }) as typeof window.matchMedia;
}

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  vi.restoreAllMocks();
});

describe("HistoryList", () => {
  it("uses varied masonry tile sizes instead of uniform cards", () => {
    mockMatchMedia({ isMdUp: true, isXlUp: false });

    const items = Array.from({ length: 3 }, (_, index) => ({
      id: `item-${index + 1}`,
      type: "video" as const,
      status: "completed" as const,
      prompt: `prompt-${index + 1}`,
      model: null,
      createdAt: "2026-02-03T00:00:00.000Z",
      resultUrl: "https://example.com/video.mp4",
      thumbnailUrl: null,
      errorMessage: null,
    }));

    renderWithIntl(<HistoryList items={items} />);
    const wrapper = screen.getByTestId("history-gallery-grid");

    expect(wrapper).toHaveClass("auto-rows-[7rem]");
    expect(wrapper.children[0]).toHaveClass("md:col-span-2");
    expect(wrapper.children[0]).toHaveClass("md:row-span-5");
    expect(wrapper.children[1]).toHaveClass("row-span-2");
    expect(wrapper.children[2]).toHaveClass("row-span-3");
  });

  it("renders all statuses in one gallery grid without separate activity sections", () => {
    mockMatchMedia({ isMdUp: false, isXlUp: false });

    renderWithIntl(
      <HistoryList
        items={[
          {
            id: "failed-1",
            type: "image",
            status: "failed",
            prompt: "failed prompt",
            model: null,
            createdAt: "2026-02-03T00:00:00.000Z",
            resultUrl: null,
            thumbnailUrl: null,
            errorMessage: "boom",
          },
          {
            id: "completed-1",
            type: "image",
            status: "completed",
            prompt: "completed prompt",
            model: null,
            createdAt: "2026-02-03T00:00:00.000Z",
            resultUrl: "https://example.com/result.png",
            thumbnailUrl: "https://example.com/thumb.png",
            errorMessage: null,
          },
          {
            id: "processing-1",
            type: "video",
            status: "processing",
            prompt: "processing prompt",
            model: null,
            createdAt: "2026-02-03T00:00:00.000Z",
            resultUrl: null,
            thumbnailUrl: null,
            errorMessage: null,
          },
        ]}
      />,
    );

    const gallery = screen.getByTestId("history-gallery-grid");

    expect(gallery).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "결과 갤러리" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "상태 활동" })).not.toBeInTheDocument();
    expect(screen.getAllByText("이미지").length).toBeGreaterThan(0);
    expect(screen.getAllByText("실패").length).toBeGreaterThan(0);
    expect(screen.getAllByText("처리중").length).toBeGreaterThan(0);
  });

  it("notifies the parent when a completed result preview is selected", async () => {
    mockMatchMedia({ isMdUp: false, isXlUp: false });
    const onSelectItem = vi.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <HistoryList
        items={[
          {
            id: "completed-1",
            type: "image",
            status: "completed",
            prompt: "detail prompt",
            model: "flux2-klein-9b",
            createdAt: "2026-02-03T00:00:00.000Z",
            resultUrl: "https://example.com/result.png",
            thumbnailUrl: "https://example.com/thumb.png",
            errorMessage: null,
          },
        ]}
        onSelectItem={onSelectItem}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /결과 상세 보기: detail prompt/ }),
    );

    expect(onSelectItem).toHaveBeenCalledWith(
      expect.objectContaining({ id: "completed-1" }),
    );
  });

  it.each([
    {
      name: "small viewport",
      media: { isMdUp: false, isXlUp: false },
    },
    {
      name: "medium viewport",
      media: { isMdUp: true, isXlUp: false },
    },
    {
      name: "xl viewport",
      media: { isMdUp: true, isXlUp: true },
    },
  ])("uses responsive masonry skeleton grid for $name", ({ media }) => {
    mockMatchMedia(media);

    const { container } = renderWithIntl(<HistoryList items={[]} isLoading />);

    const wrapper = container.firstElementChild;
    expect(wrapper).toBeTruthy();
    expect(wrapper).toHaveClass("grid");
    expect(wrapper).toHaveClass("grid-cols-2");
    expect(wrapper).toHaveClass("md:grid-cols-4");
    expect(wrapper).toHaveClass("xl:grid-cols-6");
    expect(wrapper).not.toHaveClass("columns-1");

    expect(wrapper?.children.length).toBe(12);
    expect(wrapper?.children[0]).toHaveClass("md:col-span-2");
    expect(wrapper?.children[2]).toHaveClass("row-span-3");
  });
});
