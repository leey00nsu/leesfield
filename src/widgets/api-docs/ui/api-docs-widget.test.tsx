import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithIntl } from "@/test-utils/intl";
import { getOpenApiDocument } from "@/features/api-docs/model/openapi";
import { getOpenApiTranslations } from "@/features/api-docs/model/openapi-translations";
import { ApiDocsWidget } from "@/widgets/api-docs/ui/api-docs-widget";
import enMessages from "@/shared/i18n/messages/en.json";
import koMessages from "@/shared/i18n/messages/ko.json";

describe("ApiDocsWidget", () => {
  beforeAll(() => {
    if (!window.requestAnimationFrame) {
      window.requestAnimationFrame = (callback) =>
        window.setTimeout(callback, 0);
    }
  });

  it.each([{ locale: "ko", messages: koMessages }, { locale: "en", messages: enMessages }])(
    "shows the current contract and limits in $locale", async ({ locale, messages }) => {
      const user = userEvent.setup();
      renderWithIntl(<ApiDocsWidget openApiDocument={getOpenApiDocument(getOpenApiTranslations(messages))} />, { locale, messages });
      const auth = document.getElementById("authentication")!;
      const source = document.getElementById("openapi")!;
      expect(within(source).getByRole("heading", { name: messages.apiDocs.specification.title })).toBeInTheDocument();
      expect(source.compareDocumentPosition(auth) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      const sourceLink = within(source).getByRole("link", { name: messages.apiDocs.specification.view });
      expect(sourceLink).toHaveAttribute("href", "/api/openapi");
      expect(sourceLink).toHaveAttribute("target", "_blank");
      const download = within(source).getByRole("link", { name: messages.apiDocs.specification.download });
      expect(download).toHaveAttribute("href", "/api/openapi");
      expect(download).toHaveAttribute("download", "openapi.json");
      expect(auth.textContent).toContain("Authorization: Bearer");
      const access = document.getElementById("access")!;
      const requests = document.getElementById("request-options")!;
      expect(within(access).getByRole("heading", { name: messages.apiDocs.access.title })).toBeInTheDocument();
      expect(within(requests).getByRole("heading", { name: messages.apiDocs.requestGuide.title })).toBeInTheDocument();
      for (const permission of ["generations:create", "history:delete", "models:manage", "monitoring:read-all"])
        expect(access.textContent).toContain(permission);
      expect(access.textContent).not.toMatch(/platform:|platform 권한|Legacy platform|access:custom/);
      for (const condition of ["Idempotency-Key", "expectedRevision", "files.maxItems", "64 MiB", "50 MiB"])
        expect(requests.textContent).toContain(condition);
      const sidebar = screen.getByRole("complementary");
      expect(within(sidebar).getByRole("link", { name: messages.apiDocs.access.title })).toHaveAttribute("href", "#access");
      expect(within(sidebar).getByRole("link", { name: messages.apiDocs.requestGuide.title })).toHaveAttribute("href", "#request-options");
      const introduction = document.getElementById("introduction")!;
      const steps = within(introduction).getByRole("list");
      expect(within(steps).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
        "#models", "#post-/api/external/generations", "#get-/api/external/generations/{requestId}",
      ]);
      const generation = document.getElementById("post-/api/external/generations")!;
      const headerTable = within(generation).getByRole("table", { name: messages.apiDocs.endpoints.headers, hidden: true });
      expect(headerTable.textContent).toContain("X-Idempotency-Key");
      expect(headerTable.textContent).toContain("200");
      expect(headerTable.textContent).toContain(messages.apiDocs.openapi.parameters["Idempotency-Key"]);
      const action = messages.apiDocs.openapi.paths.generation;
      expect(within(generation).getByText(action, { exact: true })).toBeInTheDocument();
      const generationPermissions = within(generation).getByRole("table", { name: messages.apiDocs.endpoints.permission });
      const generateLink = within(generationPermissions).getByRole("link", { name: messages.apiKey.permissions.actions.generations_create });
      expect(generateLink).toHaveAttribute("href", "#permission-generations-create");
      const requiredRow = generateLink.closest("tr")!;
      expect(within(requiredRow).getAllByRole("cell")[0]).toHaveTextContent(messages.apiDocs.endpoints.required);
      expect(within(requiredRow).getAllByRole("cell")[2]).toHaveTextContent(messages.apiDocs.endpoints.allRequests);
      const presetLink = within(generationPermissions).getByRole("link", { name: messages.apiKey.permissions.actions.presets_read });
      expect(presetLink).toHaveAttribute("href", "#permission-presets-read");
      expect(presetLink.textContent).not.toContain("promptPreset");
      const presetRow = presetLink.closest("tr")!;
      expect(within(presetRow).getAllByRole("cell")[0]).toHaveTextContent(messages.apiDocs.endpoints.conditional);
      expect(within(presetRow).getAllByRole("cell")[2]).toHaveTextContent("promptPreset");
      const monitoring = document.getElementById("get-/api/external/monitoring/overview")!;
      const monitoringPermissions = within(monitoring).getByRole("table", { name: messages.apiDocs.endpoints.permission });
      const ownerLink = within(monitoringPermissions).getByRole("link", { name: messages.apiKey.permissions.actions.monitoring_read });
      expect(within(ownerLink.closest("tr")!).getAllByRole("cell")[2]).toHaveTextContent(messages.apiDocs.endpoints.allRequests);
      const allLink = within(monitoringPermissions).getByRole("link", { name: messages.apiKey.permissions.actions["monitoring_read-all"] });
      expect(allLink).toHaveAttribute("href", "#permission-monitoring-read-all");
      expect(allLink.textContent).not.toContain("scope");
      const allRow = allLink.closest("tr")!;
      expect(within(allRow).getAllByRole("cell")[0]).toHaveTextContent(messages.apiDocs.endpoints.conditional);
      expect(within(allRow).getAllByRole("cell")[2]).toHaveTextContent("scope=all");
      const identifiers = access.querySelector("details")!;
      expect(identifiers).not.toHaveAttribute("open");
      await user.click(allLink);
      expect(identifiers).toHaveAttribute("open");
      expect(document.getElementById("permission-monitoring-read-all")).toHaveFocus();
      expect(document.getElementById("permission-monitoring-read-all")!.querySelector("dt")).toHaveTextContent(allLink.textContent!);
      await user.click(within(access).getByText(messages.apiDocs.access.identifiers));
      presetLink.focus();
      await user.keyboard("{Enter}");
      expect(identifiers).toHaveAttribute("open");
      expect(document.getElementById("permission-presets-read")).toHaveFocus();
      expect(generation.querySelector("pre")!.textContent).not.toContain("Idempotency-Key");
      expect(generation.querySelector("pre")!.textContent).not.toContain("promptPreset");
      expect(requests.textContent).toContain(locale === "ko" ? "같은 API 키·Idempotency-Key·입력" : "same API key, Idempotency-Key and input");
      const multipart = within(generation).getByText(messages.apiDocs.snippets.multipartTitle).closest("details")!;
      expect(multipart).not.toHaveAttribute("open");
      await user.click(within(generation).getByText(messages.apiDocs.snippets.multipartTitle));
      expect(multipart).toHaveAttribute("open");
      expect(multipart.textContent).toContain("dynamicParams=");
      expect(multipart.textContent).toContain("file:<INPUT_NAME>=@reference-1.png");
      expect(multipart.textContent).toContain("file:<INPUT_NAME>=@reference-2.png");
      expect(within(multipart).getByRole("button", { name: messages.apiDocs.snippets.multipartTitle + " " + messages.apiDocs.snippets.copy })).toBeInTheDocument();
      const detail = document.getElementById("get-/api/external/monitoring/requests/detail")!;
      const detailTable = within(detail).getByRole("table", { name: messages.apiDocs.endpoints.queryParams });
      expect(within(detailTable).getAllByRole("rowheader").map((row) => row.querySelector("code")!.textContent)).toEqual(["scope", "type", "requestId"]);
      const modelCreate = document.getElementById("post-/api/external/admin/models")!;
      const configSummary = modelCreate.querySelector("summary")!;
      expect(configSummary).toHaveTextContent(messages.apiDocs.endpoints.modelConfig);
      const modelConfig = configSummary.closest("details")!;
      await user.click(configSummary);
      expect(modelConfig).toHaveAttribute("open");
      const configTable = within(modelConfig).getByRole("table", { name: messages.apiDocs.endpoints.modelConfig });
      expect(configTable.textContent).toContain("space_id, api_name");
      expect(configTable.textContent).toContain("connection_id, workflow_id, workflow");
      expect(configTable.textContent).toContain("apiKey");
      const history = document.getElementById("get-/api/external/history")!;
      const queryTable = within(history).getByRole("table", { name: messages.apiDocs.endpoints.queryParams });
      const limitRow = within(queryTable).getByRole("rowheader", { name: /limit/ }).closest("tr")!;
      expect(limitRow.textContent).toContain("24");
      expect(limitRow.textContent).toContain("1–100");
      expect(history.querySelector("p")!.textContent).not.toContain("1000");
      expect(document.getElementById("introduction")!.textContent).toContain("2.1.0");
      const errors = document.getElementById("errors")!;
      for (const status of ["404", "408", "409", "413", "415", "429", "499", "500", "503"])
        expect(within(errors).getByText(status)).toBeInTheDocument();
      expect(errors.textContent).toContain("Retry-After");
      expect(errors.textContent).toContain("X-Request-ID");
      expect(errors.querySelector("pre")!.textContent).toContain('"fieldErrors"');
      for (const section of ["history", "prompt-presets", "monitoring", "model-administration"])
        expect(document.getElementById(section)).toBeTruthy();
      const presetDelete = document.getElementById("delete-/api/external/prompt-presets/{key}")!;
      expect(presetDelete.querySelector("pre")!.textContent).toContain("expectedRevision");
      const historyDetail = document.getElementById("get-/api/external/history/{historyId}")!;
      expect(historyDetail.querySelector("pre")!.textContent).toContain("?type=image");
      const monitoringDetail = document.getElementById("get-/api/external/monitoring/requests/detail")!;
      expect(monitoringDetail.querySelector("pre")!.textContent).toContain("type=image&requestId=requestId_01");
      expect(document.getElementById("model-administration")!.textContent).toContain(messages.apiDocs.sidebar.nav.modelAdministration);
    },
  );

  it("API 문서 주요 섹션이 렌더링된다", async () => {
    const user = userEvent.setup();
    const openApiDocument = getOpenApiDocument();

    renderWithIntl(
      <ApiDocsWidget openApiDocument={openApiDocument} />,
    );

    expect(document.getElementById("introduction")).toBeTruthy();
    expect(document.getElementById("authentication")).toBeTruthy();
    expect(document.getElementById("errors")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "모델별 입력" })).not.toBeInTheDocument();
    expect(document.getElementById("generations")).toBeTruthy();
    expect(
      document.getElementById("post-/api/external/generations"),
    ).toBeTruthy();
    expect(document.getElementById("videos")).toBeNull();
    expect(document.getElementById("audio")).toBeNull();
    expect(document.getElementById("models")).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 1, name: "leesfield API" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", {
        name: /POST\s*\/api\/external\/generations/i,
      }).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByRole("navigation", { name: "API 레퍼런스" }),
    ).toBeInTheDocument();
    const sidebar = screen.getByRole("complementary");
    const groupToggle = within(sidebar).getByRole("button", { name: "AI 생성" });
    await user.click(groupToggle);
    expect(groupToggle).toHaveAttribute("aria-expanded", "false");
    expect(within(sidebar).queryByRole("link", { name: "POST /api/external/generations" })).toBeNull();
    await user.click(groupToggle);
    expect(within(sidebar).getByRole("link", { name: "POST /api/external/generations" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "API 레퍼런스" }));

    const mobilePanel = document.getElementById("api-docs-mobile-navigation")!;
    const mobileNavigation = within(mobilePanel).getByRole("navigation", {
      name: "API 레퍼런스",
    });
    expect(mobileNavigation).toBeInTheDocument();
    expect(
      within(
        mobileNavigation.parentElement ?? mobileNavigation,
      ).getByPlaceholderText("엔드포인트 검색…"),
    ).toBeInTheDocument();
    const search = within(mobilePanel).getByPlaceholderText("엔드포인트 검색…");
    await user.type(search, "DELETE /api/external/prompt-presets");
    const endpoint = within(mobileNavigation).getByRole("link", {
      name: "DELETE /api/external/prompt-presets/{key}",
    });
    expect(endpoint).toHaveAttribute("href", "#delete-/api/external/prompt-presets/{key}");
    expect(within(mobileNavigation).queryByRole("link", { name: "POST /api/external/generations" })).toBeNull();
    await user.click(endpoint);
    expect(document.getElementById("api-docs-mobile-navigation")).toBeNull();
    expect(screen.getByRole("button", { name: "API 레퍼런스" })).toHaveAttribute("aria-expanded", "false");
    await user.click(screen.getByRole("button", { name: "API 레퍼런스" }));
    await user.keyboard("{Escape}");
    expect(document.getElementById("api-docs-mobile-navigation")).toBeNull();
    expect(screen.getByRole("button", { name: "API 레퍼런스" })).toHaveFocus();
  });
});
