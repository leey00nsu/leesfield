import { describe, expect, it } from "vitest";
import {
  collectHfSpaceFileReferences,
  extractHfSpaceFileReference,
  resolveHfSpaceFileReferenceCandidates,
  resolveHfSpaceFileReference,
} from "@/server/hf-space/file-reference-resolver";

const SPACE_URL = "https://demo-space.hf.space";

describe("file-reference-resolver", () => {
  it("정규화 규칙을 canonical file reference로 변환한다", () => {
    expect(
      resolveHfSpaceFileReference(
        "data:audio/wav;base64,UklGRg==",
        SPACE_URL,
      ),
    ).toEqual({
      kind: "data_url",
      value: "data:audio/wav;base64,UklGRg==",
      normalizedUrl: "data:audio/wav;base64,UklGRg==",
    });

    expect(
      resolveHfSpaceFileReference("https://cdn.example.com/file.png", SPACE_URL),
    ).toEqual({
      kind: "absolute_url",
      value: "https://cdn.example.com/file.png",
      normalizedUrl: "https://cdn.example.com/file.png",
    });

    expect(
      resolveHfSpaceFileReference("/gradio_api/file=/tmp/out.wav", SPACE_URL),
    ).toEqual({
      kind: "gradio_file_url",
      value: "/gradio_api/file=/tmp/out.wav",
      normalizedUrl: `${SPACE_URL}/gradio_api/file=/tmp/out.wav`,
    });

    expect(
      resolveHfSpaceFileReference("/file=/tmp/out.wav", SPACE_URL),
    ).toEqual({
      kind: "legacy_gradio_file_url",
      value: "/file=/tmp/out.wav",
      normalizedUrl: `${SPACE_URL}/gradio_api/file=/tmp/out.wav`,
    });

    expect(resolveHfSpaceFileReference("file=/tmp/out.wav", SPACE_URL)).toEqual({
      kind: "legacy_gradio_file_url",
      value: "file=/tmp/out.wav",
      normalizedUrl: `${SPACE_URL}/gradio_api/file=/tmp/out.wav`,
    });

    expect(resolveHfSpaceFileReference("/tmp/out.wav", SPACE_URL)).toEqual({
      kind: "space_path",
      value: "/tmp/out.wav",
      normalizedUrl: `${SPACE_URL}/gradio_api/file=/tmp/out.wav`,
    });
  });

  it("string/object/nested array에서 파일 참조를 추출한다", () => {
    expect(extractHfSpaceFileReference({ path: "/tmp/out.wav" })).toBe(
      "/tmp/out.wav",
    );
    expect(
      extractHfSpaceFileReference({
        data: "data:image/png;base64,abc",
      }),
    ).toBe("data:image/png;base64,abc");

    expect(
      collectHfSpaceFileReferences(
        [
          { url: "https://cdn.example.com/a.png" },
          {
            nested: [
              { path: "/tmp/out.wav" },
              { ignored: "hello" },
              { data: "data:video/mp4;base64,abc" },
            ],
          },
        ],
        {
          matcher: (value) =>
            value.includes(".png") ||
            value.includes(".wav") ||
            value.startsWith("data:video/"),
        },
      ),
    ).toEqual([
      "https://cdn.example.com/a.png",
      "/tmp/out.wav",
      "data:video/mp4;base64,abc",
    ]);
  });

  it("absolute url을 canonical origin으로 사용하고 동일 asset 후보를 우선순위로 정리한다", () => {
    expect(
      resolveHfSpaceFileReferenceCandidates(
        [
          "https://demo-space-real.hf.space/gradio_api/file=/tmp/gradio/job-1/audio.wav",
          "/tmp/gradio/job-1/audio.wav",
          "audio.wav",
        ],
        {
          spaceUrl: "https://demo-space-fallback.hf.space",
        },
      ),
    ).toEqual([
      {
        assetKey: "/tmp/gradio/job-1/audio.wav",
        candidates: [
          {
            kind: "absolute_url",
            value:
              "https://demo-space-real.hf.space/gradio_api/file=/tmp/gradio/job-1/audio.wav",
            normalizedUrl:
              "https://demo-space-real.hf.space/gradio_api/file=/tmp/gradio/job-1/audio.wav",
          },
        ],
      },
    ]);
  });
});
