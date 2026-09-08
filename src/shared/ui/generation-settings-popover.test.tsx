import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenerationSettingsPopover } from "./generation-settings-popover";

afterEach(cleanup);
describe("generation settings access", () => {
  const content = <input aria-label="Seed" />;
  it("redirects guests without revealing settings", () => {
    const redirect = vi.fn();
    render(<GenerationSettingsPopover label="Options" summary="Options" onBlockedOpen={redirect}>{content}</GenerationSettingsPopover>);
    fireEvent.click(screen.getByRole("button", { name: "Options" }));
    expect(redirect).toHaveBeenCalledOnce();
    expect(screen.queryByLabelText("Seed")).toBeNull();
  });
  it("opens for members and hides an open panel when access is lost", () => {
    const { rerender } = render(<GenerationSettingsPopover label="Options" summary="Options">{content}</GenerationSettingsPopover>);
    fireEvent.click(screen.getByRole("button", { name: "Options" }));
    expect(screen.getByLabelText("Seed")).toBeTruthy();
    rerender(<GenerationSettingsPopover label="Options" summary="Options" onBlockedOpen={vi.fn()}>{content}</GenerationSettingsPopover>);
    expect(screen.queryByLabelText("Seed")).toBeNull();
  });
  it("keeps empty settings disabled", () => {
    const redirect = vi.fn();
    render(<GenerationSettingsPopover disabled label="Options" summary="Options" onBlockedOpen={redirect}>{content}</GenerationSettingsPopover>);
    fireEvent.click(screen.getByRole("button", { name: "Options" }));
    expect(redirect).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Seed")).toBeNull();
  });
});
