import { prisma } from "@/server/db/prisma";
import {
  buildAudioWhere,
  buildImageWhere,
  buildVideoWhere,
  extractInputAudios,
  extractInputImages,
  extractModel,
  extractReferenceText,
  parseHistoryQuery,
  type HistoryResponse,
} from "@/server/history/lib/history-query";

export async function getHistory(
  searchParams: URLSearchParams,
  ownerEmail: string,
): Promise<HistoryResponse> {
  const query = parseHistoryQuery(searchParams);
  const MAX_OFFSET = 200;
  const cappedOffset = Math.min(query.offset, MAX_OFFSET);

  const orderBy = {
    createdAt: query.sort === "date_asc" ? "asc" : "desc",
  } as const;

  if (query.type === "image") {
    const where = { ownerEmail, ...buildImageWhere(query) };
    const [records, total] = await prisma.$transaction([
      prisma.imageGeneration.findMany({
        where,
        orderBy,
        skip: cappedOffset,
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
      const inputImages = extractInputImages(record.requestParams);
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
        inputImages,
        errorMessage: record.status === "failed" ? record.errorMessage ?? null : null,
      };
    });

    return {
      items,
      total,
      limit: query.limit,
      offset: cappedOffset,
    };
  }

  if (query.type === "video") {
    const where = { ownerEmail, ...buildVideoWhere(query) };
    const [records, total] = await prisma.$transaction([
      prisma.videoGeneration.findMany({
        where,
        orderBy,
        skip: cappedOffset,
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
      const inputImages = extractInputImages(record.requestParams);
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
        inputImages,
        errorMessage: record.status === "failed" ? record.errorMessage ?? null : null,
      };
    });

    return {
      items,
      total,
      limit: query.limit,
      offset: cappedOffset,
    };
  }

  if (query.type === "audio") {
    const where = { ownerEmail, ...buildAudioWhere(query) };
    const [records, total] = await prisma.$transaction([
      prisma.audioGeneration.findMany({
        where,
        orderBy,
        skip: cappedOffset,
        take: query.limit,
        include: {
          audios: {
            orderBy: { createdAt: "asc" },
            take: 1,
          },
        },
      }),
      prisma.audioGeneration.count({ where }),
    ]);

    const items = records.map((record) => {
      const model = extractModel(record.requestParams);
      const previewUrl = record.audios[0]?.url ?? null;
      const isCompleted = record.status === "completed";
      const inputAudios = extractInputAudios(record.requestParams);
      const referenceText = extractReferenceText(record.requestParams);

      return {
        id: record.requestId,
        type: "audio" as const,
        status: record.status,
        prompt: record.prompt,
        model,
        createdAt: record.createdAt.toISOString(),
        resultUrl: isCompleted ? previewUrl : null,
        thumbnailUrl: null,
        inputImages: [],
        inputAudios,
        referenceText,
        errorMessage: record.status === "failed" ? record.errorMessage ?? null : null,
      };
    });

    return {
      items,
      total,
      limit: query.limit,
      offset: cappedOffset,
    };
  }

  const take = query.limit + cappedOffset;
  const imageWhere = { ownerEmail, ...buildImageWhere(query) };
  const videoWhere = { ownerEmail, ...buildVideoWhere(query) };
  const audioWhere = { ownerEmail, ...buildAudioWhere(query) };

  const [
    imageRecords,
    imageTotal,
    videoRecords,
    videoTotal,
    audioRecords,
    audioTotal,
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
    prisma.audioGeneration.findMany({
      where: audioWhere,
      orderBy,
      take,
      include: {
        audios: {
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
    }),
    prisma.audioGeneration.count({ where: audioWhere }),
  ]);

  const imageItems = imageRecords.map((record) => {
    const model = extractModel(record.requestParams);
    const inputImages = extractInputImages(record.requestParams);
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
      inputImages,
      errorMessage: record.status === "failed" ? record.errorMessage ?? null : null,
    };
  });

  const videoItems = videoRecords.map((record) => {
    const model = extractModel(record.requestParams);
    const inputImages = extractInputImages(record.requestParams);
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
      inputImages,
      errorMessage: record.status === "failed" ? record.errorMessage ?? null : null,
    };
  });

  const audioItems = audioRecords.map((record) => {
    const model = extractModel(record.requestParams);
    const previewUrl = record.audios[0]?.url ?? null;
    const isCompleted = record.status === "completed";
    const inputAudios = extractInputAudios(record.requestParams);
    const referenceText = extractReferenceText(record.requestParams);

    return {
      id: record.requestId,
      type: "audio" as const,
      status: record.status,
      prompt: record.prompt,
      model,
      createdAt: record.createdAt.toISOString(),
      resultUrl: isCompleted ? previewUrl : null,
      thumbnailUrl: null,
      inputImages: [],
      inputAudios,
      referenceText,
      errorMessage: record.status === "failed" ? record.errorMessage ?? null : null,
    };
  });

  const merged = [...imageItems, ...videoItems, ...audioItems].sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime();
    const bTime = new Date(b.createdAt).getTime();
    return query.sort === "date_asc" ? aTime - bTime : bTime - aTime;
  });

  return {
    items: merged.slice(cappedOffset, cappedOffset + query.limit),
    total: imageTotal + videoTotal + audioTotal,
    limit: query.limit,
    offset: cappedOffset,
  };
}
