import { timingSafeEqual } from "node:crypto";
import { hashSubmissionPayload } from "@/server/generation-admission/submission-ledger";
import { z } from "zod";

export function encodePageCursor(ownerEmail: string, query: unknown, position: unknown) {
  const body = Buffer.from(JSON.stringify(position)).toString("base64url");
  return body + "." + hashSubmissionPayload({ ownerEmail, query, body });
}
export function decodePageCursor<T>(cursor: string, ownerEmail: string, query: unknown, schema: z.ZodType<T>): T {
  try {
    const [body, signature, extra] = cursor.split(".");
    const expected = hashSubmissionPayload({ ownerEmail, query, body });
    if (extra || !signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error();
    return schema.parse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
  } catch {
    throw new z.ZodError([{ code: "custom", path: ["cursor"], message: "INVALID_CURSOR" }]);
  }
}
