import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

// Next already owns sharp for image processing; reuse its installed runtime.
const sharp = createRequire(import.meta.resolve("next/package.json"))("sharp");
const MAX_BYTES = 64 * 1024 * 1024;

// A file transport fixture, not a substitute for the app/media service. Files
// are decoded and transformed with sharp; the app still inspects the bytes.
export async function startLocalStorage() {
  const directory = await mkdtemp(join(tmpdir(), "leesfield-storage-"));
  const token = randomBytes(32).toString("hex"), projectId = randomUUID();
  const origin = `https://storage-${randomUUID()}.r2.cloudflarestorage.com`, files = new Map();
  const counters = { presign: 0, put: 0, confirm: 0, read: 0, delete: 0, rejected: 0 };
  const objectUrl = (id, part = "original") => `${origin}/objects/${token}/${id}/${part}`;
  const fail = (response, status) => { counters.rejected++; response.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify({ message: "Isolated storage request rejected" })); };
  async function body(request, max = MAX_BYTES) {
    const chunks = []; let size = 0;
    for await (const chunk of request) { size += chunk.length; if (size > max) throw new Error("body-limit"); chunks.push(chunk); }
    return Buffer.concat(chunks);
  }
  const json = (response, value) => response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(value));
  const server = createServer(async (request, response) => {
    // These are small loopback test transfers. End the socket with the response
    // so the browser's HTTP agent cannot race the server's idle-socket expiry.
    // Actual bytes/status failures still propagate; no request is retried.
    response.setHeader("Connection", "close");
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "GET,HEAD,PUT,POST,DELETE,OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "*");
    response.setHeader("Access-Control-Expose-Headers", "Content-Range,Content-Length,Accept-Ranges");
    try {
      if (request.method === "OPTIONS") { response.writeHead(204).end(); return; }
      const url = new URL(request.url, origin);
      const object = url.pathname.match(/^\/objects\/([^/]+)\/([^/]+)\/(original|display|thumbnail)$/);
      if (object) {
        const [, key, id, part] = object, file = files.get(id);
        if (key !== token) return fail(response, 403);
        if (!file) return fail(response, 404);
        if (request.method === "PUT" && part === "original") {
          if (Number(url.searchParams.get("expires")) < Date.now() || url.searchParams.get("X-Amz-Signature") !== token || file.confirmed) return fail(response, 403);
          const bytes = await body(request);
          if (bytes.length !== file.input.fileSize || request.headers["content-type"] !== file.input.contentType) return fail(response, 400);
          await writeFile(join(directory, id), bytes); file.uploaded = true; counters.put++;
          response.writeHead(200).end(); return;
        }
        if (!["GET", "HEAD"].includes(request.method)) return fail(response, 405);
        if (!file.confirmed || (part !== "original" && !file.parts[part])) return fail(response, 404);
        const value = part === "original" ? { path: join(directory, id), mimeType: file.input.contentType } : file.parts[part];
        const bytes = await readFile(value.path); counters.read++;
        response.setHeader("Content-Type", value.mimeType);
        response.setHeader("Accept-Ranges", "bytes");
        let start = 0, end = bytes.length - 1;
        if (request.headers.range) {
          const range = request.headers.range.match(/^bytes=(\d+)-(\d*)$/);
          if (!range || Number(range[1]) >= bytes.length || (range[2] && Number(range[2]) < Number(range[1]))) { response.setHeader("Content-Range", `bytes */${bytes.length}`); return fail(response, 416); }
          start = Number(range[1]); end = range[2] ? Math.min(Number(range[2]), end) : end;
          response.setHeader("Content-Range", `bytes ${start}-${end}/${bytes.length}`);
        }
        response.setHeader("Content-Length", end - start + 1);
        response.writeHead(request.headers.range ? 206 : 200).end(request.method === "HEAD" ? undefined : bytes.subarray(start, end + 1)); return;
      }
      if (request.headers.authorization !== `Bearer ${token}` || request.headers["x-spaces-storage-token"] !== token) return fail(response, 403);
      const base = `/api/v1/projects/${projectId}`;
      if (url.pathname === base && request.method === "GET") return json(response, { id: projectId, files: [...files.values()].filter(file => file.confirmed).map(file => file.result) });
      if (url.pathname === `${base}/files/presign` && request.method === "POST") {
        const input = JSON.parse((await body(request, 8192)).toString());
        if (!Number.isInteger(input.fileSize) || input.fileSize <= 0 || input.fileSize > MAX_BYTES || typeof input.fileName !== "string" || !/^(image|audio|video)\//.test(input.contentType)) return fail(response, 400);
        const id = randomUUID(), expiresAt = new Date(Date.now() + 300_000).toISOString(), name = `objects/${token}/${id}/original`;
        files.set(id, { input, name, uploaded: false, confirmed: false, parts: {} }); counters.presign++;
        return json(response, { fileId: id, objectName: name, objectUrl: objectUrl(id), presignedUrl: `${objectUrl(id)}?expires=${Date.parse(expiresAt)}&X-Amz-Signature=${token}`, expiresAt });
      }
      if (url.pathname === `${base}/files/confirm` && request.method === "POST") {
        const input = JSON.parse((await body(request, 8192)).toString()), file = files.get(input.fileId);
        if (!file?.uploaded || input.objectName !== file.name || input.fileSize !== file.input.fileSize || input.contentType !== file.input.contentType || input.fileName !== file.input.fileName) return fail(response, 400);
        if (file.confirmed) return json(response, { message: "Already confirmed", file: file.result });
        if (input.variants?.some(value => value.sizeLabel !== "source" || value.format !== "webp")) return fail(response, 400);
        const isImage = file.input.contentType.startsWith("image/"), variants = [];
        if (isImage) {
          const source = join(directory, input.fileId), display = source + ".webp", thumbnail = source + ".thumbnail.webp";
          const probe = await sharp(source).metadata();
          const format = file.input.contentType.slice(6).replace("jpeg", "jpg");
          variants.push({ url: objectUrl(input.fileId), format, size: input.fileSize, width: probe.width, height: probe.height, sizeLabel: "source" });
          if (input.variants?.length) {
            await sharp(source).webp().toFile(display);
            await sharp(source).resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true }).webp().toFile(thumbnail);
            file.parts.display = { path: display, mimeType: "image/webp" }; file.parts.thumbnail = { path: thumbnail, mimeType: "image/webp" };
            variants.push({ url: objectUrl(input.fileId, "display"), format: "webp", size: (await readFile(display)).length, width: probe.width, height: probe.height, sizeLabel: "source" });
            const scale = Math.min(1, 480 / probe.width, 480 / probe.height);
            file.thumbnail = { url: objectUrl(input.fileId, "thumbnail"), format: "webp", size: (await readFile(thumbnail)).length, width: Math.round(probe.width * scale), height: Math.round(probe.height * scale), sizeLabel: "thumbnail" };
          }
        }
        file.result = { id: input.fileId, name: input.fileName, mimeType: input.contentType, isImage, size: input.fileSize, url: objectUrl(input.fileId), variants, ...(file.thumbnail ? { thumbnail: file.thumbnail } : {}), projectId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        file.confirmed = true; counters.confirm++; return json(response, { message: "Confirmed", file: file.result });
      }
      const deletion = url.pathname.match(new RegExp(`^${base}/files/([^/]+)$`));
      if (deletion && request.method === "DELETE") {
        const file = files.get(deletion[1]); if (!file) return fail(response, 404);
        files.delete(deletion[1]); await Promise.all([join(directory, deletion[1]), ...Object.values(file.parts).map(part => part.path)].map(path => rm(path, { force: true })));
        counters.delete++; response.writeHead(204).end(); return;
      }
      return fail(response, 404);
    } catch { if (!response.headersSent) fail(response, 500); else response.destroy(); }
  });
  try { await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); }); }
  catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
  return { origin, token, projectId, url: `http://127.0.0.1:${server.address().port}`, snapshot: () => ({ ...counters }),
    async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }); },
  };
}
