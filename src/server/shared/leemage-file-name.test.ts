import { describe, expect, it } from "vitest";
import { leemageFileName } from "./leemage-file-name";

describe("Leemage storage filenames", () => {
  it.each(["스크린샷 2026.png", "스크린샷.png".normalize("NFD"), "node-banana-custom.PNG", "../custom/한글.wav", "video.mp4", "🎨", "x.한글"])(
    "maps %s to a bounded ASCII leesfield name without exposing the source prefix",
    (source) => {
      const result = leemageFileName(source);
      expect(result).toMatch(/^leesfield-[a-f0-9]{64}\.[a-z0-9]{1,10}$/);
      expect(leemageFileName(source)).toBe(result);
    },
  );

  it("keeps distinct source identities and safe extensions", () => {
    expect(leemageFileName("그림.png")).not.toBe(leemageFileName("사진.png"));
    expect(leemageFileName("사진.PNG")).toMatch(/\.png$/);
    expect(leemageFileName("사진.한글")).toMatch(/\.bin$/);
  });
});
