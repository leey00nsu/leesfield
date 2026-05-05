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

vi.mock("motion/react", () => ({
  motion: {
    div: ({
      animate,
      children,
      initial,
      transition,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & {
      animate?: unknown;
      initial?: unknown;
      transition?: unknown;
    }) => (
      <div
        {...props}
        data-motion-animate={JSON.stringify(animate)}
        data-motion-initial={JSON.stringify(initial)}
        data-motion-transition={JSON.stringify(transition)}
      >
        {children}
      </div>
    ),
  },
  useReducedMotion: () => false,
}));

describe("LandingHero", () => {
  it("shows media-first creation entry points before technical documentation", () => {
    renderWithIntl(<LandingHero />);

    const panel = screen.getByRole("region", { name: "생성 패널" });
    expect(panel).toBeInTheDocument();
    expect(screen.getByTestId(["warp", "shader"].join("-"))).toBeInTheDocument();
    expect(panel).toHaveClass("bg-[#07090a]");
    const shaderMotion = screen.getByTestId("landing-hero-shader-motion");
    const borderMotion = screen.getByTestId("landing-hero-form-border-motion");
    const formMotion = screen.getByTestId("landing-hero-form-motion");
    const shaderPanel = screen.getByTestId("warp-shader-panel");
    const formSurface = screen.getByTestId("landing-hero-form-surface");
    expect(panel.firstElementChild).toBe(shaderMotion);
    expect(shaderMotion).toHaveAttribute("data-layer", "hero-form-shader");
    expect(shaderMotion).toHaveClass("absolute");
    expect(shaderMotion).toHaveClass("inset-0");
    expect(formMotion).toHaveClass("relative");
    expect(shaderMotion).toContainElement(shaderPanel);
    expect(formSurface).toContainElement(borderMotion);
    expect(formSurface).toContainElement(formMotion);
    expect(borderMotion).not.toContainElement(formMotion);
    expect(formMotion).not.toContainElement(formSurface);
    expect(formMotion).toContainElement(screen.getByTestId("shared-prompt-form-surface"));
    expect(formMotion).not.toContainElement(shaderPanel);
    expect(formSurface).toHaveClass("border-0");
    expect(borderMotion).toHaveClass("pointer-events-none");
    expect(borderMotion).toHaveClass("absolute");
    expect(borderMotion).toHaveClass("inset-0");
    expect(borderMotion).toHaveClass("border");
    expect(borderMotion).toHaveClass("border-white/12");
    expect(formSurface).not.toHaveAttribute("data-motion-initial");
    expect(formSurface).not.toHaveAttribute("data-motion-animate");
    expect(formSurface).not.toHaveAttribute("data-motion-transition");
    for (const layer of [shaderMotion, borderMotion, formMotion]) {
      expect(layer).toHaveAttribute(
        "data-motion-initial",
        JSON.stringify({ opacity: 0 }),
      );
      expect(layer).toHaveAttribute(
        "data-motion-animate",
        JSON.stringify({ opacity: 1 }),
      );
      expect(layer).toHaveAttribute(
        "data-motion-transition",
        JSON.stringify({
          delay: 0.18,
          duration: 0.72,
          ease: [0.22, 1, 0.36, 1],
        }),
      );
    }
    expect(shaderPanel).not.toHaveClass("animate-in");
    expect(shaderPanel).not.toHaveClass("fade-in");
    expect(
      formSurface,
    ).toHaveClass("relative");
    expect(
      formSurface,
    ).toHaveAttribute("data-app-card");
    expect(
      formSurface,
    ).toHaveAttribute("data-variant", "editorial-flat");
    expect(
      formSurface,
    ).toHaveAttribute("data-surface", "hero");
    expect(
      formSurface,
    ).toHaveClass("bg-black/24");
    expect(
      formSurface,
    ).toHaveClass("backdrop-blur-xl");
    expect(screen.getByTestId("shared-prompt-form-surface")).toHaveClass(
      "bg-black/18",
    );
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

  it("keeps the blur surface stable while motion fades inner content after client-side navigation", () => {
    const firstRender = renderWithIntl(<LandingHero />);
    firstRender.unmount();
    renderWithIntl(<LandingHero />);

    const shaderMotion = screen.getByTestId("landing-hero-shader-motion");
    const borderMotion = screen.getByTestId("landing-hero-form-border-motion");
    const formMotion = screen.getByTestId("landing-hero-form-motion");
    const panel = screen.getByTestId("warp-shader-panel");
    expect(shaderMotion).toHaveAttribute(
      "data-motion-initial",
      formMotion.getAttribute("data-motion-initial"),
    );
    expect(borderMotion).toHaveAttribute(
      "data-motion-initial",
      formMotion.getAttribute("data-motion-initial"),
    );
    expect(shaderMotion).toHaveAttribute(
      "data-motion-animate",
      formMotion.getAttribute("data-motion-animate"),
    );
    expect(borderMotion).toHaveAttribute(
      "data-motion-animate",
      formMotion.getAttribute("data-motion-animate"),
    );
    expect(shaderMotion).toHaveAttribute(
      "data-motion-transition",
      formMotion.getAttribute("data-motion-transition"),
    );
    expect(borderMotion).toHaveAttribute(
      "data-motion-transition",
      formMotion.getAttribute("data-motion-transition"),
    );
    expect(shaderMotion).toContainElement(panel);
    expect(screen.getByTestId("landing-hero-form-surface")).toContainElement(
      formMotion,
    );
    expect(formMotion).toContainElement(
      screen.getByTestId("shared-prompt-form-surface"),
    );
    expect(formMotion).not.toContainElement(
      screen.getByTestId("landing-hero-form-surface"),
    );
    expect(formMotion).not.toContainElement(panel);
    expect(panel).toHaveClass("bg-[#07090a]");
    expect(panel).not.toHaveClass("animate-in");
    expect(panel).not.toHaveClass("fade-in");
    expect(panel.parentElement).toBe(shaderMotion);
    expect(screen.getByTestId("warp-shader-layer")).toHaveClass("opacity-100");
    expect(screen.getByTestId("warp-shader-scrim")).toHaveClass(
      "bg-[#07090a]/35",
    );
  });
});
