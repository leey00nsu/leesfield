import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.hoisted(() => vi.fn());
const service = vi.hoisted(() => ({ createOperation: vi.fn() }));

vi.mock("@/server/auth/session", () => ({ getSession: mockGetSession }));
vi.mock("@/server/media-assets/media-asset-service", () => ({ mediaAssetService: service }));

import { MediaOperationConflictError } from "@/server/media-assets/media-asset-errors";
import { POST } from "./route";

describe("POST /api/media-operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockGetSession.mockResolvedValue({ isLoggedIn: true, adminEmail: "owner@example.com" });
  });

  it("creates an owner-scoped operation", async () => {
    service.createOperation.mockResolvedValue({ id: "op_1", status: "pending" });
    const body = {
      graphId: "graph_1",
      graphNodeId: "node_1",
      type: "edit.image.resize",
      configVersion: 1,
      parameters: {},
      expectedOutputCount: 1,
      inputs: [{ assetId: "image_1", portId: "image", sortOrder: 0 }],
    };
    const response = await POST(
      new Request("http://localhost/api/media-operations", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
    expect(response.status).toBe(201);
    expect(service.createOperation).toHaveBeenCalledWith("owner@example.com", body);
  });

  it("maps the per-Node active-operation guard to 409", async () => {
    service.createOperation.mockRejectedValue(
      new MediaOperationConflictError("MEDIA_OPERATION_ACTIVE"),
    );
    const response = await POST(
      new Request("http://localhost/api/media-operations", { method: "POST", body: "{}" }),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).message).toBe("MEDIA_OPERATION_ACTIVE");
  });
});
