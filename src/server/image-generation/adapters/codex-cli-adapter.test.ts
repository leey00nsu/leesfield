import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetModelCatalog = vi.hoisted(() => vi.fn());
const mockExecFileFn = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  default: { execFile: mockExecFileFn },
  execFile: mockExecFileFn,
}));

vi.mock("@/server/model-catalog/catalog-service", () => ({
  getModelCatalog: mockGetModelCatalog,
}));

const mockExecFile = vi.mocked(execFile);

function mockCatalog() {
  mockGetModelCatalog.mockResolvedValue([
    {
      id: "image-model-1",
      type: "image",
      key: "gpt-image-2-codex",
      label: "GPT Image 2",
      vendor: "OPENAI",
      provider: "codex_cli",
      providerConfig: {
        command: "codex",
        model_id: "gpt-image-2",
        timeout_ms: 300000,
      },
      parameters: {
        prompt: { ui: "textarea", required: true },
      },
      meta: {
        pipeline: "image_generation",
        model_id: "gpt-image-2",
        default_width: 1024,
        default_height: 1024,
        default_steps: 1,
        max_input_images: 0,
      },
      isActive: true,
      isDefault: false,
    },
  ]);
}

function payload() {
  return {
    prompt: "a small red house",
    model: "gpt-image-2-codex",
    width: 1024,
    height: 1024,
    imageCount: 1,
    steps: 1,
    seed: "",
    initImages: [],
  };
}

describe("codexCliImageAdapter", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockCatalog();
  });

  it("ChatGPT OAuth가 아니면 생성 전에 실패한다", async () => {
    mockExecFile.mockImplementation((command, args, options, callback) => {
      void command;
      void args;
      void options;
      callback(null, "Logged in using API key\n", "");
      return {} as ReturnType<typeof execFile>;
    });

    const { codexCliImageAdapter } = await import(
      "@/server/image-generation/adapters/codex-cli-adapter"
    );

    await expect(codexCliImageAdapter.generate(payload())).rejects.toThrow(
      "CODEX_OAUTH_REQUIRED",
    );
    expect(
      codexCliImageAdapter.mapError?.(new Error("CODEX_OAUTH_REQUIRED")),
    ).toBe("Codex CLI에 ChatGPT OAuth 로그인이 필요합니다.");
  });

  it("Codex가 저장한 result.png를 data URL로 반환한다", async () => {
    mockExecFile.mockImplementation((command, args, options, callback) => {
      void command;
      const normalizedArgs = Array.isArray(args) ? args : [];
      const normalizedOptions = options && typeof options === "object" ? options : {};
      if (normalizedArgs[0] === "login") {
        callback(null, "Logged in using ChatGPT\n", "");
        return {} as ReturnType<typeof execFile>;
      }

      const outputPath = (normalizedOptions.env as NodeJS.ProcessEnv)
        .CODEX_IMAGE_OUTPUT_PATH;
      if (!outputPath) {
        callback(new Error("missing output path"), "", "");
        return {} as ReturnType<typeof execFile>;
      }

      void writeFile(outputPath, Buffer.from([137, 80, 78, 71])).then(() =>
        callback(null, `saved to ${outputPath}`, ""),
      );
      return {} as ReturnType<typeof execFile>;
    });

    const { codexCliImageAdapter } = await import(
      "@/server/image-generation/adapters/codex-cli-adapter"
    );

    const result = await codexCliImageAdapter.generate(payload());

    expect(result).toEqual({
      images: ["data:image/png;base64,iVBORw=="],
    });
    expect(mockExecFile).toHaveBeenCalledWith(
      "codex",
      expect.arrayContaining(["login", "status"]),
      expect.objectContaining({ timeout: expect.any(Number) }),
      expect.any(Function),
    );
    expect(mockExecFile).toHaveBeenCalledWith(
      "codex",
      expect.arrayContaining(["exec"]),
      expect.objectContaining({
        env: expect.objectContaining({
          CODEX_IMAGE_OUTPUT_PATH: expect.stringMatching(/result\.png$/),
        }),
      }),
      expect.any(Function),
    );
  });

  it("Codex CLI 실행 파일이 없으면 전용 오류로 매핑한다", async () => {
    mockExecFile.mockImplementation((command, args, options, callback) => {
      void command;
      void args;
      void options;
      const error = new Error("spawn codex ENOENT") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      callback(error, "", "");
      return {} as ReturnType<typeof execFile>;
    });

    const { codexCliImageAdapter } = await import(
      "@/server/image-generation/adapters/codex-cli-adapter"
    );

    await expect(codexCliImageAdapter.generate(payload())).rejects.toThrow(
      "CODEX_CLI_NOT_FOUND",
    );
    expect(
      codexCliImageAdapter.mapError?.(new Error("CODEX_CLI_NOT_FOUND")),
    ).toBe("Codex CLI를 찾을 수 없습니다. 서버 환경에 codex를 설치해주세요.");
  });

  it("timeout과 결과 파일 누락을 사용자 메시지로 매핑한다", async () => {
    const { codexCliImageAdapter } = await import(
      "@/server/image-generation/adapters/codex-cli-adapter"
    );

    expect(
      codexCliImageAdapter.mapError?.(new Error("CODEX_IMAGE_TIMEOUT")),
    ).toBe("Codex CLI 이미지 생성 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.");
    expect(
      codexCliImageAdapter.mapError?.(new Error("CODEX_IMAGE_OUTPUT_NOT_FOUND")),
    ).toBe("Codex CLI가 생성한 이미지 파일을 찾을 수 없습니다.");
  });
});
