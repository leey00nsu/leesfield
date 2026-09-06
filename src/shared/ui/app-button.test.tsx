import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppButton } from "./app-button";
describe("AppButton", () => {
  it("preserves link semantics and prevents duplicate actions while loading", async () => {
    const user = userEvent.setup(),
      onClick = vi.fn();
    render(
      <>
        <AppButton asChild>
          <a href="/generate">Create</a>
        </AppButton>
        <AppButton isLoading onClick={onClick} loadingText="Running">
          Generate
        </AppButton>
      </>,
    );
    expect(screen.getByRole("link", { name: "Create" })).toHaveAttribute(
      "href",
      "/generate",
    );
    const action = screen.getByRole("button", { name: "Running" });
    expect(action).toBeDisabled();
    expect(action).toHaveAttribute("aria-busy", "true");
    await user.click(action);
    expect(onClick).not.toHaveBeenCalled();
  });
});
