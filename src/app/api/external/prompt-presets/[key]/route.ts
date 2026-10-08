import { promptPresetService } from "@/server/prompt-presets/prompt-preset-service";
import { withExternalPromptPresetRoute } from "@/server/prompt-presets/external-prompt-preset-http";
type Context = { params: Promise<{ key: string }> };
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: Context) {
  return withExternalPromptPresetRoute(request, async (ownerEmail) => ({ item: await promptPresetService.get(ownerEmail, (await context.params).key) }));
}
export async function PATCH(request: Request, context: Context) {
  return withExternalPromptPresetRoute(request, async (ownerEmail, body) => ({ item: await promptPresetService.update(ownerEmail, (await context.params).key, body) }), { mutation: true });
}
export async function DELETE(request: Request, context: Context) {
  return withExternalPromptPresetRoute(request, async (ownerEmail, body) => {
    await promptPresetService.remove(ownerEmail, (await context.params).key, body);
    return { deleted: true };
  }, { mutation: true });
}
