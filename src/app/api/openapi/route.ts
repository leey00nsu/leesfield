import { NextResponse } from "next/server";
import { getOpenApiDocument } from "@/features/api-docs/model/openapi";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const document = getOpenApiDocument();

  return NextResponse.json(document, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
