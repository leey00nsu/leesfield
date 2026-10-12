import { NextResponse } from "next/server";
import { JSON_BODY_LIMIT_BYTES, readRouteJsonBody } from "@/server/http/bounded-body";
import { getSession } from "@/server/auth/session";
import { assertSessionMutationOrigin } from "@/server/http/request-origin";
import { ModalApiError } from "@/server/modal-comfyui/client";
import { listModalAdminWorkflows, importModalAdminWorkflow } from "@/server/model-catalog/modal-admin-service";
export const dynamic = "force-dynamic";
async function authorized() {
  const session = await getSession();
  return session.isLoggedIn && Boolean(session.adminEmail);
}
function failure(error: unknown) {
  return NextResponse.json({ message: error instanceof ModalApiError ? error.code : "MODAL_CONTRACT_INVALID" }, { status: 400 });
}
async function getObservedHandler() {
  if (!await authorized()) return NextResponse.json({ message: "UNAUTHORIZED" }, { status: 401 });
  try { return NextResponse.json(await listModalAdminWorkflows(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) {
    logSafeError("http.handler.failed", error, {phase:"request.handle"}); return failure(error); }
}
async function postObservedHandler(request: Request) {
  if (!await authorized()) return NextResponse.json({ message: "UNAUTHORIZED" }, { status: 401 });
  const originError = assertSessionMutationOrigin(request);
  if (originError) return originError;
  try {
    const parsed = await readRouteJsonBody(request, JSON_BODY_LIMIT_BYTES);
    if (!parsed.ok) return NextResponse.json({ message: parsed.code }, { status: parsed.status });
    return NextResponse.json(await importModalAdminWorkflow(parsed.body), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logSafeError("http.handler.failed", error, {phase:"request.handle"}); return failure(error); }
}

import { withRequestObservability } from "@/server/observability/request-observability";
export const GET = withRequestObservability("/api/admin/models/modal-comfyui", getObservedHandler);
export const POST = withRequestObservability("/api/admin/models/modal-comfyui", postObservedHandler);

import { logSafeError } from "@/server/observability/request-observability";
