import { promptPresetService } from "@/server/prompt-presets/prompt-preset-service";
import { withExternalPromptPresetRoute } from "@/server/prompt-presets/external-prompt-preset-http";
type Context = { params: Promise<{ key: string }> };
export const dynamic = "force-dynamic";
async function getObservedHandler(request: Request, context: Context) {
  return withExternalPromptPresetRoute(request, async (ownerEmail) => ({ item: await promptPresetService.get(ownerEmail, (await context.params).key) }));
}
async function patchObservedHandler(request: Request, context: Context) {
  return withExternalPromptPresetRoute(request, async (ownerEmail, body) => ({ item: await promptPresetService.update(ownerEmail, (await context.params).key, body) }), { mutation: true });
}
async function deleteObservedHandler(request: Request, context: Context) {
  return withExternalPromptPresetRoute(request, async (ownerEmail, body) => {
    await promptPresetService.remove(ownerEmail, (await context.params).key, body);
    return { deleted: true };
  }, { mutation: true });
}

import { withRequestObservability } from "@/server/observability/request-observability";
export const GET = withRequestObservability("/api/external/prompt-presets/[key]", getObservedHandler);
export const PATCH = withRequestObservability("/api/external/prompt-presets/[key]", patchObservedHandler);
export const DELETE = withRequestObservability("/api/external/prompt-presets/[key]", deleteObservedHandler);
