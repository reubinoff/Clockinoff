import { adminRequestMeta, jsonError, ok, requireAdmin } from "@/server/http";
import { requireUuid } from "@/lib/uuid";
import { blockAdminUser } from "@/server/services/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, { params }: Params): Promise<Response> {
  try {
    const actor = await requireAdmin();
    const { id: raw } = await params;
    const user = await blockAdminUser(actor.id, requireUuid(raw), {
      requestId: adminRequestMeta(req).requestId,
    });
    return ok(user);
  } catch (err) {
    return jsonError(err);
  }
}
