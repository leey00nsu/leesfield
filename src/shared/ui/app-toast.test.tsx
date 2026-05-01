import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppToaster } from "@/shared/ui/app-toast";

describe("AppToaster", () => {
  it("sonner 기반 project toast wrapper를 렌더링한다", () => {
    expect(() => render(<AppToaster />)).not.toThrow();
  });
});
