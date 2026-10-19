import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { externalSpaceListQuerySchema, externalSpacesResponseSchema } from "@/shared/api/spaces-contract";
import { encodePageCursor, decodePageCursor } from "./page-cursor";

export async function listExternalSpaces(ownerEmail: string, query: z.infer<typeof externalSpaceListQuerySchema>) {
  const { limit, cursor, q, sort } = query;
  const binding = { resource: "spaces", q, sort };
  const position = cursor ? decodePageCursor(cursor, ownerEmail, binding, z.object({ id: z.string(), value: z.string() }).strict()) : null;
  const field = sort === "title-asc" ? "title" : sort === "created-desc" ? "createdAt" : "updatedAt";
  const direction = sort === "title-asc" ? "asc" : "desc";
  let cutoff: Prisma.GenerationGraphWhereInput | undefined;
  if (position) {
    const value = field === "title" ? position.value : z.iso.datetime().parse(position.value);
    cutoff = { OR: [{ [field]: { [direction === "asc" ? "gt" : "lt"]: value } }, { [field]: value, id: { [direction === "asc" ? "gt" : "lt"]: position.id } }] };
  }
  const rows = await prisma.generationGraph.findMany({
    where: { ownerEmail, ...(q ? { title: { contains: q, mode: "insensitive" } } : {}), ...(cutoff ? { AND: [cutoff] } : {}) },
    select: { id: true, title: true, version: true, schemaVersion: true, minimumWriterVersion: true, createdAt: true, updatedAt: true },
    orderBy: [{ [field]: direction }, { id: direction }], take: limit + 1,
  });
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return externalSpacesResponseSchema.parse({
    items: page.map(row => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() })),
    nextCursor: rows.length > limit && last ? encodePageCursor(ownerEmail, binding, { id: last.id, value: field === "title" ? last.title : last[field].toISOString() }) : null,
  });
}
