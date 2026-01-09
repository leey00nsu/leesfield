import { prisma } from "@/server/db/prisma";
import {
  buildImageWhere,
  buildVideoWhere,
  extractModel,
  parseHistoryQuery,
  type HistoryResponse,
} from "@/server/history/lib/history-query";

export async function getHistory(
  searchParams: URLSearchParams,
): Promise<HistoryResponse> {
  const query = parseHistoryQuery(searchParams);
  const MAX_OFFSET = 200;

  const orderBy = {
    createdAt: query.sort === "date_asc" ? "asc" : "desc",
  } as const;

  if (query.type === "image") {
    const where = buildImageWhere(query);
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
        type: "image" as const,
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

  if (query.type === "video") {
    const where = buildVideoWhere(query);
    const [records, total] = await prisma.$transaction([
      prisma.videoGeneration.findMany({
        where,
        orderBy,
        skip: query.offset,
        take: query.limit,
        include: {
          videos: {
            orderBy: { createdAt: "asc" },
            take: 1,
          },
        },
      }),
      prisma.videoGeneration.count({ where }),
    ]);

    const items = records.map((record) => {
      const model = extractModel(record.requestParams);
      const previewUrl = record.videos[0]?.url ?? null;
      const isCompleted = record.status === "completed";

      return {
        id: record.requestId,
        type: "video" as const,
        status: record.status,
        prompt: record.prompt,
        model,
        createdAt: record.createdAt.toISOString(),
        resultUrl: isCompleted ? previewUrl : null,
        thumbnailUrl: null,
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

  const cappedOffset = Math.min(query.offset, MAX_OFFSET);
  const take = query.limit + cappedOffset;
  const imageWhere = buildImageWhere(query);
  const videoWhere = buildVideoWhere(query);

  const [
    imageRecords,
    imageTotal,
    videoRecords,
    videoTotal,
  ] = await prisma.$transaction([
    prisma.imageGeneration.findMany({
      where: imageWhere,
      orderBy,
      take,
      include: {
        images: {
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
    }),
    prisma.imageGeneration.count({ where: imageWhere }),
    prisma.videoGeneration.findMany({
      where: videoWhere,
      orderBy,
      take,
      include: {
        videos: {
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
    }),
    prisma.videoGeneration.count({ where: videoWhere }),
  ]);

  const imageItems = imageRecords.map((record) => {
    const model = extractModel(record.requestParams);
    const previewUrl = record.images[0]?.url ?? null;
    const isCompleted = record.status === "completed";

    return {
      id: record.requestId,
      type: "image" as const,
      status: record.status,
      prompt: record.prompt,
      model,
      createdAt: record.createdAt.toISOString(),
      resultUrl: isCompleted ? previewUrl : null,
      thumbnailUrl: isCompleted ? previewUrl : null,
      errorMessage: record.status === "failed" ? record.errorMessage ?? null : null,
    };
  });

  const videoItems = videoRecords.map((record) => {
    const model = extractModel(record.requestParams);
    const previewUrl = record.videos[0]?.url ?? null;
    const isCompleted = record.status === "completed";

    return {
      id: record.requestId,
      type: "video" as const,
      status: record.status,
      prompt: record.prompt,
      model,
      createdAt: record.createdAt.toISOString(),
      resultUrl: isCompleted ? previewUrl : null,
      thumbnailUrl: null,
      errorMessage: record.status === "failed" ? record.errorMessage ?? null : null,
    };
  });

  const merged = [...imageItems, ...videoItems].sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime();
    const bTime = new Date(b.createdAt).getTime();
    return query.sort === "date_asc" ? aTime - bTime : bTime - aTime;
  });

  return {
    items: merged.slice(cappedOffset, cappedOffset + query.limit),
    total: imageTotal + videoTotal,
    limit: query.limit,
    offset: cappedOffset,
  };
}
