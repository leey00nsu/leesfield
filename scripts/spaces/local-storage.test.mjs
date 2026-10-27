// @vitest-environment node
import { afterEach, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { LeemageClient } from "leemage-sdk";
import { startLocalStorage } from "./local-storage.mjs";
import { installLocalStorageTransport, localStorageConfiguration } from "./local-storage-transport.mjs";
import { requestRemote } from "../../src/server/http/safe-remote";
import { Agent, request } from "node:http";

let storage, restore;
afterEach(async () => { restore?.(); restore = null; await storage?.close(); storage = null; });
async function setup() {
  storage = await startLocalStorage();
  const env = { NODE_ENV: "development", SPACES_E2E_ISOLATED: "1", SPACES_E2E_LOCAL_STORAGE: storage.url, SPACES_E2E_LOCAL_TOKEN: storage.token, LEEMAGE_BASE_URL: storage.origin };
  restore = installLocalStorageTransport(env);
  return { env, client: new LeemageClient({ apiKey: storage.token, baseUrl: storage.origin }), project: storage.projectId };
}

test("loopback responses retire sockets even when the client requests keep-alive", async () => {
  storage = await startLocalStorage();
  const agent = new Agent({ keepAlive: true });
  const read = () => new Promise((resolve, reject) => {
    const req = request(storage.url + "/api/v1/projects/" + storage.projectId, {
      agent, headers: { Authorization: "Bearer " + storage.token, "x-spaces-storage-token": storage.token },
    }, response => {
      const socket = response.socket, chunks = [];
      response.on("data", chunk => chunks.push(chunk)); response.once("error", reject);
      response.once("end", () => resolve({ socket, status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }));
    });
    req.once("error", reject); req.end();
  });
  try {
    const first = await read(), second = await read();
    expect(first.status).toBe(200); expect(second.status).toBe(200);
    expect(first.body.id).toBe(storage.projectId); expect(second.body).toEqual(first.body);
    expect(first.socket).not.toBe(second.socket);
  } finally { agent.destroy(); }
});

test("real SDK upload and bounded HTTP transport preserve original bytes, variants, ranges and deletion", async () => {
  const { client, project } = await setup();
  const bytes = await readFile(new URL("../../public/sample-image.png", import.meta.url));
  const input = { fileName: "fixture.png", contentType: "image/png", fileSize: bytes.length };
  const signed = await client.files.presign(project, input);
  expect((await fetch(signed.objectUrl)).status).toBe(404);
  const uploaded = await requestRemote(signed.presignedUrl, { method: "PUT", headers: { "Content-Type": input.contentType, "Content-Length": String(bytes.length) }, body: bytes, maxBytes: 1024 });
  expect(uploaded.status).toBe(200);
  const { file } = await client.files.confirm(project, { ...input, fileId: signed.fileId, objectName: signed.objectName, variants: [{ sizeLabel: "source", format: "webp" }] });
  expect(file.mimeType).toBe("image/png");
  expect(file.variants[0]).toMatchObject({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) });
  expect(Buffer.from((await requestRemote(file.url, { maxBytes: bytes.length + 1 })).body)).toEqual(bytes);
  const range = await fetch(file.url, { headers: { Range: "bytes=3-15" } });
  expect(range.status).toBe(206); expect(range.headers.get("content-range")).toBe(`bytes 3-15/${bytes.length}`);
  expect(Buffer.from(await range.arrayBuffer())).toEqual(bytes.subarray(3, 16));
  const display = await fetch(file.variants.find(variant => variant.format === "webp").url);
  const webp = Buffer.from(await display.arrayBuffer());
  expect(webp.subarray(0, 4).toString()).toBe("RIFF"); expect(webp.subarray(8, 12).toString()).toBe("WEBP");
  expect((await client.projects.get(project)).files.map(value => value.id)).toContain(file.id);
  await client.files.delete(project, file.id);
  expect((await fetch(file.url)).status).toBe(404);
  await expect(client.files.delete(project, file.id)).rejects.toMatchObject({ status: 404 });
});

test("fixture refuses cross-run objects, invalid size, expired PUT and unuploaded confirm; private URLs stay blocked", async () => {
  const { client, project } = await setup();
  const input = { fileName: "short.wav", contentType: "audio/wav", fileSize: 4 };
  const signed = await client.files.presign(project, input);
  await expect(client.files.confirm(project, { ...input, fileId: signed.fileId, objectName: signed.objectName })).rejects.toMatchObject({ status: 400 });
  expect((await fetch(signed.presignedUrl, { method: "PUT", headers: { "Content-Type": "audio/wav" }, body: "bad" })).status).toBe(400);
  const expired = new URL(signed.presignedUrl); expired.searchParams.set("expires", "1");
  expect((await fetch(expired, { method: "PUT", body: "data" })).status).toBe(403);
  expect((await fetch(signed.objectUrl.replace(storage.token, "other-run"))).status).toBe(403);
  const otherClient = new LeemageClient({ apiKey: "other-key", baseUrl: storage.origin });
  await expect(otherClient.projects.get(project)).rejects.toMatchObject({ status: 403 });
  await expect(client.projects.get("other-project")).rejects.toMatchObject({ status: 404 });
  await expect(requestRemote("https://127.0.0.1/private")).rejects.toMatchObject({ code: "REMOTE_ADDRESS_BLOCKED" });
});

test("local transport cannot activate in production or with a non-loopback fixture", async () => {
  const { env } = await setup();
  expect(() => localStorageConfiguration({ ...env, NODE_ENV: "production" })).toThrow();
  expect(() => localStorageConfiguration({ ...env, SPACES_E2E_ISOLATED: "0" })).toThrow();
  expect(() => localStorageConfiguration({ ...env, SPACES_E2E_LOCAL_STORAGE: "http://example.com:1234" })).toThrow();
  expect(localStorageConfiguration({ NODE_ENV: "production" })).toBe(null);
});
