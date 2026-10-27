// @vitest-environment node
import { afterEach, expect, test } from "vitest";
import { startAssistantProvider, installAssistantTransport, assistantTransportConfiguration } from "./assistant-transport.mjs";
import { requestRemote } from "../../src/server/http/safe-remote";

let provider, restore;
afterEach(async () => { restore?.(); restore = null; await provider?.close(); provider = null; });

test("real bounded provider HTTP preserves submitted text while private URLs and unauthenticated sockets stay blocked", async () => {
  provider = await startAssistantProvider();
  const env = { NODE_ENV: "development", SPACES_E2E_ISOLATED: "1", SPACES_E2E_ASSISTANT_URL: provider.url,
    SPACES_E2E_ASSISTANT_ORIGIN: provider.origin, SPACES_E2E_ASSISTANT_TOKEN: provider.token };
  restore = installAssistantTransport(env);
  const response = await requestRemote(provider.origin + "/v1/chat/completions", { method: "POST",
    body: JSON.stringify({ model: "fixture-a", messages: [{ role: "user", content: "Durable queue instruction" }], stream: false }),
    headers: { "content-type": "application/json", authorization: "Bearer isolated-provider-key" }, maxBytes: 4096 });
  expect(response.status).toBe(200);
  expect(JSON.parse(response.body.toString())).toEqual({ choices: [{ message: { content: "Assistant result: Durable queue instruction" } }] });
  expect(provider.calls()).toBe(1);
  await expect(requestRemote("http://127.0.0.1/private", { allowInsecureHttp: true })).rejects.toMatchObject({ code: "REMOTE_ADDRESS_BLOCKED" });
  expect((await fetch(provider.url + "/v1/chat/completions", { method: "POST", body: "{}" })).status).toBe(403);
  await expect(requestRemote(provider.origin + "/unexpected", { method: "POST" })).rejects.toThrow();
  for (const override of [{ NODE_ENV: "production" }, { SPACES_E2E_ISOLATED: "0" }, { SPACES_E2E_ASSISTANT_URL: "http://10.0.0.1:80" },
    { SPACES_E2E_ASSISTANT_ORIGIN: "https://api.openai.com" }, { SPACES_E2E_ASSISTANT_TOKEN: "bad" }]) {
    expect(() => assistantTransportConfiguration({ ...env, ...override })).toThrow("Invalid isolated assistant transport");
  }
  expect(assistantTransportConfiguration({})).toBeNull();
});
