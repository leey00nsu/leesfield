export function formatCompactNumber(value: number) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 10_000) {
    return `${Math.round(value / 100) / 10}k`;
  }
  if (value >= 1_000) {
    return `${Math.round(value / 10) / 100}k`;
  }
  return value.toString();
}

export function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

export function formatDuration(ms: number | null) {
  if (ms === null || Number.isNaN(ms)) return "-";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${minutes.toFixed(1)}m`;
  const hours = minutes / 60;
  return `${hours.toFixed(1)}h`;
}

export function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
}

export function formatShortDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

export function createRangeFromDays(days: number) {
  const now = new Date();
  const to = endOfDay(now);
  const from = startOfDay(new Date(now.getTime() - (days - 1) * DAY_MS));
  return { from, to };
}

export function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateInputValue(value: string) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map((segment) => Number(segment));
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

export function createRangeFromMonth(value: string) {
  if (!value) return null;
  const [year, month] = value.split("-").map((segment) => Number(segment));
  if (!year || !month) return null;
  const from = startOfDay(new Date(year, month - 1, 1));
  const to = endOfDay(new Date(year, month, 0));
  return { from, to };
}
