// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModalConfig } from "@/shared/model-catalog/modal-comfyui-contract";
import { modalInputUploadBudget } from "./input-upload-policy";

afterEach(() => vi.unstubAllEnvs());
const config = (budget?: number, override?: number) => ({
  workflow: { limits: budget === undefined ? {} : { max_input_bytes: budget } },
  limits: override === undefined ? {} : { max_input_bytes: override },
}) as ModalConfig;

describe("Modal local upload budget compatibility", () => {
  it("upgrades imported legacy buffer defaults while honoring explicit model caps", () => {
    expect(modalInputUploadBudget(config(20_971_520))).toBe(52_428_800);
    expect(modalInputUploadBudget(config(20_971_520, 20_971_520))).toBe(20_971_520);
    expect(modalInputUploadBudget(config(8_388_608))).toBe(8_388_608);
  });
  it("uses runtime file budgets for absent and default imported limits", () => {
    vi.stubEnv("MEDIA_ASSET_MAX_VIDEO_BYTES", "104857600");
    expect(modalInputUploadBudget(config())).toBe(104_857_600);
    expect(modalInputUploadBudget(config(52_428_800))).toBe(104_857_600);
  });
});
