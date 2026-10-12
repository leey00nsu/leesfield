export type LogFields = Record<string, string | number | boolean | null | undefined>;
export type ErrorDiagnostic = {
  type: string;
  code?: string;
  message?: string;
  frames?: string[];
  cause?: ErrorDiagnostic;
  errors?: ErrorDiagnostic[];
  issues?: { code: string; path: (string | number)[] }[];
};
export type Logger = {
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, error: unknown, fields?: LogFields): void;
  log(level: "info" | "warn" | "error", event: string, fields?: LogFields): void;
};
export function serializeError(error: unknown): ErrorDiagnostic;
export function createLogger(context?: () => LogFields): Logger;
export const logger: Logger;
