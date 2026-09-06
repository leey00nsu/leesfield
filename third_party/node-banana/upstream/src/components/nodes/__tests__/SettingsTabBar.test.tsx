import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsTabBar } from "../SettingsTabBar";

describe("SettingsTabBar", () => {
  it("renders both tab labels", () => {
    render(
      <SettingsTabBar
        activeTab="primary"
        onTabChange={vi.fn()}
        primaryLabel="Nano Banana"
        fallbackLabel="Flux Dev"
      />
    );

    expect(screen.getByText("Nano Banana")).toBeInTheDocument();
    expect(screen.getByText("Flux Dev")).toBeInTheDocument();
  });

  it("highlights active tab", () => {
    render(
      <SettingsTabBar
        activeTab="primary"
        onTabChange={vi.fn()}
        primaryLabel="Nano Banana"
        fallbackLabel="Flux Dev"
      />
    );

    const primaryTab = screen.getByText("Nano Banana");
    const fallbackTab = screen.getByText("Flux Dev");

    // Active tab should have bg-neutral-700 class
    expect(primaryTab.className).toContain("bg-neutral-700");
    expect(fallbackTab.className).not.toContain("bg-neutral-700");
  });

  it("calls onTabChange when clicking inactive tab", () => {
    const onTabChange = vi.fn();
    render(
      <SettingsTabBar
        activeTab="primary"
        onTabChange={onTabChange}
        primaryLabel="Nano Banana"
        fallbackLabel="Flux Dev"
      />
    );

    fireEvent.click(screen.getByText("Flux Dev"));
    expect(onTabChange).toHaveBeenCalledWith("fallback");
  });

  it("does not call onTabChange when clicking active tab", () => {
    const onTabChange = vi.fn();
    render(
      <SettingsTabBar
        activeTab="primary"
        onTabChange={onTabChange}
        primaryLabel="Nano Banana"
        fallbackLabel="Flux Dev"
      />
    );

    fireEvent.click(screen.getByText("Nano Banana"));
    expect(onTabChange).not.toHaveBeenCalled();
  });
});
