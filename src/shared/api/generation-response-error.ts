/** Preserve the HTTP rejection before a generation job has been registered. */
export async function generationResponseError(response: Response) {
  const payload = await response.json().catch(() => null);
  const code = typeof payload?.message === "string" ? payload.message : "REQUEST_FAILED";
  const requestId = response.headers.get("x-request-id") ?? payload?.requestId;
  const message = typeof requestId === "string" ? `${code} [${requestId}]` : code;
  return Object.assign(new Error(message), { code, status: response.status, requestId, details: payload });
}
