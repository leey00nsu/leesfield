import { NextResponse } from "next/server";
import { imageGenerationSchema } from "@/features/image-generation/model/image-generation-schema";
import { createMockGeneration } from "@/server/image-generation/image-generation-store";
import { requireApiKey } from "@/server/auth/api-key-guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

async function getDataUrlList(formData: FormData, keys: string[]) {
  const entries = keys.flatMap((key) => formData.getAll(key));
  const results: string[] = [];

  for (const entry of entries) {
    if (typeof entry === "string") {
      if (entry.trim()) {
        results.push(entry.trim());
      }
      continue;
    }
    if (entry instanceof File) {
      if (entry.size === 0) continue;
      if (entry.size > MAX_UPLOAD_BYTES) {
        throw new Error(FILE_TOO_LARGE_ERROR);
      }
      results.push(await fileToDataUrl(entry));
    }
  }

  return results;
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

  let initImages: string[] = [];
  try {
    initImages = await getDataUrlList(formData, [
      "initImages",
      "initImages[]",
    ]);
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
    console.error("[image-generation] file parse failed", error);
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
    width: getNumber(formData, "width"),
    height: getNumber(formData, "height"),
    initImages: initImages.length > 0 ? initImages : undefined,
    model: getString(formData, "model"),
    imageCount: getNumber(formData, "imageCount"),
    steps: getNumber(formData, "steps"),
    seed: getString(formData, "seed"),
  };

  const parsed = imageGenerationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { message: "INVALID_REQUEST", errors: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const record = await createMockGeneration(parsed.data, auth.ownerEmail);

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
    console.error("[image-generation] create failed", error);
    return NextResponse.json(
      { message: "DB_SAVE_FAILED" },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
