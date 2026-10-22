import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/test-utils/intl";
import enMessages from "@/shared/i18n/messages/en.json";
import { AppCanvasModelList, type AppCanvasModelListItem } from "./app-canvas-model-list";

const items: readonly AppCanvasModelListItem[] = [
  { id: "canonical-image", modelId: "models/Run node", name: "Run node", provider: "openai", type: "image", modalities: ["Image Input"] },
  { id: "canonical-llm", name: "Assistant model", provider: "custom-provider", type: "llm", modalities: [] },
];

describe("application canvas model list", () => {
  it.each(["ko", "en"] as const)("uses %s UI copy and preserves model names, identifiers, and selection keys", locale => {
    const onSelect = vi.fn();
    renderWithIntl(<AppCanvasModelList items={items} loading={false} error={null} onSelect={onSelect}
      recentIds={["canonical-image"]} selectedId="canonical-llm" />, locale === "en" ? { locale, messages: enMessages } : undefined);
    expect(screen.getByText(locale === "ko" ? "최근 사용" : "Recently Used")).toBeInTheDocument();
    expect(screen.getByText("models/Run node")).toBeInTheDocument();
    expect(screen.getByText("Image Input")).toBeInTheDocument();
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("LLM")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assistant model" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Run node" }));
    expect(onSelect).toHaveBeenCalledWith("canonical-image");
  });

  it("prevents disabled selection and fallback removal", () => {
    const onSelect = vi.fn(), onClear = vi.fn();
    renderWithIntl(<AppCanvasModelList items={items} loading={false} error={null} disabled onSelect={onSelect} onClear={onClear} />);
    fireEvent.click(screen.getByRole("button", { name: "Run node" }));
    fireEvent.click(screen.getByRole("button", { name: "대체 모델 제거" }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClear).not.toHaveBeenCalled();
  });

  it("shows loading, retryable errors, and an empty result without losing recovery actions", () => {
    const onSelect = vi.fn(), onRetry = vi.fn();
    const { rerender } = renderWithIntl(<AppCanvasModelList items={[]} loading error={null} onSelect={onSelect} />);
    expect(screen.getByRole("status", { name: "모델을 불러오는 중…" })).toBeInTheDocument();
    rerender(<AppCanvasModelList items={[]} loading={false} error="Catalog unavailable" onSelect={onSelect} onRetry={onRetry} />);
    expect(screen.getByText("Catalog unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(onRetry).toHaveBeenCalledOnce();
    rerender(<AppCanvasModelList items={[]} loading={false} error={null} onSelect={onSelect} />);
    expect(screen.getByText("모델을 찾지 못했습니다")).toBeInTheDocument();
  });
});
