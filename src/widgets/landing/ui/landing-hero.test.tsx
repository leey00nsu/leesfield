import type React from "react";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LandingHero } from "@/widgets/landing/ui/landing-hero";
import { renderWithIntl } from "@/test-utils/intl";

vi.mock("next/image", () => ({
  default: (
    props: React.ImgHTMLAttributes<HTMLImageElement> & {
    fill?: boolean;
    priority?: boolean;
  },
  ) => {
    const imageProps = { ...props };
    delete imageProps.fill;
    delete imageProps.priority;

    // eslint-disable-next-line @next/next/no-img-element
    return <img {...imageProps} alt={imageProps.alt ?? ""} />;
  },
}));

vi.mock("@paper-design/shaders-react", () => ({
  Warp: ({
    style,
  }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => (
    <div data-testid="warp-shader" style={style} />
  ),
}));

describe("LandingHero", () => {
  it("shows media-first creation entry points before technical documentation", () => {
    renderWithIntl(<LandingHero />);

    const panel = screen.getByRole("region", { name: "생성 패널" });
    expect(panel).toBeInTheDocument();
    expect(screen.getByTestId(["warp", "shader"].join("-"))).toBeInTheDocument();
    expect(panel.firstElementChild).toHaveAttribute("data-layer", "hero-form-shader");
    expect(panel.firstElementChild).toHaveClass("lf-hero-shader-fade");
    expect(panel).toHaveClass("bg-[#07090a]");
    expect(
      screen.getByTestId("landing-hero-form-surface"),
    ).toHaveClass("relative");
    expect(
      screen.getByTestId("shared-prompt-form-surface"),
    ).toHaveClass("bg-black/18");
    expect(screen.queryByText("크리에이티브 스튜디오")).not.toBeInTheDocument();
    expect(screen.queryByAltText("오디오 콘솔 사진")).not.toBeInTheDocument();
    expect(screen.queryByText("Recent generations")).not.toBeInTheDocument();
    expect(screen.queryByText("Developer first")).not.toBeInTheDocument();
    expect(screen.queryByText("Production ready")).not.toBeInTheDocument();
    expect(screen.queryByText("Monitor and optimize")).not.toBeInTheDocument();

    const headline = screen.getByRole("heading", {
      name: "Generate anything. One platform for image, video, and audio.",
    });
    expect(headline).toBeInTheDocument();
    expect(headline).toHaveClass("text-[clamp(2.15rem,3.55vw,3.85rem)]");
    expect(headline.querySelectorAll("span.block")).toHaveLength(2);
    expect(headline.querySelector("span.block")).toHaveClass("sm:whitespace-nowrap");
    expect(headline.querySelector(".lf-text-generate-word")).toBeInTheDocument();

    const imageLink = screen.getByRole("link", { name: "Image" });
    const videoLink = screen.getByRole("link", { name: "Video" });
    const audioLink = screen.getByRole("link", { name: "Audio" });

    expect(imageLink).toHaveAttribute("href", "/image");
    expect(videoLink).toHaveAttribute("href", "/video");
    expect(audioLink).toHaveAttribute("href", "/audio");

    expect(screen.queryByText("네온 패션 editorial")).not.toBeInTheDocument();
    expect(
      screen.queryByText("한 화면에서 결과 타입을 보고 바로 생성 흐름으로 이동합니다."),
    ).not.toBeInTheDocument();

    expect(screen.getByRole("textbox", { name: "프롬프트" })).toHaveAttribute(
      "readonly",
    );
    expect(screen.getByRole("link", { name: /Generate/ })).toHaveAttribute(
      "href",
      "/image",
    );
  });
});
