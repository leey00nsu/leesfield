import { z } from "zod";
import { consoleChildQuerySchema, consoleFailedQuerySchema, consoleQuerySchema } from "@/shared/api/job-queue-console-contract";
import { authorizeQueueAdmin, queueAdminFailure } from "./job-queue-admin-http";
import { ConsoleInputError, parseConsoleQuery } from "./job-queue-console-query";
import { getConsoleOverview, listConsoleJobs } from "./job-queue-console-repository";
import { getConsoleJob, getConsoleTimeline, listConsoleActions, listConsoleAttempts, listConsoleDeadLetters, listConsoleFailedJobs, type ConsoleChild } from "./job-queue-console-history";
import { getConsoleCapabilities } from "./job-queue-console-capabilities";

export async function queueConsoleRead(request: Request, resource: "overview" | "jobs" | "job" | "timeline" | "failed-jobs" | "capabilities" | ConsoleChild, id?: string) {
  try {
    const actor = await authorizeQueueAdmin(request);
    if (actor instanceof Response) return actor;
    const params = new URL(request.url).searchParams;
    if (new Set(params.keys()).size !== Array.from(params.keys()).length) throw new ConsoleInputError();
    const raw = Object.fromEntries(params);
    let result: unknown;
    if (resource === "overview") {
      z.object({}).strict().parse(raw);
      result = await getConsoleOverview();
    } else if (resource === "capabilities") {
      z.object({}).strict().parse(raw); z.string().uuid().parse(id);
      result = await getConsoleCapabilities(id!);
    } else if (resource === "job") {
      z.object({}).strict().parse(raw); z.string().uuid().parse(id);
      result = await getConsoleJob(id!);
    } else if (resource === "attempts" || resource === "dead-letters" || resource === "actions") {
      const query = consoleChildQuerySchema.parse(raw); z.string().uuid().parse(id);
      const read = resource === "attempts" ? listConsoleAttempts : resource === "dead-letters" ? listConsoleDeadLetters : listConsoleActions;
      result = await read(id!, query);
    } else if (resource === "failed-jobs") {
      const query = consoleFailedQuerySchema.parse(raw); parseConsoleQuery(query, new Date(), "failed-jobs");
      result = await listConsoleFailedJobs(query);
    } else if (resource === "timeline") {
      const query = consoleQuerySchema.parse(raw); parseConsoleQuery(query, new Date(), "timeline");
      result = await getConsoleTimeline(query);
    } else {
      const query = consoleQuerySchema.parse(raw);
      parseConsoleQuery(query);
      result = await listConsoleJobs(query);
    }
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ConsoleInputError) return Response.json({ message: "INVALID_REQUEST" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    return queueAdminFailure(error);
  }
}
