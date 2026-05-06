import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppBadge } from "@/shared/ui/app-badge";

describe("AppBadge", () => {
  it("wraps the shared badge primitive with the app marker", () => {
    render(<AppBadge variant="primary">Primary</AppBadge>);

    expect(screen.getByText("Primary")).toHaveAttribute("data-slot", "badge");
    expect(screen.getByText("Primary")).toHaveAttribute("data-app-badge", "");
  });
});
