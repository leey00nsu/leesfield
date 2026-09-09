import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, it, expect, vi } from "vitest";
import { LandingTitleMotion, titleInitialStyle } from "./landing-title-motion";

vi.mock("./use-landing-reduced-motion", () => ({ useLandingReducedMotion: () => true }));

function Title({ locale }: { locale: string }) {
  const word = locale === "ko" ? "하나의" : "One";
  return <NextIntlClientProvider locale={locale} messages={{}}>
    <LandingTitleMotion><span key={word} data-title-step="2" style={titleInitialStyle}>{word}</span></LandingTitleMotion>
  </NextIntlClientProvider>;
}

describe("landing title language changes", () => {
  it("reveals replaced words after locale changes with reduced motion", async () => {
    const view = render(<Title locale="ko" />);
    await waitFor(() => expect(screen.getByText("하나의")).toHaveStyle({ opacity: "1" }));
    view.rerender(<Title locale="en" />);
    await waitFor(() => expect(screen.getByText("One")).toHaveStyle({ opacity: "1" }));
    view.rerender(<Title locale="ko" />);
    view.rerender(<Title locale="en" />);
    view.rerender(<Title locale="ko" />);
    await waitFor(() => expect(screen.getByText("하나의")).toHaveStyle({ opacity: "1", filter: "blur(0px)" }));
  });
});
