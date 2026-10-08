import { beforeEach, expect, it, vi } from "vitest";
const issue = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
vi.mock("@/server/api-key/lib/api-key-service", () => ({ issueApiKey: issue, updateApiKeyLabel: update }));
import { issueApiKeyHandler } from "./issue-api-key";
import { updateApiKeyLabelHandler } from "./update-api-key-label";
import { standardApiKeyPermissions } from "@/shared/api/platform-permissions";
beforeEach(() => vi.clearAllMocks());
it.each([{ permissions: ["unknown"] }, { permissions: ["platform:admin", "platform:admin"] }, { permissions: "platform:admin" }])("rejects invalid permissions before saving %j", async ({ permissions }) => {
  await expect(issueApiKeyHandler({ ownerEmail: "owner", payload: { label: "Key", permissions } })).rejects.toThrow("INVALID_PAYLOAD");
  await expect(updateApiKeyLabelHandler({ id: "key", ownerEmail: "owner", payload: { label: "Key", permissions } })).rejects.toThrow("INVALID_PAYLOAD");
  expect(issue).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
});
it("defaults new keys to account access and preserves omission on edit", async () => {
  await issueApiKeyHandler({ ownerEmail: "owner", payload: { label: "Key" } });
  expect(issue).toHaveBeenCalledWith({ ownerEmail: "owner", label: "Key", permissions: standardApiKeyPermissions });
  await updateApiKeyLabelHandler({ id: "key", ownerEmail: "owner", payload: { label: "Key" } });
  expect(update).toHaveBeenCalledWith({ id: "key", ownerEmail: "owner", label: "Key", permissions: undefined });
});
