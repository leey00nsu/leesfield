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

    expect(document.getElementById("introduction")).toBeInTheDocument();
    expect(document.getElementById("authentication")).toBeInTheDocument();
    expect(document.getElementById("errors")).toBeInTheDocument();
    expect(document.getElementById("images")).toBeInTheDocument();
    expect(document.getElementById("videos")).toBeInTheDocument();
    expect(document.getElementById("models")).toBeInTheDocument();
  });
});
