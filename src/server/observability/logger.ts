import { AsyncLocalStorage } from "node:async_hooks";
import { createLogger, type LogFields } from "@/shared/logging/logger.mjs";

const contexts = new AsyncLocalStorage<LogFields>();
const failureContexts = new WeakMap<object, LogFields>();

export function recordFailureLogContext(error: unknown, fields: LogFields) {
  if (error === null || typeof error !== "object") return;
  const context = { ...contexts.getStore(), ...fields };
  const previous = failureContexts.get(error);
  if (!previous || previous.requestId !== context.requestId)
    failureContexts.set(error, context);
}

export function failureLogContext(error: unknown): LogFields | undefined {
  if (error === null || typeof error !== "object") return undefined;
  const recorded = failureContexts.get(error);
  const activeRequest = contexts.getStore()?.requestId;
  if (!recorded || (activeRequest && recorded.requestId && activeRequest !== recorded.requestId))
    return undefined;
  // Origin details may override the phase, never the current request/job ID.
  return { phase: recorded.phase, provider: recorded.provider, operation: recorded.operation };
}
export const serverLogger = createLogger(() => contexts.getStore() ?? {});

export function withLogContext<T>(fields: LogFields, work: () => T): T {
  return contexts.run({ ...contexts.getStore(), ...fields }, work);
}

/** Preserve the original rejection, recording it before callers translate it. */
export async function loggedOperation<T>(
  fields: LogFields,
  work: () => Promise<T>,
): Promise<T> {
  return withLogContext(fields, async () => {
    try {
      return await work();
    } catch (error) {
      recordFailureLogContext(error, {});
      serverLogger.error("operation.failed", error, failureLogContext(error));
      throw error;
    }
  });
}
