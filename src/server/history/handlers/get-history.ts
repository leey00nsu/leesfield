import { prisma } from "@/server/db/prisma";
import {
  buildImageWhere,
  extractModel,
  parseHistoryQuery,
  type HistoryResponse,
} from "@/server/history/lib/history-query";

export async function getHistory(
  searchParams: URLSearchParams,
): Promise<HistoryResponse> {
  const query = parseHistoryQuery(searchParams);

  if (query.type === "video") {
    return {
      items: [],
      total: 0,
      limit: query.limit,
      offset: query.offset,
    };
  }

  const where = buildImageWhere(query);
  const orderBy = {
    createdAt: query.sort === "date_asc" ? "asc" : "desc",
  } as const;

  const [records, total] = await prisma.$transaction([
    prisma.imageGeneration.findMany({
      where,
      orderBy,
      skip: query.offset,
      take: query.limit,
      include: {
        images: {
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
    }),
    prisma.imageGeneration.count({ where }),
  ]);

  const items = records.map((record) => {
    const model = extractModel(record.requestParams);
    const previewUrl = record.images[0]?.url ?? null;
    const isCompleted = record.status === "completed";

    return {
      id: record.requestId,
      type: "image",
      status: record.status,
      prompt: record.prompt,
      model,
      createdAt: record.createdAt.toISOString(),
      resultUrl: isCompleted ? previewUrl : null,
      thumbnailUrl: isCompleted ? previewUrl : null,
      errorMessage: record.status === "failed" ? record.errorMessage ?? null : null,
    };
  });

  return {
    items,
    total,
    limit: query.limit,
    offset: query.offset,
  };
}
