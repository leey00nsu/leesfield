import { useState } from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithIntl } from "@/test-utils/intl";
import { standardApiKeyPermissions, type PlatformPermission } from "@/shared/api/platform-permissions";
import { ApiKeyPermissionSelect } from "./api-key-permission-select";

it("edits individual account permissions and explicitly enables administrative access", async () => {
  function Editor() {
    const [permissions, setPermissions] = useState<PlatformPermission[]>([...standardApiKeyPermissions]);
    return <><ApiKeyPermissionSelect permissions={permissions} onChange={setPermissions} /><output>{JSON.stringify(permissions)}</output></>;
  }
  const user = userEvent.setup();
  renderWithIntl(<Editor />);
  expect(screen.getAllByRole("checkbox")).toHaveLength(12);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  const generation = screen.getByRole("checkbox", { name: "생성 요청" });
  expect(generation).toBeChecked();
  await user.click(generation);
  expect(screen.getByRole("status").textContent).not.toContain("generations:create");
  expect(screen.getByRole("checkbox", { name: "모델 관리" })).not.toBeChecked();
  await user.click(screen.getByRole("checkbox", { name: "모델 관리" }));
  expect(screen.getByRole("status").textContent).toContain("models:manage");
  await user.click(generation);
  await user.click(screen.getByRole("checkbox", { name: "모델 관리" }));
  expect(screen.getByRole("status").textContent).toContain("generations:create");
  expect(screen.getByRole("status").textContent).not.toContain("models:manage");
});
