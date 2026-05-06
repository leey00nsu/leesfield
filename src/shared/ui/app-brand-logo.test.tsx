import type React from "react";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppBrandLogo } from "@/shared/ui/app-brand-logo";
import { renderWithIntl } from "@/test-utils/intl";

vi.mock("next/image", () => ({
  default: (
    props: React.ImgHTMLAttributes<HTMLImageElement> & {
      priority?: boolean;
    },
  ) => {
    const imageProps = { ...props };
    delete imageProps.priority;

    // eslint-disable-next-line @next/next/no-img-element
    return <img {...imageProps} alt={imageProps.alt ?? ""} />;
  },
}));

describe("AppBrandLogo", () => {
  it("uses a slightly stronger wordmark weight without changing the label", () => {
    renderWithIntl(<AppBrandLogo label="leesfield" />);

    const wordmark = screen.getByText("leesfield");
    expect(wordmark).toHaveClass("font-display");
    expect(wordmark).toHaveClass("font-medium");
    expect(wordmark).not.toHaveClass("font-normal");
  });

  it("marks icon-only logos with the label for accessibility", () => {
    renderWithIntl(<AppBrandLogo label="leesfield" variant="icon" />);

    expect(screen.getByAltText("leesfield")).toBeInTheDocument();
  });
});
