import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingCoreFeaturesSection } from "@/widgets/landing/ui/landing-core-features-section";
import { renderWithIntl } from "@/test-utils/intl";

describe("LandingCoreFeaturesSection", () => {
  it("shows concise end-user feature cards", () => {
    renderWithIntl(<LandingCoreFeaturesSection />);

    expect(
      screen.getByRole("heading", { name: "Core Features" }),
    ).toBeInTheDocument();
    expect(screen.getByText("이미지/비디오/오디오 생성")).toBeInTheDocument();
    expect(screen.getByText("히스토리 갤러리")).toBeInTheDocument();
    expect(screen.getByText("모니터링")).toBeInTheDocument();
    expect(screen.getByText("어댑터 기반 모델 관리")).toBeInTheDocument();
    expect(screen.getByText("개발자 API")).toBeInTheDocument();
    expect(screen.getByText("OpenAPI 기반 API 문서")).toBeInTheDocument();
    expect(screen.queryByText(/components\/ui/)).not.toBeInTheDocument();
  });
});
