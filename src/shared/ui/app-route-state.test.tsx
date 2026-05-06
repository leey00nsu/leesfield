import { render, screen } from "@testing-library/react";
import { AppRouteHomeAction, AppRouteState } from "@/shared/ui/app-route-state";

describe("AppRouteState", () => {
  it("renders project-styled route fallback content with an app action", () => {
    const { container } = render(
      <AppRouteState
        eyebrow="Loading"
        title="Preparing your workspace."
        description="The studio surface is loading."
        action={<AppRouteHomeAction label="Go home" />}
      />,
    );

    expect(screen.getByRole("heading", { name: "Preparing your workspace." })).toBeInTheDocument();
    expect(screen.getByText("The studio surface is loading.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "/");
    expect(container.querySelector("[data-app-card]")).toBeTruthy();
    expect(container.querySelector("[data-app-button]")).toBeTruthy();
  });
});
