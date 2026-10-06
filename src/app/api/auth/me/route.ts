import { jsonError, ok, requireUser, readJson } from "@/server/http";
import { updateTimezone } from "@/server/auth/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const user = await requireUser();
    return ok(user);
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
