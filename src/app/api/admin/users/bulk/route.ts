import { isUuid } from "@/lib/uuid";
import type { AdminActionKind } from "@/lib/admin-bulk";
import { errors } from "@/lib/errors";
import { jsonError, ok, readJson, requireAdmin } from "@/server/http";
import { bulkAdminUsers } from "@/server/services/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = new Set<AdminActionKind>(["remove", "block", "unblock", "promote", "demote"]);

interface BulkBody {
  action?: unknown;
  ids?: unknown;
}

export async function POST(req: Request): Promise<Response> {
  try {
    const actor = await requireAdmin();
    const body = await readJson<BulkBody>(req);
    if (typeof body !== "object" || body === null) {
      throw errors.validation("Invalid body");
    }
    if (typeof body.action !== "string" || !ACTIONS.has(body.action as AdminActionKind)) {
      throw errors.validation("Invalid action");
    }
    if (!Array.isArray(body.ids)) {
      throw errors.validation("ids must be an array");
    }
    const ids: string[] = [];
    for (const raw of body.ids) {
      if (!isUuid(raw)) throw errors.validation("Invalid UUID in ids");
      ids.push(raw);
    }
    const result = await bulkAdminUsers(actor.id, body.action as AdminActionKind, ids);
    return ok(result);
  } catch (err) {
    return jsonError(err);
  }
}
