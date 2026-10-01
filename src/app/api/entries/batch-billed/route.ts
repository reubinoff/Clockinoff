import { jsonError, ok, readJson, requireUser } from "@/server/http";
import { batchSetBilled } from "@/server/services/entries";
import { errors } from "@/lib/errors";
import { isUuid } from "@/lib/uuid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BatchBilledBody {
  ids?: unknown;
  billed?: unknown;
}

export async function POST(req: Request): Promise<Response> {
  try {
    const user = await requireUser();
    const body = await readJson<BatchBilledBody>(req);
    if (typeof body !== "object" || body === null) {
      throw errors.validation("Invalid body");
    }
    if (typeof body.billed !== "boolean") {
      throw errors.validation("billed must be boolean");
    }
    if (!Array.isArray(body.ids)) {
      throw errors.validation("ids must be an array");
    }
    const ids: string[] = [];
    for (const raw of body.ids) {
      // Belt: reject malformed UUIDs at the route boundary so the DB layer
      // never sees them and we return a crisp 400 instead of a 500.
      if (!isUuid(raw)) throw errors.validation("Invalid UUID in ids");
      ids.push(raw);
    }
    const result = await batchSetBilled(user.id, ids, body.billed);
    return ok(result);
  } catch (err) {
    return jsonError(err);
  }
}
