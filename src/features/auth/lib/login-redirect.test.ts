import { describe, expect, it } from "vitest";
import {
  buildLoginHref,
  sanitizeLoginReturnTo,
} from "@/features/auth/lib/login-redirect";

describe("login redirect helpers", () => {
  it("builds an internal login return URL", () => {
    expect(buildLoginHref("/image?prompt=studio")).toBe(
      "/login?returnTo=%2Fimage%3Fprompt%3Dstudio",
    );
  });

  it("rejects non-internal return targets", () => {
    expect(sanitizeLoginReturnTo("https://example.com")).toBe("/");
    expect(sanitizeLoginReturnTo("//example.com")).toBe("/");
  });
});
