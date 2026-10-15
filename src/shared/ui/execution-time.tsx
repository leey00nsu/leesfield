"use client";

import { useSyncExternalStore } from "react";
import { useLocale } from "next-intl";

const terminalStatuses = new Set(["completed", "failed", "cancelled"]);
const activeStatuses = new Set(["pending", "processing", "uploading"]);
let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  now = Date.now();
  if (!timer) {
    timer = setInterval(() => {
      now = Date.now();
      for (const notify of listeners) notify();
    }, 1000);
  }
  listener();
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}
const idleSubscribe = () => () => {};
const snapshot = () => now;
const serverSnapshot = () => 0;

type ExecutionTimeProps = {
  createdAt?: string | null;
  finishedAt?: string | null;
  status?: string;
  className?: string;
};

export function executionElapsedMs(
  createdAt?: string | null,
  finishedAt?: string | null,
  status?: string,
  currentTime = Date.now(),
) {
  if (!createdAt) return null;
  const start = Date.parse(createdAt);
  const terminal = terminalStatuses.has(status ?? "");
  const end = terminal
    ? (finishedAt ? Date.parse(finishedAt) : NaN)
    : activeStatuses.has(status ?? "") ? currentTime : NaN;
  return Number.isFinite(start) && Number.isFinite(end)
    ? Math.max(0, end - start)
    : null;
}

/** One shared clock; terminal and unknown records never run their own timers. */
export function ExecutionTime({createdAt, finishedAt, status, className}: ExecutionTimeProps) {
  const ko = useLocale().startsWith("ko");
  const terminal = terminalStatuses.has(status ?? "");
  const ticking = Boolean(createdAt && Number.isFinite(Date.parse(createdAt))) && activeStatuses.has(status ?? "");
  const currentTime = useSyncExternalStore(ticking ? subscribe : idleSubscribe, snapshot, serverSnapshot);
  const ms = executionElapsedMs(createdAt, finishedAt, status, currentTime);
  if (ms === null) return <span className={className}>{ko ? "시간 미확인" : "Time unavailable"}</span>;
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const duration = ko
    ? (minutes ? minutes + "분 " : "") + (seconds % 60) + "초"
    : (minutes ? minutes + "m " : "") + (seconds % 60) + "s";
  return <span className={className} aria-live="off">
    {duration} {ko ? (terminal ? "소요" : "경과") : (terminal ? "total" : "elapsed")}
  </span>;
}
