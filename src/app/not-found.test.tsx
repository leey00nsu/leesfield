import { createTranslator } from "next-intl";
import koMessages from "@/shared/i18n/messages/ko.json";
import { vi } from "vitest";
vi.mock("next-intl/server", () => ({ getTranslations: async () => createTranslator({ locale: "ko", messages: koMessages, namespace: "routeState" }) }));
import { render, screen } from "@testing-library/react";
import NotFound from "@/app/not-found";

describe("NotFound", () => {
  it("renders the minimal 404 fallback with only the home action", async () => {
    const { container } = render(await NotFound());

    expect(screen.getByText("페이지를 찾을 수 없습니다")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "홈으로" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(container.querySelector("[data-app-card]")).toBeNull();
    expect(container.querySelector("[data-app-button]")).toBeTruthy();
    expect(screen.queryByText("This surface is not available.")).not.toBeInTheDocument();
  });
});
