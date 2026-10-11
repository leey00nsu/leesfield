// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cinemaCatalog } from "./cinema-catalog";

describe("Cinema product image coverage and provenance", () => {
  it("ships a documented real image for every selectable option and the preview", () => {
    const root = path.join(process.cwd(), "public/assets/cinema");
    const manifest = JSON.parse(readFileSync(path.join(root, "asset-manifest.json"), "utf8")) as {
      assets: { file: string; width: number; height: number; source: { kind: string; tool?: string; prompt?: string; url?: string; license?: string; licenseUrl?: string; author?: string; equipment?: string; modifications?: string; hasAlpha?: boolean; reference?: { url: string; author: string; licenseUrl: string }; date: string } }[];
    };
    const files = new Map(manifest.assets.map(asset => [asset.file, asset]));
    const credits = readFileSync(path.join(root, "../cinema-equipment-sources.md"), "utf8");
    expect(files.size).toBe(manifest.assets.length);
    const required = [...Object.values(cinemaCatalog).flat().filter(item => item.image).map(item => item.image.split("/").at(-1)!), "auto.webp", "preview.webp"];
    for (const filename of required) {
      const asset = files.get(filename);
      expect(asset, filename).toBeDefined();
      const data = readFileSync(path.join(root, filename));
      expect(data.subarray(0, 4).toString(), filename).toBe("RIFF");
      expect(data.subarray(8, 12).toString(), filename).toBe("WEBP");
      expect(asset!.width, filename).toBeGreaterThanOrEqual(256);
      expect(asset!.height, filename).toBeGreaterThanOrEqual(256);
      expect(asset!.source.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (asset!.source.kind === "generated") {
        expect(asset!.source.tool).toBe("built-in image_gen");
        expect(asset!.source.prompt!.length).toBeGreaterThan(40);
      } else {
        expect(asset!.source.url).toMatch(/^https:\/\//);
        expect(asset!.source.license).toBeTruthy();
        expect(asset!.source.author).toBeTruthy();
        expect(asset!.source.modifications).toBeTruthy();
        expect(credits).toContain(asset!.source.licenseUrl);
        expect(credits).toContain(asset!.source.author);
        expect(credits).toContain(filename);
      }
    }
    for (const item of [...cinemaCatalog.camera, ...cinemaCatalog.lens]) {
      const asset = files.get(item.image.split("/").at(-1)!)!;
      expect(asset.source.kind).toBe("generated");
      expect(asset.source.equipment).toBe(item.name);
      expect(asset.source.hasAlpha).toBe(true);
      const reference = asset.source.reference!;
      expect(reference.url).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
      expect(reference.author).toBeTruthy();
      expect(credits).toContain(reference.author);
      expect(credits).toContain(reference.url);
      expect(credits).toContain(reference.licenseUrl);
      expect(credits).toContain(item.image.split("/").at(-1)!);
      const data = readFileSync(path.join(root, item.image.split("/").at(-1)!));
      expect(data.includes(Buffer.from("ALPH"))).toBe(true);
    }
  });
});
