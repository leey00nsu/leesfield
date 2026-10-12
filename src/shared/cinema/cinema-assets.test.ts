// @vitest-environment node
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
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
    const required = [...Object.entries(cinemaCatalog).filter(([category]) => category !== "movement").flatMap(([, items]) => items.map(item => item.image)).filter(Boolean).map(image => image.split("/").at(-1)!), "auto.webp", "preview.webp"];
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
  it("ships each movement video and poster with verified generation provenance", () => {
    const root = path.join(process.cwd(), "public");
    const manifest = JSON.parse(readFileSync(path.join(root, "assets/cinema/movement-manifest.json"), "utf8")) as {
      status: string; videoModel: string; videoResolution: string; videoDurationSeconds: number;
      assets: { id: string; video: string; poster: string; prompt: string; flowAssetId: string; date: string;
        inputImage: { sha256: string }; original: { sha256: string };
        product: { sha256: string; width: number; height: number; duration: number; audio: boolean }; posterSha256: string }[];
    };
    expect(manifest.status).toBe("complete");
    expect([manifest.videoModel, manifest.videoResolution, manifest.videoDurationSeconds]).toEqual(["Omni 1.1 Flash", "720p", 6]);
    expect(new Set(manifest.assets.map(asset => asset.id))).toEqual(new Set(cinemaCatalog.movement.map(item => item.id)));
    expect(new Set(manifest.assets.map(asset => asset.flowAssetId)).size).toBe(manifest.assets.length);
    for (const item of cinemaCatalog.movement) {
      const asset = manifest.assets.find(asset => asset.id === item.id)!;
      expect([asset.video, asset.poster]).toEqual([item.video, item.image]);
      const video = readFileSync(path.join(root, asset.video));
      const poster = readFileSync(path.join(root, asset.poster));
      expect(video.subarray(4, 8).toString(), item.id).toBe("ftyp");
      expect(poster.subarray(0, 4).toString(), item.id).toBe("RIFF");
      expect(poster.subarray(8, 12).toString(), item.id).toBe("WEBP");
      expect(createHash("sha256").update(video).digest("hex"), item.id).toBe(asset.product.sha256);
      expect(createHash("sha256").update(poster).digest("hex"), item.id).toBe(asset.posterSha256);
      expect([asset.product.width, asset.product.height, asset.product.duration, asset.product.audio]).toEqual([1280, 720, 6, false]);
      expect(asset.prompt.length).toBeGreaterThan(40);
      expect(asset.flowAssetId).toBeTruthy();
      expect(asset.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(asset.inputImage.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(asset.original.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});
