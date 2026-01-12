import { NextResponse } from "next/server";
import {
  modelCatalog,
} from "@/features/model-management/model/model-catalog";
import { requireApiKey } from "@/server/auth/api-key-guard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const auth = await requireApiKey(request);
  if (auth instanceof NextResponse) {
    return auth;
  }

  return NextResponse.json(
    {
      items: modelCatalog,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
