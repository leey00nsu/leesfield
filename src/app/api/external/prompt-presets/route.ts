import { promptPresetService } from "@/server/prompt-presets/prompt-preset-service";
import { withExternalPromptPresetRoute } from "@/server/prompt-presets/external-prompt-preset-http";
import { PromptPresetError } from "@/server/prompt-presets/prompt-preset-errors";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return withExternalPromptPresetRoute(request, async (ownerEmail) => {
    const query = new URL(request.url).searchParams;
    const includeInactive = query.get("includeInactive");
    if (includeInactive !== null && includeInactive !== "true" && includeInactive !== "false") throw new PromptPresetError("INVALID_REQUEST", 400);
    return { items: await promptPresetService.list(ownerEmail, {
      ...(query.has("modality") ? { modality: query.get("modality") } : {}),
      includeInactive: includeInactive === "true",
    }) };
  });
}
export async function POST(request: Request) {
  return withExternalPromptPresetRoute(request, async (ownerEmail, body) => ({ item: await promptPresetService.create(ownerEmail, body) }), { mutation: true, status: 201 });
}
