import { describe, expect, it } from "vitest";

import { resolveLocalAuthBypass } from "./local-auth-bypass";

describe("resolveLocalAuthBypass", () => {
  it("development에서 명시적으로 활성화한 경우 로컬 관리자를 반환한다", () => {
    expect(
      resolveLocalAuthBypass({
        NODE_ENV: "development",
        DEV_AUTH_BYPASS: "true",
        DEV_AUTH_BYPASS_EMAIL: " local-admin@example.com ",
      }),
    ).toEqual({ adminEmail: "local-admin@example.com" });
  });

  it("별도 이메일이 없으면 기존 관리자 이메일을 사용한다", () => {
    expect(
      resolveLocalAuthBypass({
        NODE_ENV: "development",
        DEV_AUTH_BYPASS: "true",
        ADMIN_EMAIL: "admin@example.com",
      }),
    ).toEqual({ adminEmail: "admin@example.com" });
  });

  it("운영 환경에서는 플래그가 있어도 우회하지 않는다", () => {
    expect(
      resolveLocalAuthBypass({
        NODE_ENV: "production",
        DEV_AUTH_BYPASS: "true",
        DEV_AUTH_BYPASS_EMAIL: "local-admin@example.com",
      }),
    ).toBeNull();
  });

  it("development에서도 정확히 true로 설정하지 않으면 우회하지 않는다", () => {
    expect(
      resolveLocalAuthBypass({
        NODE_ENV: "development",
        DEV_AUTH_BYPASS: "false",
      }),
    ).toBeNull();
  });
});
