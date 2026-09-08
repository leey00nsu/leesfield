import { describe, it, expect } from "vitest";
import { highlightCode } from "./code-highlight";
describe("limited code highlighting", () => {
  it("highlights product languages and escapes unknown-language content", async () => {
    for (const language of ["typescript", "javascript", "json", "bash", "python", "yaml", "css", "tsx"] as const) {
      expect(await highlightCode("const result = 1", language)).toContain("shiki");
    }
    const html = await highlightCode('<script>alert(1)</script>', "ruby");
    expect(html).not.toContain("<script>");
    const container = document.createElement("div");
    container.innerHTML = html;
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toBe("<script>alert(1)</script>");
  });
});
