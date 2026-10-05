const privateCatalog = vi.hoisted(() => vi.fn(() => ({ imageModels: [], videoModels: [], audioModels: [] })));
vi.mock("@/shared/lib/hooks/use-runtime-model-catalog", () => ({ useRuntimeModelCatalog: privateCatalog }));
import type React from "react";
import userEvent from "@testing-library/user-event";
import { screen, within } from "@testing-library/react";
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
    delete (imageProps as Record<string, unknown>).unoptimized;

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

vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  motion: {
    linearGradient: (await importOriginal<typeof import("motion/react")>()).motion.linearGradient,
    p: (await importOriginal<typeof import("motion/react")>()).motion.p,
    span: (await importOriginal<typeof import("motion/react")>()).motion.span,
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

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
describe("LandingHero", () => {
  it("updates the preview and destination without submitting a generation", async () => {
    const user = userEvent.setup();
    renderWithIntl(<LandingHero />);
    await user.click(screen.getByRole("tab", { name: "오디오" }));
    expect(screen.getByRole("tab", { name: "오디오" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByTestId("landing-generation-entry")).toHaveAttribute("href", "/login?returnTo=%2Fgenerate%3Ftype%3Daudio");
    expect(screen.getByText("생성할 음성이나 오디오를 설명해 주세요.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
  it("shows media-first creation entry points before technical documentation", () => {
    renderWithIntl(<LandingHero />);

    const panel = screen.getByRole("region", { name: "생성 패널" });
    expect(panel).toBeInTheDocument();
    expect(screen.getByTestId("landing-hero-composer-motion")).toContainElement(
      screen.getByRole("tab", { name: "이미지" }),
    );
    expect(
      screen.getByRole("link", { name: /스페이스가 추가되었어요/ }),
    ).toHaveAttribute("href", "#spaces");
    expect(
      screen.getByTestId(["warp", "shader"].join("-")),
    ).toBeInTheDocument();
    expect(panel.className).toContain("radial-gradient");
    expect(screen.getByTestId("landing-hero-composer-motion")).toHaveAttribute("data-motion-initial", JSON.stringify({y:28,scale:0.98}));
    expect(panel).not.toHaveClass("border");
    expect(panel).not.toHaveClass("border-white/10");
    const previewBorderMotion = screen.getByTestId(
      "landing-hero-preview-border-motion",
    );
    const shaderMotion = screen.getByTestId("landing-hero-shader-motion");
    const borderMotion = screen.getByTestId("landing-hero-form-border-motion");
    const formMotion = screen.getByTestId("landing-hero-form-motion");
    const shaderPanel = screen.getByTestId("warp-shader-panel");
    const formSurface = screen.getByTestId("landing-hero-form-surface");
    expect(panel.firstElementChild).toBe(previewBorderMotion);
    expect(previewBorderMotion).toHaveClass("pointer-events-none");
    expect(previewBorderMotion).toHaveClass("absolute");
    expect(previewBorderMotion).toHaveClass("inset-0");
    expect(previewBorderMotion).toHaveClass("rounded-[1.5rem]");
    expect(previewBorderMotion).toHaveClass("border");
    expect(previewBorderMotion).toHaveClass("border-white/10");
    expect(shaderMotion).toHaveAttribute("data-layer", "hero-form-shader");
    expect(shaderMotion).toHaveClass("absolute");
    expect(shaderMotion).toHaveClass("inset-0");
    expect(formMotion).toHaveClass("relative");
    expect(shaderMotion).toContainElement(shaderPanel);
    expect(formSurface).toContainElement(borderMotion);
    expect(formSurface).toContainElement(formMotion);
    expect(borderMotion).not.toContainElement(formMotion);
    expect(formMotion).not.toContainElement(formSurface);
    expect(formMotion).toContainElement(
      screen.getByTestId("shared-prompt-form-surface"),
    );
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
    for (const layer of [
      previewBorderMotion,
      shaderMotion,
      borderMotion,
      formMotion,
    ]) {
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
    expect(formSurface).toHaveClass("relative");
    expect(formSurface).toHaveAttribute("data-app-card");
    expect(formSurface).toHaveAttribute("data-variant", "editorial-flat");
    expect(formSurface).toHaveAttribute("data-surface", "hero");
    expect(formSurface).toHaveClass("bg-black/24");
    expect(formSurface).toHaveClass("backdrop-blur-xl");
    expect(screen.getByTestId("shared-prompt-form-surface")).toHaveClass(
      "bg-card",
    );
    expect(screen.queryByText("크리에이티브 스튜디오")).not.toBeInTheDocument();
    expect(screen.queryByAltText("오디오 콘솔 사진")).not.toBeInTheDocument();
    expect(screen.queryByText("Recent generations")).not.toBeInTheDocument();
    expect(screen.queryByText("Developer first")).not.toBeInTheDocument();
    expect(screen.queryByText("Production ready")).not.toBeInTheDocument();
    expect(screen.queryByText("Monitor and optimize")).not.toBeInTheDocument();

    const headline = screen.getByRole("heading", {
      name: "모든 AI 모델을 하나의 인터페이스로",
    });
    expect(headline).toBeInTheDocument();
    expect(headline.querySelectorAll("span.block")).toHaveLength(1);
    expect(headline.querySelector("span.block")).toHaveClass(
      "sm:whitespace-nowrap",
    );
    expect(
      headline.querySelector("[data-title-step]"),
    ).toBeInTheDocument();

    expect(screen.getByRole("tab", { name: "이미지" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "비디오" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "오디오" })).toBeInTheDocument();

    expect(screen.queryByText("네온 패션 editorial")).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "한 화면에서 결과 타입을 보고 바로 생성 흐름으로 이동합니다.",
      ),
    ).not.toBeInTheDocument();

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByTestId("landing-generation-entry")).toHaveAttribute("href", "/login?returnTo=%2Fgenerate%3Ftype%3Dimage");
  });

  it.each([false, true])("uses one private-catalog-free entry action with authentication %s", async isAuthenticated => {
    privateCatalog.mockClear();
    const user = userEvent.setup();
    renderWithIntl(<LandingHero isAuthenticated={isAuthenticated} />);
    for (const [label, type] of [["이미지", "image"], ["비디오", "video"], ["오디오", "audio"]]) {
      await user.click(screen.getByRole("tab", { name: label }));
      const field = screen.getByTestId("landing-hero-form-surface");
      const entry = within(field).getByRole("link", { name: "생성" });
      expect(entry).toHaveAttribute("href", isAuthenticated ? `/generate?type=${type}` : `/login?returnTo=${encodeURIComponent(`/generate?type=${type}`)}`);
      expect(within(field).queryAllByRole("button")).toHaveLength(0);
      expect(field.querySelectorAll("input,textarea,[contenteditable=true]")).toHaveLength(0);
      expect(field).toHaveTextContent("GPT Image 2.5");
      expect(field).not.toHaveTextContent("model-a");
      expect(entry.getAttribute("href")).not.toMatch(/model|vendor|preset|prompt|key/i);
      entry.focus(); expect(entry).toHaveFocus();
    }
    expect(privateCatalog).not.toHaveBeenCalled();
  });

  it("keeps the blur surface stable while motion fades inner content after client-side navigation", () => {
    const firstRender = renderWithIntl(<LandingHero />);
    firstRender.unmount();
    renderWithIntl(<LandingHero />);

    const previewBorderMotion = screen.getByTestId(
      "landing-hero-preview-border-motion",
    );
    const shaderMotion = screen.getByTestId("landing-hero-shader-motion");
    const borderMotion = screen.getByTestId("landing-hero-form-border-motion");
    const formMotion = screen.getByTestId("landing-hero-form-motion");
    const panel = screen.getByTestId("warp-shader-panel");
    expect(previewBorderMotion).toHaveAttribute(
      "data-motion-initial",
      formMotion.getAttribute("data-motion-initial"),
    );
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
    expect(previewBorderMotion).toHaveAttribute(
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
    expect(previewBorderMotion).toHaveAttribute(
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
