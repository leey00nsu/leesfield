// @vitest-environment node
import { it, expect, vi } from "vitest";
const findMany = vi.hoisted(() => vi.fn());
vi.mock("@/server/db/prisma", () => ({ prisma: { generationGraph: { findMany } } }));
import { listExternalSpaces } from "./spaces-page";
import { externalSpaceListQuerySchema } from "@/shared/api/spaces-contract";

it("bounds DB reads, uses stable keysets and binds cursors to owner and filter", async () => {
  const date = new Date();
  const rows = ["b","a"].map(id => ({ id,title:"One",version:1,schemaVersion:3,minimumWriterVersion:3,createdAt:date,updatedAt:date }));
  findMany.mockResolvedValue(rows);
  const query = externalSpaceListQuerySchema.parse({ limit:1, q:"One" });
  const first = await listExternalSpaces("owner@example.com",query);
  expect(first.items.map(x=>x.id)).toEqual(["b"]);
  expect(findMany.mock.calls[0][0]).toMatchObject({ where:{ownerEmail:"owner@example.com",title:{contains:"One",mode:"insensitive"}}, take:2, orderBy:[{updatedAt:"desc"},{id:"desc"}] });
  await listExternalSpaces("owner@example.com",{...query,cursor:first.nextCursor!});
  expect(findMany.mock.calls[1][0].where.AND).toEqual([{OR:[{updatedAt:{lt:date.toISOString()}},{updatedAt:date.toISOString(),id:{lt:"b"}}]}]);
  await expect(listExternalSpaces("foreign@example.com",{...query,cursor:first.nextCursor!})).rejects.toThrow();
  await expect(listExternalSpaces("owner@example.com",{...query,q:"different",cursor:first.nextCursor!})).rejects.toThrow();
});
