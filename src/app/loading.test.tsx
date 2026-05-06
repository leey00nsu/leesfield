import { render, screen } from "@testing-library/react";
import Loading from "@/app/loading";

describe("Loading", () => {
  it("renders only a centered spinner without the route-state card content", () => {
    const { container } = render(<Loading />);

    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(container.querySelector("[data-app-card]")).toBeNull();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});
