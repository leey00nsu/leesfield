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

    renderWithIntl(<ApiDocsWidget openApiDocument={openApiDocument} />);

    expect(document.getElementById("introduction")).toBeTruthy();
    expect(document.getElementById("authentication")).toBeTruthy();
    expect(document.getElementById("errors")).toBeTruthy();
    expect(document.getElementById("images")).toBeTruthy();
    expect(document.getElementById("videos")).toBeTruthy();
    expect(document.getElementById("audio")).toBeTruthy();
    expect(document.getElementById("models")).toBeTruthy();
  });
});
