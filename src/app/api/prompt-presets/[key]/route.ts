import { promptPresetService } from "@/server/prompt-presets/prompt-preset-service";
import { withPromptPresetRoute } from "@/server/prompt-presets/prompt-preset-http";

export const dynamic = "force-dynamic";
export const revalidate = 0;
type Context = { params: Promise<{ key: string }> };

async function getObservedHandler(request: Request, context: Context) {
  const { key } = await context.params;
  return withPromptPresetRoute(request, async (ownerEmail) => ({ item: await promptPresetService.get(ownerEmail, key) }));
}
async function patchObservedHandler(request: Request, context: Context) {
  const { key } = await context.params;
  return withPromptPresetRoute(request, async (ownerEmail, body) => ({
    item: await promptPresetService.update(ownerEmail, key, body),
  }), { mutation: true });
}
async function deleteObservedHandler(request: Request, context: Context) {
  const { key } = await context.params;
  return withPromptPresetRoute(request, async (ownerEmail, body) => {
    await promptPresetService.remove(ownerEmail, key, body);
    return { deleted: true };
  }, { mutation: true });
}

import { withRequestObservability } from "@/server/observability/request-observability";
export const GET = withRequestObservability("/api/prompt-presets/[key]", getObservedHandler);
export const PATCH = withRequestObservability("/api/prompt-presets/[key]", patchObservedHandler);
export const DELETE = withRequestObservability("/api/prompt-presets/[key]", deleteObservedHandler);
