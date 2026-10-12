import { promptPresetService } from "@/server/prompt-presets/prompt-preset-service";
import { withPromptPresetRoute } from "@/server/prompt-presets/prompt-preset-http";

export const dynamic = "force-dynamic";
export const revalidate = 0;
async function postObservedHandler(request: Request, context: { params: Promise<{ key: string }> }) {
  const { key } = await context.params;
  return withPromptPresetRoute(request, async (ownerEmail, body) => ({
    item: await promptPresetService.restore(ownerEmail, key, body),
  }), { mutation: true });
}

import { withRequestObservability } from "@/server/observability/request-observability";
export const POST = withRequestObservability("/api/prompt-presets/[key]/restore", postObservedHandler);
