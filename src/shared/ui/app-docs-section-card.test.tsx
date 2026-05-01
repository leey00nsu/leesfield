import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppDocsSectionCard } from "@/shared/ui/app-docs-section-card";
import { renderWithIntl } from "@/test-utils/intl";

describe("AppDocsSectionCard", () => {
  it("renders a shared docs section shell", () => {
    renderWithIntl(
      <AppDocsSectionCard title="API docs" description="Shared surface">
        <div>Content</div>
      </AppDocsSectionCard>,
    );

    expect(screen.getByText("API docs")).toBeInTheDocument();
    expect(screen.getByText("Shared surface")).toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
    expect(screen.getByText("API docs").closest("[data-app-card]")).toBeTruthy();
  });
});
