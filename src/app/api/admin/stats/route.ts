import { z } from "zod";
import { errors } from "@/lib/errors";
import { jsonError, ok, requireAdmin } from "@/server/http";
import { getAdminStats } from "@/server/services/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Query = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(req: Request): Promise<Response> {
  try {
    const actor = await requireAdmin();
    const url = new URL(req.url);
    const parsed = Query.safeParse({
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });
    if (!parsed.success) throw errors.validation("from and to are required");
    const stats = await getAdminStats(actor.timezone, parsed.data.from, parsed.data.to);
    return ok(stats);
  } catch (err) {
    return jsonError(err);
  }
}
