// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cinemaCatalog } from "./cinema-catalog";
import { cinemaPhotoPreview } from "./cinema-photo-preview";
import { defaultCinemaSettings } from "./cinema-contract";

describe("Cinema composition-only photo coverage and provenance", () => {
  it("ships eight shots of the same reference with actual generation provenance", () => {
    const root = path.resolve("public/assets/cinema");
    const manifest = JSON.parse(readFileSync(path.join(root, "preview-manifest.json"), "utf8")) as {
      reference: { file: string; sha256: string; originalSha256: string; origin: string };
      assets: { file: string; composition: string; width: number; height: number; sha256: string;
        source: { tool: string; model?: string; version?: string; steps?: number; prompt: string; seed?: number; originalSha256: string; originalReferenceSha256: string; references: { sha256: string; derivedFromSha256: string }[] } }[];
    };
    const files = new Set(readdirSync(path.join(root, "previews")));
    const referenceBytes = readFileSync(path.join(root, manifest.reference.file));
    expect(createHash("sha256").update(referenceBytes).digest("hex")).toBe(manifest.reference.sha256);
    expect(manifest.reference.originalSha256).toBe("0ee8b214b8284417ec5c314c79b15ac53c2b5eab284f4243234d491f5fa3bf1e");
    expect(manifest.reference.origin).toBe("user-provided");
    const documented = new Map(manifest.assets.map(asset => [asset.composition, asset]));
    expect(documented.size).toBe(8);
    expect(files.size).toBe(8);
    for (const shot of cinemaCatalog.composition) {
      const asset = documented.get(shot.id)!;
      expect(asset).toBeDefined();
      expect(asset.file).toBe(`${shot.id}.webp`);
      expect(files.has(asset.file)).toBe(true);
      const bytes = readFileSync(path.join(root, "previews", asset.file));
      expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
      expect(bytes.subarray(8, 12).toString()).toBe("WEBP");
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.sha256);
      expect([asset.width, asset.height]).toEqual([1376, 768]);
      expect(["Qwen reference edit", "built-in imagegen"]).toContain(asset.source.tool);
      if (asset.source.tool === "Qwen reference edit") {
        expect(asset.source.model).toBe("Viggle/Qwen-Image-2.1-viggle-turbo");
        expect(asset.source.version).toBe("v0.3");
        expect(asset.source.steps).toBe(6);
        expect(asset.source.seed).toBeGreaterThan(0);
      }
      expect(asset.source.prompt.length).toBeGreaterThan(40);
      expect(asset.source.originalSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(asset.source.originalReferenceSha256).toBe(manifest.reference.originalSha256);
      expect(asset.source.references.length).toBeGreaterThan(0);
      for (const reference of asset.source.references) {
        expect(reference.sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(reference.derivedFromSha256).toBe(manifest.reference.originalSha256);
      }
      for (const aperture of cinemaCatalog.aperture) {
        expect(cinemaPhotoPreview({ ...defaultCinemaSettings(), composition: shot.id, aperture: aperture.id }).src).toBe(`/assets/cinema/previews/${asset.file}`);
      }
    }
  });
});
