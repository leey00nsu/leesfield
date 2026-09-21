// @vitest-environment node

import http from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import {
  isForbiddenRemoteAddress,
  RemoteAccessError,
  requestRemote,
  requestRemoteStream,
  resolvePinnedAddress,
} from "./safe-remote";

type TestServer = {
  origin: string;
  port: number;
  close: () => Promise<void>;
};

const servers: TestServer[] = [];

async function startServer(handler: http.RequestListener): Promise<TestServer> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const entry: TestServer = {
    origin: "http://127.0.0.1:" + String(port),
    port,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
  servers.push(entry);
  return entry;
}

function allowServer(...entries: TestServer[]) {
  return {
    allowInsecureHttp: true,
    allowedPorts: entries.map((entry) => entry.port),
    // Loopback is blocked by default; the test server is the explicit exception.
    isAllowedAddress: () => true,
  };
}

async function expectCode(action: () => Promise<unknown>, code: string) {
  try {
    await action();
  } catch (error) {
    expect(error).toBeInstanceOf(RemoteAccessError);
    expect((error as RemoteAccessError).code).toBe(code);
    return;
  }
  throw new Error("expected " + code);
}

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop();
    await server?.close();
  }
});

describe("isForbiddenRemoteAddress", () => {
  it("classifies private and metadata ranges", () => {
    expect(isForbiddenRemoteAddress("127.0.0.1")).toBe(true);
    expect(isForbiddenRemoteAddress("10.1.2.3")).toBe(true);
    expect(isForbiddenRemoteAddress("172.20.1.1")).toBe(true);
    expect(isForbiddenRemoteAddress("192.168.0.1")).toBe(true);
    expect(isForbiddenRemoteAddress("169.254.169.254")).toBe(true);
    expect(isForbiddenRemoteAddress("100.64.0.1")).toBe(true);
    expect(isForbiddenRemoteAddress("::1")).toBe(true);
    expect(isForbiddenRemoteAddress("fd00::1")).toBe(true);
    expect(isForbiddenRemoteAddress("fe80::1")).toBe(true);
    expect(isForbiddenRemoteAddress("fe90::1")).toBe(true);
    expect(isForbiddenRemoteAddress("febf::1")).toBe(true);
    expect(isForbiddenRemoteAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isForbiddenRemoteAddress("8.8.8.8")).toBe(false);
    expect(isForbiddenRemoteAddress("2606:4700::1111")).toBe(false);
  });
});

describe("resolvePinnedAddress", () => {
  it("blocks private answers and keeps the validated one", async () => {
    await expectCode(
      () => resolvePinnedAddress("internal.test", {
        resolveAddresses: async () => ["10.0.0.1"],
      }),
      "REMOTE_ADDRESS_BLOCKED",
    );

    await expect(
      resolvePinnedAddress("mixed.test", {
        resolveAddresses: async () => ["8.8.8.8", "10.0.0.1"],
      }),
    ).rejects.toMatchObject({ code: "REMOTE_ADDRESS_BLOCKED" });

    await expect(
      resolvePinnedAddress("public.test", {
        resolveAddresses: async () => ["8.8.8.8"],
      }),
    ).resolves.toBe("8.8.8.8");
  });

  it("rejects literal private addresses without asking DNS", async () => {
    await expectCode(
      () => resolvePinnedAddress("127.0.0.1"),
      "REMOTE_ADDRESS_BLOCKED",
    );
  });
});

describe("requestRemote", () => {
  it("streams an allowed response through the pinned connection", async () => {
    const server = await startServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/octet-stream" });
      response.write("hello");
      response.end(" stream");
    });

    const result = await requestRemoteStream(
      server.origin + "/stream",
      allowServer(server),
    );
    expect(result.status).toBe(200);
    await expect(new Response(result.body).text()).resolves.toBe("hello stream");
  });

  it("stops a pinned stream when it crosses the byte budget", async () => {
    const server = await startServer((_request, response) => {
      response.writeHead(200);
      response.end("four");
    });
    const result = await requestRemoteStream(server.origin + "/large", {
      ...allowServer(server),
      maxBytes: 2,
    });

    await expect(new Response(result.body).arrayBuffer()).rejects.toMatchObject({
      code: "REMOTE_TOO_LARGE",
    });
  });

  it("keeps the deadline active until a streamed body finishes", async () => {
    const server = await startServer((_request, response) => {
      response.writeHead(200);
      response.write("partial");
    });
    const result = await requestRemoteStream(server.origin + "/stalled", {
      ...allowServer(server),
      timeoutMs: 100,
    });

    await expect(new Response(result.body).arrayBuffer()).rejects.toMatchObject({
      code: "REMOTE_TIMEOUT",
    });
  });

  it("reads an allowed response", async () => {
    const server = await startServer((_request, response) => {
      response.writeHead(200, { "content-type": "image/png" });
      response.end("hello");
    });

    const result = await requestRemote(server.origin + "/file.png", allowServer(server));
    expect(result.status).toBe(200);
    expect(result.body.toString("utf8")).toBe("hello");
    expect(result.headers["content-type"]).toBe("image/png");
  });

  it("connects to the pinned address while keeping the host header", async () => {
    let seenHost: string | undefined;
    const server = await startServer((request, response) => {
      seenHost = request.headers.host;
      response.writeHead(200);
      response.end("pinned");
    });

    const result = await requestRemote("http://pinned.test:" + String(server.port) + "/", {
      ...allowServer(server),
      resolveAddresses: async () => ["127.0.0.1"],
      isAllowedAddress: () => true,
    });

    expect(result.body.toString("utf8")).toBe("pinned");
    expect(seenHost).toBe("pinned.test:" + String(server.port));
  });

  it("validates every redirect hop", async () => {
    let allowedPort = 0;
    const server = await startServer((_request, response) => {
      // Same protocol and port as the allowed hop, but a blocked address.
      response.writeHead(302, { location: "http://10.0.0.5:" + String(allowedPort) + "/steal" });
      response.end();
    });
    allowedPort = server.port;

    await expectCode(
      () =>
        requestRemote(server.origin + "/start", {
          allowInsecureHttp: true,
          allowedPorts: [server.port],
          // Only the test server itself is trusted, so the redirect target stays blocked.
          isAllowedAddress: (address: string) => address === "127.0.0.1",
        }),
      "REMOTE_ADDRESS_BLOCKED",
    );
  });

  it("drops credentials on cross-origin redirects", async () => {
    const headersSeen: Array<string | undefined> = [];
    const target = await startServer((request, response) => {
      headersSeen.push(request.headers.authorization);
      response.writeHead(200);
      response.end("done");
    });
    const entry = await startServer((_request, response) => {
      response.writeHead(302, { location: target.origin + "/next" });
      response.end();
    });

    const result = await requestRemote(entry.origin + "/start", {
      ...allowServer(entry, target),
      headers: { authorization: "Bearer secret" },
    });

    expect(result.status).toBe(200);
    expect(headersSeen).toEqual([undefined]);
  });

  it("times out when the body never ends", async () => {
    const server = await startServer((_request, response) => {
      response.writeHead(200, { "content-type": "image/png" });
      response.write("partial");
    });

    await expectCode(
      () =>
        requestRemote(server.origin + "/slow", {
          ...allowServer(server),
          timeoutMs: 200,
        }),
      "REMOTE_TIMEOUT",
    );
  });

  it("caps the streamed response size", async () => {
    const server = await startServer((_request, response) => {
      response.writeHead(200);
      response.end(Buffer.alloc(4096, 1));
    });

    await expectCode(
      () =>
        requestRemote(server.origin + "/big", {
          ...allowServer(server),
          maxBytes: 512,
        }),
      "REMOTE_TOO_LARGE",
    );
  });

  it("aborts on the caller signal", async () => {
    const server = await startServer((_request, response) => {
      response.writeHead(200);
      response.write("partial");
    });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);

    await expectCode(
      () =>
        requestRemote(server.origin + "/hang", {
          ...allowServer(server),
          timeoutMs: 5000,
          signal: controller.signal,
        }),
      "REMOTE_ABORTED",
    );
  });

  it("limits redirect chains", async () => {
    const server = await startServer((request, response) => {
      response.writeHead(302, { location: request.url ?? "/" });
      response.end();
    });

    await expectCode(
      () =>
        requestRemote(server.origin + "/loop", {
          ...allowServer(server),
          maxRedirects: 2,
        }),
      "REMOTE_REDIRECT_LIMIT",
    );
  });

  it("rejects credentials, unexpected ports and plain http by default", async () => {
    await expectCode(
      () => requestRemote("http://user:pass@example.com/file"),
      "REMOTE_PROTOCOL_BLOCKED",
    );
    await expectCode(
      () => requestRemote("https://user:pass@example.com/file"),
      "REMOTE_CREDENTIALS_BLOCKED",
    );
    await expectCode(
      () => requestRemote("https://example.com:8443/file"),
      "REMOTE_PORT_BLOCKED",
    );
  });
});
