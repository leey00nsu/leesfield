import { promptPresetService } from "@/server/prompt-presets/prompt-preset-service";
import { withPromptPresetRoute } from "@/server/prompt-presets/prompt-preset-http";

export const dynamic = "force-dynamic";
export const revalidate = 0;
type Context = { params: Promise<{ key: string }> };

export async function GET(request: Request, context: Context) {
  const { key } = await context.params;
  return withPromptPresetRoute(request, async (ownerEmail) => ({ item: await promptPresetService.get(ownerEmail, key) }));
}
export async function PATCH(request: Request, context: Context) {
  const { key } = await context.params;
  return withPromptPresetRoute(request, async (ownerEmail, body) => ({
    item: await promptPresetService.update(ownerEmail, key, body),
  }), { mutation: true });
}
export async function DELETE(request: Request, context: Context) {
  const { key } = await context.params;
  return withPromptPresetRoute(request, async (ownerEmail, body) => {
    await promptPresetService.remove(ownerEmail, key, body);
    return { deleted: true };
  }, { mutation: true });
}
