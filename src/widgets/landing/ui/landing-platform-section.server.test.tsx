import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  LandingPlatformClientSection,
  LandingPlatformMonitoringData,
} from "@/widgets/landing/ui/landing-platform-section-client";
import { LandingPlatformSection } from "@/widgets/landing/ui/landing-platform-section";

const getModelCatalogMock = vi.hoisted(() => vi.fn());
const landingPlatformClientMock = vi.hoisted(() =>
  vi.fn(
    ({
      monitoring,
    }: {
      monitoring: LandingPlatformMonitoringData;
    }) => (
      <div data-testid="landing-platform-client">
        {monitoring.totalCount}
      </div>
    ),
  ),
);

vi.mock("@/server/model-catalog/catalog-service", () => ({
  getModelCatalog: getModelCatalogMock,
}));

vi.mock("@/widgets/landing/ui/landing-platform-section-client", () => ({
  LandingPlatformClientSection: landingPlatformClientMock,
}));

type LandingPlatformClientProps = Parameters<typeof LandingPlatformClientSection>[0];

describe("LandingPlatformSection", () => {
  it("passes static showcase metrics to landing instead of live monitoring totals", async () => {
    getModelCatalogMock.mockResolvedValue([
      {
        key: "gpt-image-2",
        label: "GPT Image 2",
        vendor: "OpenAI",
        provider: "codex_bridge",
        type: "image",
      },
      {
        key: "veo-3.1",
        label: "Veo 3.1",
        vendor: "Google",
        provider: "gradio",
        type: "video",
      },
    ]);

    render(await LandingPlatformSection());

    expect(screen.getByTestId("landing-platform-client")).toHaveTextContent(
      "12486",
    );
    const props = landingPlatformClientMock.mock
      .calls[0]?.[0] as LandingPlatformClientProps;
    expect(props.monitoring.totalCount).toBe(12486);
    expect(props.monitoring.successRate).toBe(97.8);
    expect(props.monitoring.usage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Image", value: 42 }),
        expect.objectContaining({ name: "Video", value: 28 }),
        expect.objectContaining({ name: "Audio", value: 19 }),
      ]),
    );
    expect(props.monitoring.trend).toHaveLength(7);
  });
});
