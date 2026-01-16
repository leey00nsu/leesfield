import { imageGenerationSchema } from "@/features/image-generation/model/image-generation-schema";
import { getImageModelConcurrentLimit } from "@/features/image-generation/model/image-models";
import { getSession } from "@/server/auth/session";
import {
  createMockGeneration,
  findActiveImageGenerations,
} from "@/server/image-generation/image-generation-store";
import {
  buildConcurrentLimitResponse,
  buildErrorResponse,
  buildGenerationSuccessResponse,
  buildInvalidRequestResponse,
} from "@/server/http/response";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  const session = await getSession();

  if (!session.isLoggedIn || !session.adminEmail) {
    return buildErrorResponse("UNAUTHORIZED", 401);
  }

  const body = await request.json().catch(() => null);
  const parsed = imageGenerationSchema.safeParse(body);

  if (!parsed.success) {
    return buildInvalidRequestResponse(parsed.error.flatten());
  }

  try {
    const limit = getImageModelConcurrentLimit(parsed.data.model);
    if (limit > 0) {
      const active = findActiveImageGenerations(
        session.adminEmail,
        parsed.data.model,
      );
      if (active.count >= limit) {
        return buildConcurrentLimitResponse(active.latest?.id);
      }
    }
    const record = await createMockGeneration(parsed.data, session.adminEmail);

    return buildGenerationSuccessResponse(record);
  } catch (error) {
    console.error("[image-generation] create failed", error);
    return buildErrorResponse("DB_SAVE_FAILED", 500);
  }
}
