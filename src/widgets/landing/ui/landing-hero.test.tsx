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

describe("LandingHero", () => {
  it("shows media-first creation entry points before technical documentation", () => {
    renderWithIntl(<LandingHero />);

    expect(
      screen.getByRole("region", { name: "크리에이티브 미디어 콜라주" }),
    ).toBeInTheDocument();
    expect(screen.getByAltText("오디오 콘솔 사진")).toBeInTheDocument();

    const imageLink = screen.getByRole("link", { name: /이미지 만들기/ });
    const videoLink = screen.getByRole("link", { name: /비디오 만들기/ });
    const audioLink = screen.getByRole("link", { name: /오디오 만들기/ });

    expect(imageLink).toHaveAttribute("href", "/image");
    expect(videoLink).toHaveAttribute("href", "/video");
    expect(audioLink).toHaveAttribute("href", "/audio");

    expect(screen.queryByText("네온 패션 editorial")).not.toBeInTheDocument();
    expect(
      screen.queryByText("한 화면에서 결과 타입을 보고 바로 생성 흐름으로 이동합니다."),
    ).not.toBeInTheDocument();

    expect(
      screen.getByRole("link", { name: /API 문서/ }),
    ).toHaveAttribute("href", "/api-docs");
  });
});
