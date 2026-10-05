import { promptPresetService } from "@/server/prompt-presets/prompt-preset-service";
import { withPromptPresetRoute } from "@/server/prompt-presets/prompt-preset-http";
import { PromptPresetError } from "@/server/prompt-presets/prompt-preset-errors";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  return withPromptPresetRoute(request, async (ownerEmail) => {
    const params = new URL(request.url).searchParams;
    const includeInactive = params.get("includeInactive");
    if (includeInactive !== null && includeInactive !== "true" && includeInactive !== "false") {
      throw new PromptPresetError("INVALID_REQUEST", 400);
    }
    return { items: await promptPresetService.list(ownerEmail, {
      ...(params.has("modality") ? { modality: params.get("modality") } : {}),
      includeInactive: includeInactive === "true",
    }) };
  });
}
export async function POST(request: Request) {
  return withPromptPresetRoute(request, async (ownerEmail, body) => ({
    item: await promptPresetService.create(ownerEmail, body),
  }), { mutation: true, status: 201 });
}
