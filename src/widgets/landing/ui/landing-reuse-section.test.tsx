import type React from "react";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LandingReuseSection } from "@/widgets/landing/ui/landing-reuse-section";
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

describe("LandingReuseSection", () => {
  it("does not render the old sample visual", () => {
    const { container } = renderWithIntl(<LandingReuseSection />);
    const sampleImageSrc = `/sample-${"image"}.png`;
    const reusableReferencePattern = new RegExp(["reusable", "reference"].join(" "), "i");
    const referenceImagePattern = new RegExp(["reference", "image"].join(" "), "i");

    expect(container.querySelector(`img[src="${sampleImageSrc}"]`)).toBeNull();
    expect(container).not.toHaveTextContent(reusableReferencePattern);
    expect(screen.queryByAltText(referenceImagePattern)).not.toBeInTheDocument();

    const historyCta = screen.getByRole("link", { name: "Explore history" });
    expect(historyCta).toHaveAttribute("href", "/history");
    expect(historyCta).toHaveClass("bg-primary");
    expect(historyCta).not.toHaveClass("bg-white");
    const heading = screen.getByRole("heading", {
      name: "Results you can reuse.",
    });
    expect(heading).toHaveClass("mt-7");
    expect(heading).toHaveClass("max-w-[11ch]");
    expect(heading).toHaveClass("leading-[0.95]");
    expect(
      screen.getByText(
        "Reflective editorial portrait beside a dim studio mirror, soft fabric detail, cinematic shadow.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("v2")).not.toBeInTheDocument();
    expect(screen.queryByText(/hiking in the mountains/i)).not.toBeInTheDocument();
  });
});
