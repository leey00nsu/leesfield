import { describe, it, expect } from "vitest";
import {
  parameterConfigurationIssues,
  parameterValueIssue,
} from "./parameter-contract";
describe("parameter contracts", () => {
  it("checks numeric defaults, ranges, choices and preserves explicit falsy values", () => {
    expect(
      parameterConfigurationIssues({
        seed: { ui: "input", default: 42 },
        enabled: { ui: "toggle", default: false },
        nullable: {
          binding: { valueType: "string", nullable: true },
          default: null,
        },
      }),
    ).toEqual([]);
    for (const defaultValue of ["42", null, -1, 1.5])
      expect(
        parameterConfigurationIssues({
          seed: { ui: "input", default: defaultValue, min: 0, step: 1 },
        }),
      ).toHaveLength(1);
    expect(
      parameterConfigurationIssues({ steps: { ui: "range", min: 10, max: 1 } }),
    ).toHaveLength(1);
    expect(parameterValueIssue("mode", { options: [0, 1] }, 0)).toBeUndefined();
    expect(parameterValueIssue("mode", { options: [0, 1] }, "0")).toBe("type");
    expect(
      parameterConfigurationIssues({ seed: { ui: "hidden", default: "" } }),
    ).toEqual([]);
  });
});
