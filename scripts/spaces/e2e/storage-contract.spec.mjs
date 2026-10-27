import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { LeemageClient } from "leemage-sdk";
import { sealData } from "iron-session";
import { test, expect } from "./spaces-test-fixtures.mjs";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
async function admitted(action) {
  const gate = await fetch(`${process.env.SPACES_E2E_STORAGE_GATE}/api`, { method: "POST", headers: { Authorization: `Bearer ${process.env.SPACES_E2E_STORAGE_TOKEN}` } });
  expect(gate.ok).toBe(true);
  return action();
}

test("real Leemage preserves app PNG/WAV/MP4 uploads, owner boundaries and deletion", async ({ context, browser }, testInfo) => {
  expect(process.env.SPACES_E2E_STORAGE_PROFILE).toBe("contract");
  expect(process.env.SPACES_E2E_LOCAL_STORAGE).toBeUndefined();
  const api = context.request, project = process.env.LEEMAGE_PROJECT_ID;
  const client = new LeemageClient({ apiKey: process.env.LEEMAGE_API_KEY, baseUrl: process.env.LEEMAGE_BASE_URL });
  const other = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const cookie = await sealData({ isLoggedIn: true, adminEmail: "storage-other-owner@localhost" }, { password: process.env.SESSION_PASSWORD });
  await other.addCookies([{ name: "leesfield_session", value: cookie, url: testInfo.project.use.baseURL }]);
  const verified = [];
  try {
    const bad = await api.post("/api/media-assets/uploads", { data: { intendedType: "image", fileName: "bad.wav", declaredMimeType: "audio/wav", declaredBytes: 44 } });
    expect(bad.status()).toBe(422);
    for (const [type, mime, path] of [["image", "image/png", "public/sample-image.png"], ["audio", "audio/wav", "public/assets/storybook/tone.wav"], ["video", "video/mp4", "public/sample-video.mp4"]]) {
      const bytes = await readFile(path);
      const created = await api.post("/api/media-assets/uploads", { data: { intendedType: type, fileName: `contract.${path.split(".").at(-1)}`, declaredMimeType: mime, declaredBytes: bytes.length } });
      expect(created.status(), `create ${type} upload`).toBe(201);
      const { upload } = await created.json();
      const put = await api.put(upload.upload.url, { headers: upload.upload.headers, data: bytes });
      expect(put.status(), `relay ${type} bytes`).toBe(200);
      const confirmed = await api.post(`/api/media-assets/uploads/${upload.id}/confirm`, { data: {} });
      expect(confirmed.status(), `confirm ${type}`).toBe(200);
      const { asset } = await confirmed.json();
      expect(asset).toMatchObject({ type, mimeType: mime, bytes: String(bytes.length) });
      const read = await api.get(`/api/media-assets/${asset.id}/content`);
      expect(read.ok(), `read ${type} bytes`).toBe(true);
      expect(digest(await read.body())).toBe(digest(bytes));
      expect((await other.request.get(`/api/media-assets/${asset.id}/content`)).status()).toBe(404);
      const remote = await admitted(() => client.projects.get(project));
      const file = remote.files.find(file => file.id === asset.storageObjectId || file.url === asset.url || file.variants.some(variant => variant.url === asset.url));
      expect(file, "app upload must exist in the real project").toBeTruthy();
      expect(file.mimeType).toBe(mime);
      expect(digest(Buffer.from(await (await fetch(file.url ?? file.variants[0].url)).arrayBuffer()))).toBe(digest(bytes));
      const removed = await api.delete(`/api/media-assets/${asset.id}`);
      expect(removed.status()).toBe(204);
      // The application cleanup queue owns deletion. Observe actual upstream
      // absence before testing the SDK's already-deleted error contract.
      await expect.poll(async () => (await admitted(() => client.projects.get(project))).files.some(value => value.id === file.id), { timeout: 20_000, intervals: [1_000] }).toBe(false);
      await expect(admitted(() => client.files.delete(project, file.id))).rejects.toMatchObject({ status: 404 });
      expect((await api.get(`/api/media-assets/${asset.id}/content`)).status()).toBe(404);
      verified.push({ type, bytes: bytes.length, sha256: digest(bytes), deleted: true });
    }
    await testInfo.attach("real-storage-contract", { body: JSON.stringify(verified), contentType: "application/json" });
  } finally { await other.close(); }
});
