import { act, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GenerationCanvas } from "@/shared/ui/generation-canvas";
import { renderWithIntl } from "@/test-utils/intl";

describe("GenerationCanvas", () => {
  it("does not add a dashed result boundary or decorative dot gradient by default", () => {
    const { container } = renderWithIntl(
      <GenerationCanvas isGenerating={false} status="idle">
        <div>result content</div>
      </GenerationCanvas>,
    );

    const canvas = container.firstElementChild;
    expect(canvas).not.toHaveClass("border-dashed");
    expect(canvas).not.toHaveClass("border-2");
    expect(container.querySelector("[class*='radial-gradient']")).toBeNull();
  });

  it("renders empty state separately when there is no generated content", () => {
    renderWithIntl(
      <GenerationCanvas
        hasContent={false}
        emptyState={<button type="button">프리셋으로 시작</button>}
        isGenerating={false}
        status="idle"
      >
        <div>result content</div>
      </GenerationCanvas>,
    );

    expect(
      screen.getByRole("button", { name: "프리셋으로 시작" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("result content")).not.toBeInTheDocument();
  });
});

it("uses the server receipt after remount and freezes at each terminal status", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-15T00:00:10Z"));
  try {
    const props = {createdAt:"2026-10-15T00:00:00Z", finishedAt:null};
    const view = renderWithIntl(<GenerationCanvas isGenerating status="pending" {...props} />);
    expect(screen.getByText("대기 중…")).toBeVisible();
    expect(screen.getByRole("status").querySelector("svg.animate-spin")).not.toBeNull();
    expect(screen.getByText("10초 경과")).toBeVisible();
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByText("12초 경과")).toBeVisible();
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    for (const status of ["completed", "failed", "cancelled"] as const) {
      const terminal = renderWithIntl(<GenerationCanvas isGenerating={false} status={status} createdAt={props.createdAt} finishedAt="2026-10-15T00:00:08Z" />);
      expect(screen.getByText("8초 소요")).toBeVisible();
      act(() => { vi.advanceTimersByTime(3000); });
      expect(screen.getByText("8초 소요")).toBeVisible();
      terminal.unmount();
      expect(vi.getTimerCount()).toBe(0);
    }
    const restored = renderWithIntl(<GenerationCanvas isGenerating status="processing" {...props} />);
    expect(screen.getByText("21초 경과")).toBeVisible();
    restored.unmount();
  } finally { vi.useRealTimers(); }
});

it("does not invent an end time for old terminal records", () => {
  const view=renderWithIntl(<GenerationCanvas isGenerating={false} status="completed" createdAt="2026-10-15T00:00:00Z" />);
  expect(screen.getByText("시간 미확인")).toBeVisible();
  view.unmount();
});
