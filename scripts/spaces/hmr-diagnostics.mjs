// HMR frames can also carry private RSC data. Keep only protocol counters and
// bounded reload reasons/chunk names, never raw WebSocket payloads.
export function createHmrDiagnostics() {
  const data = { connections: 0, navigations: 0, reloads: 0, restarts: 0, events: [] };
  const keep = event => { if (data.events.length < 32) data.events.push(event); };
  return {
    navigation() { data.navigations++; },
    message(payload) {
      let message;
      try { message = JSON.parse(String(payload)); } catch { return; }
      if (message?.type === "turbopack-connected") data.connections++;
      if (message?.type === "reloadPage") {
        data.reloads++; keep({ type: "reload", reason: String(message.data).slice(0, 160) });
      }
      if (message?.type === "turbopack-message" && Array.isArray(message.data)) {
        for (const update of message.data) if (update?.type === "restart") {
          data.restarts++; keep({ type: "restart", path: String(update.resource?.path ?? "").slice(0, 200) });
        }
      }
    },
    snapshot() { return structuredClone(data); },
  };
}
