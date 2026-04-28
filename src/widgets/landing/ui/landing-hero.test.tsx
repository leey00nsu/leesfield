import type React from "react";
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

    // eslint-disable-next-line @next/next/no-img-element
    return <img {...imageProps} alt={imageProps.alt ?? ""} />;
  },
}));

describe("LandingHero", () => {
  it("shows media-first creation entry points before technical documentation", () => {
    renderWithIntl(<LandingHero />);

    expect(
      screen.getByRole("region", { name: "생성 결과 미리보기" }),
    ).toBeInTheDocument();

    const imageLink = screen.getByRole("link", { name: /이미지 만들기/ });
    const videoLink = screen.getByRole("link", { name: /비디오 만들기/ });
    const audioLink = screen.getByRole("link", { name: /오디오 만들기/ });

    expect(imageLink).toHaveAttribute("href", "/image");
    expect(videoLink).toHaveAttribute("href", "/video");
    expect(audioLink).toHaveAttribute("href", "/audio");

    const starterPrompts = screen.getByRole("list", { name: "시작 프롬프트" });
    expect(within(starterPrompts).getAllByRole("listitem")).toHaveLength(3);

    expect(
      screen.getByRole("link", { name: /API 문서/ }),
    ).toHaveAttribute("href", "/api-docs");
  });
});
