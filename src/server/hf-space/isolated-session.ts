import { Client } from "@gradio/client";
import { awaitWithTimeout } from "@/server/http/bounded-io";

type SessionClient = {
  app_reference?: string;
  options?: { token?: `hf_${string}` };
  config?: { components?: Array<{ type?: string }> };
};

/** Metadata may be cached; mutable Gradio State must belong to one execution. */
export async function withGradioSession<T, C extends SessionClient>(
  cached: C,
  stateful: boolean,
  config: { timeoutMs: number; spaceUrl: string },
  run: (client: C) => Promise<T>,
): Promise<T> {
  const needsSession = stateful || cached.config?.components?.some(component => component.type?.toLowerCase() === "state");
  if (!needsSession) return run(cached);
  let expired = false;
  const connecting = Client.connect(cached.app_reference ?? config.spaceUrl, {
    token: cached.options?.token,
    with_null_state: false,
  }).then(client => {
    if (expired) client.close();
    return client;
  });
  let client: Client;
  try {
    client = await awaitWithTimeout(connecting, Math.min(config.timeoutMs, 10_000), "HF_SPACE_CONNECT_TIMEOUT");
  } catch (error) {
    expired = true;
    throw error;
  }
  try { return await run(client as unknown as C); }
  finally { client.close(); }
}
