import { promptPresetService } from "@/server/prompt-presets/prompt-preset-service";
import { withExternalPromptPresetRoute } from "@/server/prompt-presets/external-prompt-preset-http";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ key: string }> }) {
  return withExternalPromptPresetRoute(request, async (ownerEmail, body) => ({ item: await promptPresetService.restore(ownerEmail, (await context.params).key, body) }), { mutation: true });
}
