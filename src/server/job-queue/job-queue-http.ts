import { Prisma } from "@prisma/client";
import { jsonWithNoStore } from "@/server/http/response";
import { QueueContractError } from "./contracts";

export function queueKnownErrorResponse(error: unknown) {
  if (error instanceof QueueContractError && error.code === "QUEUE_CLEANUP_REQUIRES_OPERATOR")
    return jsonWithNoStore({ message: error.code }, { status: 409 });
  const unavailable = error instanceof QueueContractError && error.code === "QUEUE_PAUSED" ||
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientKnownRequestError && ["P1001", "P1002", "P1008", "P1017", "P2024", "P2028", "P2034"].includes(error.code);
  if (unavailable) return jsonWithNoStore({ message: "QUEUE_UNAVAILABLE" },
    { status: 503, headers: { "Retry-After": "30" } });
  return null;
}
