import { execFile } from "node:child_process";
import path from "node:path";
import { symlink, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
const validPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

type ExecFileCallback = (
  error: NodeJS.ErrnoException | null,
  stdout: string,
  stderr: string,
) => void;

function asExecFileCallback(callback: unknown) {
  return callback as ExecFileCallback;
}

function requireOutputPath(options: { env?: NodeJS.ProcessEnv }) {
  const outputPath = options.env?.CODEX_IMAGE_OUTPUT_PATH;
  if (!outputPath) {
    throw new Error("missing output path");
  }
  return outputPath;
}

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

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ChatGPT OAuth가 아니면 생성 전에 실패한다", async () => {
    mockExecFile.mockImplementation((command, args, options, callback) => {
      void command;
      void args;
      void options;
      asExecFileCallback(callback)(null, "Logged in using API key\n", "");
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
      const done = asExecFileCallback(callback);
      if (normalizedArgs[0] === "login") {
        done(null, "Logged in using ChatGPT\n", "");
        return {} as ReturnType<typeof execFile>;
      }

      const outputPath = requireOutputPath(normalizedOptions);

      void writeFile(outputPath, validPng).then(() =>
        done(null, `saved to ${outputPath}`, ""),
      );
      return {} as ReturnType<typeof execFile>;
    });

    const { codexCliImageAdapter } = await import(
      "@/server/image-generation/adapters/codex-cli-adapter"
    );

    const result = await codexCliImageAdapter.generate(payload());

    expect(result).toEqual({
      images: [`data:image/png;base64,${validPng.toString("base64")}`],
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
    const generationCall = mockExecFile.mock.calls.find(
      ([, args]) => Array.isArray(args) && args.includes("exec"),
    );
    expect(generationCall).toBeDefined();
    expect(generationCall?.[1]).not.toContain("--full-auto");
    expect(generationCall?.[1]).toEqual(
      expect.arrayContaining([
        "--ask-for-approval",
        "never",
        "exec",
        "--sandbox",
        "workspace-write",
        "--ignore-user-config",
        "--ignore-rules",
      ]),
    );
  });

  it("Codex 실행 환경에 서버 secret env를 넘기지 않는다", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://secret");
    vi.stubEnv("LEEMAGE_API_KEY", "leemage-secret");
    vi.stubEnv("OPENAI_API_KEY", "openai-secret");
    vi.stubEnv("PATH", "/usr/local/bin:/usr/bin:/bin");

    mockExecFile.mockImplementation((command, args, options, callback) => {
      void command;
      const normalizedArgs = Array.isArray(args) ? args : [];
      const normalizedOptions = options && typeof options === "object" ? options : {};
      const done = asExecFileCallback(callback);
      if (normalizedArgs[0] === "login") {
        done(null, "Logged in using ChatGPT\n", "");
        return {} as ReturnType<typeof execFile>;
      }

      const outputPath = requireOutputPath(normalizedOptions);
      void writeFile(outputPath, validPng).then(() =>
        done(null, `saved to ${outputPath}`, ""),
      );
      return {} as ReturnType<typeof execFile>;
    });

    const { codexCliImageAdapter } = await import(
      "@/server/image-generation/adapters/codex-cli-adapter"
    );

    await codexCliImageAdapter.generate(payload());

    const generationCall = mockExecFile.mock.calls.find(
      ([, args]) => Array.isArray(args) && args.includes("exec"),
    );
    const env = generationCall?.[2]?.env as NodeJS.ProcessEnv;
    expect(env.PATH).toBe("/usr/local/bin:/usr/bin:/bin");
    expect(env.CODEX_IMAGE_OUTPUT_PATH).toMatch(/result\.png$/);
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.LEEMAGE_API_KEY).toBeUndefined();
    expect(env.OPENAI_API_KEY).toBeUndefined();
  });

  it("결과 파일이 실제 이미지가 아니거나 symlink면 실패한다", async () => {
    mockExecFile.mockImplementation((command, args, options, callback) => {
      void command;
      const normalizedArgs = Array.isArray(args) ? args : [];
      const normalizedOptions = options && typeof options === "object" ? options : {};
      const done = asExecFileCallback(callback);
      if (normalizedArgs[0] === "login") {
        done(null, "Logged in using ChatGPT\n", "");
        return {} as ReturnType<typeof execFile>;
      }

      const outputPath = requireOutputPath(normalizedOptions);
      const targetPath = path.join(path.dirname(outputPath), "target.png");
      void writeFile(targetPath, validPng)
        .then(() => symlink(targetPath, outputPath))
        .then(() => done(null, `saved to ${outputPath}`, ""));
      return {} as ReturnType<typeof execFile>;
    });

    const { codexCliImageAdapter } = await import(
      "@/server/image-generation/adapters/codex-cli-adapter"
    );

    await expect(codexCliImageAdapter.generate(payload())).rejects.toThrow(
      "CODEX_IMAGE_OUTPUT_INVALID",
    );
    expect(
      codexCliImageAdapter.mapError?.(new Error("CODEX_IMAGE_OUTPUT_INVALID")),
    ).toBe("Codex CLI가 생성한 이미지 파일 형식이 올바르지 않습니다.");
  });

  it("Codex CLI 실행 파일이 없으면 전용 오류로 매핑한다", async () => {
    mockExecFile.mockImplementation((command, args, options, callback) => {
      void command;
      void args;
      void options;
      const error = new Error("spawn codex ENOENT") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      asExecFileCallback(callback)(error, "", "");
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
