import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { modelCatalog } from "@/features/model-management/model/model-catalog";
import { ModelManagementScreen } from "@/screens/model-management/ui/model-management-screen";

describe("ModelManagementScreen", () => {
  const imageModel = modelCatalog.find((item) => item.type === "image");
  const videoModel = modelCatalog.find((item) => item.type === "video");

  it("모델 타입 필터가 동작한다", async () => {
    expect(imageModel).toBeDefined();
    expect(videoModel).toBeDefined();

    const user = userEvent.setup();

    render(<ModelManagementScreen />);

    await user.click(screen.getByRole("button", { name: /images/i }));

    expect(screen.getByText(imageModel!.label)).toBeInTheDocument();
    expect(screen.queryByText(videoModel!.label)).not.toBeInTheDocument();
  });

  it("검색어로 모델 목록을 필터링한다", async () => {
    expect(imageModel).toBeDefined();
    expect(videoModel).toBeDefined();

    const user = userEvent.setup();

    render(<ModelManagementScreen />);

    const input = screen.getByPlaceholderText("SEARCH_DATABASE...");

    await user.clear(input);
    await user.type(input, videoModel!.key);

    await waitFor(() => {
      expect(screen.queryByText(imageModel!.label)).not.toBeInTheDocument();
    });
    expect(screen.getByText(videoModel!.label)).toBeInTheDocument();
  });
});
