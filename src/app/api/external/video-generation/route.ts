import { NextResponse } from "next/server";
import { videoGenerationSchema } from "@/features/video-generation/model/video-generation-schema";
import { createMockVideoGeneration } from "@/server/video-generation/video-generation-store";
import { requireApiKey } from "@/server/auth/api-key-guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const FILE_TOO_LARGE_ERROR = "FILE_TOO_LARGE";

async function fileToDataUrl(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = file.type || "image/png";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "";
}

function getNumber(formData: FormData, key: string) {
  const value = getString(formData, key);
  if (value === undefined) return undefined;
  if (value === "") return NaN;
  const parsed = Number(value);
  return parsed;
}

async function getInitImageValue(formData: FormData) {
  const entry = formData.get("initImage");
  if (!entry) return undefined;
  if (typeof entry === "string") {
    return entry.trim() ? entry.trim() : "";
  }
  if (entry instanceof File) {
    if (entry.size === 0) return undefined;
    if (entry.size > MAX_UPLOAD_BYTES) {
      throw new Error(FILE_TOO_LARGE_ERROR);
    }
    return fileToDataUrl(entry);
  }
  return undefined;
}

export async function POST(request: Request) {
  const auth = await requireApiKey(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json(
      { message: "INVALID_FORM_DATA" },
      { status: 400 },
    );
  }

  let initImage: string | undefined;
  try {
    initImage = await getInitImageValue(formData);
  } catch (error) {
    if (error instanceof Error && error.message === FILE_TOO_LARGE_ERROR) {
      return NextResponse.json(
        { message: "FILE_TOO_LARGE" },
        {
          status: 413,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }
    console.error("[video-generation] file parse failed", error);
    return NextResponse.json(
      { message: "INVALID_FORM_DATA" },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const body = {
    prompt: getString(formData, "prompt"),
    initImage,
    model: getString(formData, "model"),
    aspectRatio: getString(formData, "aspectRatio"),
    resolution: getNumber(formData, "resolution"),
    durationSec: getNumber(formData, "durationSec"),
    fps: getNumber(formData, "fps"),
    steps: getNumber(formData, "steps"),
    guidanceScale: getNumber(formData, "guidanceScale"),
    seed: getString(formData, "seed"),
  };

  const parsed = videoGenerationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { message: "INVALID_REQUEST", errors: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const record = await createMockVideoGeneration(
      parsed.data,
      auth.ownerEmail,
    );

    return NextResponse.json(
      {
        requestId: record.id,
        status: record.status,
        progress: record.progress,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("[video-generation] create failed", error);
    return NextResponse.json(
      { message: "INTERNAL_SERVER_ERROR" },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
