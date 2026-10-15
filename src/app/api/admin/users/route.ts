import { z } from "zod";
import { adminUserSortFromSearchParams } from "@/lib/admin-sort";
import { errors } from "@/lib/errors";
import { jsonError, ok, requireAdmin } from "@/server/http";
import { listAdminUsers } from "@/server/services/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Query = z.object({
  q: z.string().trim().max(254).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
});

export async function GET(req: Request): Promise<Response> {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const parsed = Query.safeParse({
      q: url.searchParams.get("q") ?? undefined,
      page: url.searchParams.get("page") ?? undefined,
    });
    if (!parsed.success) throw errors.validation("Invalid query");
    // Allowlisted here, then again in the service, onto Drizzle columns.
    // Unknown keys, wrong case, injection, `__proto__`, `constructor`,
    // a repeated `sort=`, and very long values become created desc and
    // still return 200.
    const sort = adminUserSortFromSearchParams(url.searchParams);
    const result = await listAdminUsers({
      q: parsed.data.q,
      page: parsed.data.page,
      sort: sort.sort,
      dir: sort.dir,
    });
    return ok(result);
  } catch (err) {
    return jsonError(err);
  }
}
