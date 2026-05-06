import { render, screen } from "@testing-library/react";
import NotFound from "@/app/not-found";

describe("NotFound", () => {
  it("renders the minimal 404 fallback with only the home action", () => {
    const { container } = render(<NotFound />);

    expect(screen.getByText("PAGE NOT FOUND")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "GO HOME" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(container.querySelector("[data-app-card]")).toBeNull();
    expect(container.querySelector("[data-app-button]")).toBeTruthy();
    expect(screen.queryByText("This surface is not available.")).not.toBeInTheDocument();
  });
});
