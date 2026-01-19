import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { modelCatalog } from "@/features/model-management/model/model-catalog";
import { ModelManagementScreen } from "@/screens/model-management/ui/model-management-screen";
import { renderWithIntl } from "@/test-utils/intl";

describe("ModelManagementScreen", () => {
  const imageModel = modelCatalog.find((item) => item.type === "image");
  const videoModel = modelCatalog.find((item) => item.type === "video");

  it("모델 타입 필터가 동작한다", async () => {
    expect(imageModel).toBeDefined();
    expect(videoModel).toBeDefined();

    const user = userEvent.setup();

    renderWithIntl(<ModelManagementScreen />);

    await user.click(screen.getByRole("button", { name: "이미지" }));

    await waitFor(() => {
      expect(screen.queryAllByText(videoModel!.label)).toHaveLength(0);
      expect(screen.queryAllByText(imageModel!.label).length).toBeGreaterThan(0);
    });
  });

  it("검색어로 모델 목록을 필터링한다", async () => {
    expect(imageModel).toBeDefined();
    expect(videoModel).toBeDefined();

    const user = userEvent.setup();

    renderWithIntl(<ModelManagementScreen />);

    const input = screen.getByPlaceholderText("검색...");

    await user.clear(input);
    await user.type(input, videoModel!.key);

    await waitFor(() => {
      expect(screen.queryAllByText(imageModel!.label)).toHaveLength(0);
      expect(screen.queryAllByText(videoModel!.label).length).toBeGreaterThan(0);
    });
  });
});
