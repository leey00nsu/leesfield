import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppButton } from "@/shared/ui/app-button";

describe("AppButton", () => {
  it("keeps project button colors stable on hover", () => {
    render(
      <div>
        <AppButton>Generate</AppButton>
        <AppButton variant="surface">Surface</AppButton>
        <AppButton variant="white">White</AppButton>
      </div>,
    );

    expect(screen.getByRole("button", { name: "Generate" })).toHaveClass(
      "bg-primary",
      "hover:bg-primary",
      "hover:text-primary-content",
    );
    expect(screen.getByRole("button", { name: "Surface" })).toHaveClass(
      "bg-black/16",
      "hover:bg-black/16",
      "hover:text-white/82",
    );
    expect(screen.getByRole("button", { name: "White" })).toHaveClass(
      "bg-white",
      "hover:bg-white",
      "hover:text-black",
    );
  });
});
