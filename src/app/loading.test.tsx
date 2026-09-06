import { createTranslator } from "next-intl";
import koMessages from "@/shared/i18n/messages/ko.json";
import { vi } from "vitest";
vi.mock("next-intl/server", () => ({ getTranslations: async () => createTranslator({ locale: "ko", messages: koMessages, namespace: "routeState" }) }));
import { render, screen } from "@testing-library/react";
import Loading from "@/app/loading";

describe("Loading", () => {
  it("renders only a centered spinner without the route-state card content", async () => {
    const { container } = render(await Loading());

    expect(screen.getByRole("status", { name: "불러오는 중…" })).toBeInTheDocument();
    expect(container.querySelector("[data-app-card]")).toBeNull();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});
