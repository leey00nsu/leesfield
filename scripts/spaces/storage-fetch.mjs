// Loaded only by the isolated Next process. Forward every original request
// and response unchanged; this is admission control, never a storage fixture.
const { SPACES_E2E_STORAGE_GATE: gate, SPACES_E2E_STORAGE_TOKEN: token, LEEMAGE_BASE_URL: upstream } = process.env;
if (gate && token && upstream && process.env.SPACES_E2E_ISOLATED === "1") {
  const origin = new URL(upstream).origin, fetchOriginal = globalThis.fetch;
  globalThis.fetch = async (input, options) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.origin === origin && url.pathname.startsWith("/api/v1/")) {
      const bucket = /\/files\/(presign|confirm)$/.test(url.pathname) ? "upload" : "api";
      const admitted = await fetchOriginal(`${gate}/${bucket}`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
        signal: options?.signal !== undefined ? options.signal : (input instanceof Request ? input.signal : undefined),
      });
      if (!admitted.ok) throw new Error("Isolated storage admission unavailable");
    }
    return fetchOriginal(input, options);
  };
}
