import { promptPresetService } from "@/server/prompt-presets/prompt-preset-service";
import { withExternalPromptPresetRoute } from "@/server/prompt-presets/external-prompt-preset-http";
export const dynamic = "force-dynamic";
async function postObservedHandler(request: Request, context: { params: Promise<{ key: string }> }) {
  return withExternalPromptPresetRoute(request, async (ownerEmail, body) => ({ item: await promptPresetService.restore(ownerEmail, (await context.params).key, body) }), { mutation: true });
}

import { withRequestObservability } from "@/server/observability/request-observability";
export const POST = withRequestObservability("/api/external/prompt-presets/[key]/restore", postObservedHandler);
