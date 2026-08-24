import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import NodeStudioPage from "./page";

vi.mock("@/screens/node-studio/ui/node-studio-screen", () => ({
  NodeStudioScreen: () => <div>node studio screen</div>,
}));

describe("NodeStudioPage", () => {
  it("Node Studio 화면을 protected route에 조립한다", () => {
    render(<NodeStudioPage />);
    expect(screen.getByText("node studio screen")).toBeInTheDocument();
  });
});
