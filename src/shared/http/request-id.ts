export const REQUEST_ID_HEADER = "x-request-id";
const MAX_REQUEST_ID_LENGTH = 96;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;

export function isValidRequestId(value: string | null | undefined): value is string {
  return Boolean(value && value.length <= MAX_REQUEST_ID_LENGTH && REQUEST_ID_PATTERN.test(value));
}

export function createRequestId(): string {
  return crypto.randomUUID();
}

export function requestIdFromValue(value: string | null | undefined): string {
  return isValidRequestId(value) ? value : createRequestId();
}
