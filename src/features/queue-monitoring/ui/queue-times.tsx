"use client";
import { useLocale, useTranslations } from "next-intl";
import type { ConsoleJob } from "@/shared/api/job-queue-console-contract";

export function consoleInterval(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  const ms = Date.parse(end) - Date.parse(start);
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

export function cycleAdmission(job: ConsoleJob) {
  return job.cycleAdmittedAt ?? (job.cycle === 1 ? job.createdAt : null);
}

export function cycleStart(job: ConsoleJob) {
  if (job.cycleStartedAt !== undefined) return job.cycleStartedAt;
  return job.attempt?.cycle === job.cycle && job.attempt.ordinal === 1 ? job.attempt.startedAt : null;
}

export function waitingUntil(job: ConsoleJob, sampledAt: string) {
  return cycleStart(job) ?? ((job.status === "ready" || job.status === "retry_wait") && (job.attemptCount ?? job.attempt?.ordinal ?? 0) === 0 ? sampledAt : null);
}

export function ConsoleDuration({ start, end }: { start?: string | null; end?: string | null }) {
  const locale = useLocale(), t = useTranslations("queueMonitoring"), ms = consoleInterval(start, end);
  if (ms === null) return <span title={t("unknownTime")}>—</span>;
  const seconds = Math.floor(ms / 1000), minutes = Math.floor(seconds / 60), hours = Math.floor(minutes / 60);
  const format = (value: number, unit: "hour" | "minute" | "second") => new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "narrow" }).format(value);
  return <span className="tabular-nums">{hours ? format(hours, "hour") + " " + format(minutes % 60, "minute") : minutes ? format(minutes, "minute") + " " + format(seconds % 60, "second") : format(seconds, "second")}</span>;
}

export function ConsoleAttemptDuration({ job, sampledAt }: { job: ConsoleJob; sampledAt: string }) {
  const t = useTranslations("queueMonitoring");
  if (job.status === "reconciliation_required") return <span className="text-warning-foreground">{t("remoteFinishUnknown")}</span>;
  return <ConsoleDuration start={job.attempt?.startedAt} end={job.attempt?.finishedAt ?? (job.status === "active" ? sampledAt : null)}/>;
}

export function shortQueueId(id: string) { return id.length > 18 ? id.slice(0, 6) + "…" + id.slice(-6) : id; }
