import { jsonError, ok, requireUser, readJson } from "@/server/http";
import { updateTimezone } from "@/server/auth/service";
import { getSignInMethods } from "@/server/auth/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const user = await requireUser();
    const methods = await getSignInMethods(user.id);
    return ok({ ...user, ...methods });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PATCH(req: Request): Promise<Response> {
  try {
    const user = await requireUser();
    const body = await readJson<{ timezone?: string }>(req);
    if (!body.timezone) return ok(user);
    const updated = await updateTimezone(user.id, body.timezone);
    return ok(updated);
  } catch (err) {
    return jsonError(err);
  }
}
