import { describe, expect, it, vi } from "vitest";

import NodeStudioPage from "./page";

const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));

describe("NodeStudioPage", () => {
  it("redirects to the Spaces list without creating a graph", () => {
    NodeStudioPage();
    expect(redirect).toHaveBeenCalledWith("/spaces");
  });
});
