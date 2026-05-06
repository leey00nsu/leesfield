import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl";
import { getOpenApiDocument } from "@/features/api-docs/model/openapi";
import { ApiDocsWidget } from "@/widgets/api-docs/ui/api-docs-widget";

describe("ApiDocsWidget", () => {
  beforeAll(() => {
    if (!window.requestAnimationFrame) {
      window.requestAnimationFrame = (callback) =>
        window.setTimeout(callback, 0);
    }
  });

  it("API 문서 주요 섹션이 렌더링된다", () => {
    const openApiDocument = getOpenApiDocument();

    const { container } = renderWithIntl(
      <ApiDocsWidget openApiDocument={openApiDocument} />,
    );

    expect(document.getElementById("introduction")).toBeTruthy();
    expect(document.getElementById("authentication")).toBeTruthy();
    expect(document.getElementById("errors")).toBeTruthy();
    expect(document.getElementById("images")).toBeTruthy();
    expect(document.getElementById("post-/api/external/image-generation")).toBeTruthy();
    expect(document.getElementById("videos")).toBeTruthy();
    expect(document.getElementById("audio")).toBeTruthy();
    expect(document.getElementById("models")).toBeTruthy();
    expect(container.querySelector("h1")).toBeNull();
    expect(container.querySelector("[data-app-card]")).toBeTruthy();
    expect(container.querySelector("[data-app-badge]")).toBeTruthy();
    expect(container.querySelector(".sticky")).toBeTruthy();
    expect(
      screen.getAllByRole("link", { name: /POST\/api\/external\/image-generation/i })
        .length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByRole("navigation", { name: "API 레퍼런스" }),
    ).toBeInTheDocument();
  });
});
