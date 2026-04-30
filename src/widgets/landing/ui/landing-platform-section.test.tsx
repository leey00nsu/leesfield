import type React from "react";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LandingPlatformClientSection } from "@/widgets/landing/ui/landing-platform-section-client";
import { renderWithIntl } from "@/test-utils/intl";

vi.mock("next/image", () => ({
  default: (
    props: React.ImgHTMLAttributes<HTMLImageElement> & {
      fill?: boolean;
      sizes?: string;
    },
  ) => {
    const imageProps = { ...props };
    delete imageProps.fill;
    delete imageProps.sizes;

    // eslint-disable-next-line @next/next/no-img-element
    return <img {...imageProps} alt={imageProps.alt ?? ""} />;
  },
}));

vi.mock("recharts", async () => {
  const ReactModule = await vi.importActual<typeof import("react")>("react");
  const Chart = ({
    children,
    data,
    ...props
  }: React.PropsWithChildren<{ data?: unknown[] }>) =>
    ReactModule.createElement(
      "div",
      {
        "data-chart": JSON.stringify(data ?? []),
        ...props,
      },
      ReactModule.Children.toArray(children).filter(
        (child) =>
          ReactModule.isValidElement(child) && typeof child.type !== "string",
      ),
    );
  const Primitive = ({ children }: React.PropsWithChildren) =>
    ReactModule.createElement("div", null, children);

  return {
    Area: Primitive,
    AreaChart: Chart,
    CartesianGrid: Primitive,
    Cell: Primitive,
    Label: Primitive,
    Line: Primitive,
    Pie: Primitive,
    PieChart: Chart,
    ResponsiveContainer: ({ children }: React.PropsWithChildren) =>
      ReactModule.createElement("div", null, children),
    Tooltip: Primitive,
    XAxis: Primitive,
    YAxis: Primitive,
  };
});

describe("LandingPlatformSection", () => {
  it("uses real catalog model names and chart surfaces instead of placeholder widgets", () => {
    renderWithIntl(
      <LandingPlatformClientSection
        featuredModels={[
          {
            key: "gpt-image-2",
            label: "GPT Image 2",
            vendor: "OpenAI",
            provider: "codex_bridge",
            modality: "Image",
            asset: "/assets/creative-studio/studio-vocalist.jpg",
          },
          {
            key: "wan-2.2-hf-space",
            label: "Wan 2.2 (HF Space)",
            vendor: "Wan",
            provider: "hf_space",
            modality: "Video",
            asset: "/assets/creative-studio/film-production.jpg",
          },
        ]}
        monitoring={{
          totalCount: 70,
          successRate: 97.1,
          trend: [
            { day: "04/28", requests: 24, errors: 1 },
            { day: "04/29", requests: 46, errors: 1 },
          ],
          usage: [
            {
              name: "GPT Image 2",
              value: 65,
              total: 45,
              color: "#d4f032",
            },
            {
              name: "Wan 2.2 (HF Space)",
              value: 35,
              total: 25,
              color: "#f5f2df",
            },
          ],
        }}
      />,
    );

    expect(screen.getAllByText("GPT Image 2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Wan 2.2 (HF Space)").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Leesfield V2/i)).not.toBeInTheDocument();

    expect(
      screen.getByRole("img", { name: "Monitoring requests trend" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Usage by model distribution" }),
    ).toBeInTheDocument();

    expect(screen.getByText("Review")).toBeInTheDocument();
    expect(screen.getByText("Generate")).toBeInTheDocument();
    expect(screen.getByText("Deploy")).toBeInTheDocument();

    const docsCard = screen.getByTestId("landing-docs-card");
    expect(docsCard).toHaveAttribute("data-app-card");
    expect(docsCard).toHaveAttribute("data-variant", "editorial");
    expect(docsCard).toHaveClass("border");
    expect(docsCard).toHaveClass("border-white/14");
  });
});
